import type { DailyCell, DailySnapshot, DailyStack } from '../lib/saveDaily';

/**
 * Daily rules, checked against five consecutive saves of one slot (autumn 28
 * to winter 2):
 * - Crops on watered tilled soil or ridges gain exactly 100 growth points at
 *   the 07:00 turnover. Cultivation kits and trees grow the same without water.
 *   The saves have no dry field crop to show what a missed watering costs, so
 *   forecasts count watered days and assume a dry day adds nothing. Paddies
 *   are taken not to need water.
 * - Watering and animal feeding reset at the turnover.
 * - At the season change, field crops that do not grow in the new season
 *   wither. Cultivation kits and trees keep growing. Withered crops stay until
 *   cleared. Ripe edamame is the exception the game data names: it withers
 *   into harvestable soybeans.
 * - About half of the empty tilled soil and ridges turn back into plain ground
 *   each night; the save keeps nothing that predicts which.
 */
export const GROWTH_PER_DAY = 100;
export const DAYS_PER_SEASON = 28;
export const FORECAST_DAYS = 7;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const GROWING_FORMS = new Set([1, 4, 5]);
const WITHERED = 2, WITHERED_HARVESTABLE = 9;

export interface CropRule {
  seasons: string[];
  perennial?: { kind: string; bearing_seasons?: string[] } | null;
  /** A ripe plant left past its season withers into something harvestable (edamame turns into soybeans). */
  witheredHarvest?: boolean;
}
export type CropRules = ReadonlyMap<number, CropRule>;
export interface CellGroup { crop: number; cells: number[] }
export interface HarvestGroup extends CellGroup { kind: 'ripe' | 'withered' | 'shake' }
export interface LostGroup extends CellGroup { days: number }
export interface DeliveryLine { bundleId: number; index: number; itemId: number; rank: number; remain: number; have: number }
export interface MachineOutput { itemId: number; count: number; slots: number; finish?: number }

export interface DailyDigest {
  date: DailySnapshot['date'];
  /** Turnovers left before the season changes; crops must ripen within them. */
  daysLeft: number;
  /** Game hours until the 07:00 turnover for a save made after midnight. */
  hoursToTurnover: number;
  harvest: HarvestGroup[];
  forecast: Array<{ days: number; groups: CellGroup[] }>;
  seasonEnd: { lost: LostGroup[]; witherAtChange: CellGroup[] };
  chores: { water: number[]; withered: CellGroup[]; hungry: number; shipping: number };
  machines: { done: MachineOutput[]; running: MachineOutput[]; idle: Array<{ itemId: number; machines: number }>; freeSlots: number };
  deliveries: { open: boolean; ready: DeliveryLine[]; missing: DeliveryLine[] };
}

/** Soil that needs watering every day for the crop on it to grow. */
export const needsWater = (cell: Pick<DailyCell, 'soil'>) => cell.soil === 1 || cell.soil === 2;
export const daysToRipe = (cell: Pick<DailyCell, 'growth' | 'maximum'>) => Math.ceil(Math.max(0, cell.maximum - cell.growth) / GROWTH_PER_DAY);

type CellRow = { crop: number; cell: number };
function byCrop(rows: CellRow[]): CellGroup[] {
  const groups = new Map<number, number[]>();
  for (const { crop, cell } of rows) {
    const cells = groups.get(crop);
    if (cells) cells.push(cell); else groups.set(crop, [cell]);
  }
  return [...groups].map(([crop, cells]) => ({ crop, cells })).sort((a, b) => b.cells.length - a.cells.length || a.crop - b.crop);
}

function sumOutputs(rows: Array<{ itemId: number; count: number; finish?: number }>): MachineOutput[] {
  const groups = new Map<number, MachineOutput>();
  for (const row of rows) {
    const group = groups.get(row.itemId) ?? groups.set(row.itemId, { itemId: row.itemId, count: 0, slots: 0, ...(row.finish !== undefined ? { finish: row.finish } : {}) }).get(row.itemId)!;
    group.count += row.count;
    group.slots++;
    if (row.finish !== undefined) group.finish = Math.min(group.finish ?? Infinity, row.finish);
  }
  return [...groups.values()];
}

export function buildDailyDigest(snapshot: DailySnapshot, crops: CropRules): DailyDigest {
  const { date } = snapshot;
  const season = SEASONS[date.season], nextSeason = SEASONS[(date.season + 1) % 4];
  const daysLeft = DAYS_PER_SEASON - date.day;
  const harvest: Record<HarvestGroup['kind'], CellRow[]> = { ripe: [], withered: [], shake: [] };
  const forecast: Array<CellRow & { days: number }> = [];
  const lost: Array<CellRow & { days: number }> = [];
  const witherAtChange: CellRow[] = [], withered: CellRow[] = [];
  const water: number[] = [];

  for (const cell of snapshot.cells) {
    const rule = cell.crop ? crops.get(cell.crop) : undefined;
    if (!rule) continue;
    const row = { crop: cell.crop, cell: cell.id };
    if (cell.form === WITHERED) { withered.push(row); continue; }
    if (cell.form === WITHERED_HARVESTABLE) { harvest.withered.push(row); continue; }
    if (!GROWING_FORMS.has(cell.form) || cell.maximum <= 0) continue;
    const perennial = rule.perennial;
    const days = daysToRipe(cell);
    if (perennial?.kind === 'fruit_tree') {
      // A grown fruit tree is shaken for fruit, and only bears in its seasons (greenhouse trees list all four).
      if (!days && perennial.bearing_seasons?.includes(season)) harvest.shake.push(row);
      continue;
    }
    // Field crops wither at the season change unless they also grow next season.
    const withers = !perennial && cell.soil > 0 && !rule.seasons.includes(nextSeason);
    if (!days) {
      harvest.ripe.push(row);
      if (withers && !daysLeft && !rule.witheredHarvest) witherAtChange.push(row);
      continue;
    }
    if (withers && days > daysLeft) { lost.push({ ...row, days }); continue; }
    if (needsWater(cell) && !cell.wet) water.push(cell.id);
    if (days <= FORECAST_DAYS) forecast.push({ ...row, days });
  }

  const done: Array<{ itemId: number; count: number }> = [], running: Array<{ itemId: number; count: number; finish: number }> = [];
  const idle = new Map<number, number>();
  let freeSlots = 0;
  for (const machine of snapshot.machines) {
    let used = 0;
    for (const job of machine.jobs) {
      if (!job.output || !job.seconds) { freeSlots++; continue; }
      used++;
      if (job.remaining > 0) running.push({ itemId: job.output, count: job.count, finish: snapshot.seconds + job.remaining });
      else done.push({ itemId: job.output, count: job.count });
    }
    if (!used) { idle.set(machine.itemId, (idle.get(machine.itemId) ?? 0) + 1); freeSlots -= machine.jobs.length; }
  }

  const lines = snapshot.deliveries.filter((row) => row.remain > 0).map((row) => ({
    bundleId: row.bundleId, index: row.index, itemId: row.itemId, rank: row.rank, remain: row.remain, have: held(snapshot.held, row.itemId, row.rank),
  }));

  return {
    date, daysLeft, hoursToTurnover: date.hour < 7 ? 7 - date.hour - (date.minute ? 1 : 0) : 0,
    harvest: (Object.keys(harvest) as HarvestGroup['kind'][]).flatMap((kind) => byCrop(harvest[kind]).map((group) => ({ ...group, kind }))).sort((a, b) => b.cells.length - a.cells.length),
    forecast: [...new Set(forecast.map((row) => row.days))].sort((a, b) => a - b).map((days) => ({ days, groups: byCrop(forecast.filter((row) => row.days === days)) })),
    seasonEnd: {
      lost: byCrop(lost).map((group) => ({ ...group, days: Math.min(...lost.filter((row) => row.crop === group.crop).map((row) => row.days)) })),
      witherAtChange: byCrop(witherAtChange),
    },
    chores: { water, withered: byCrop(withered), hungry: snapshot.animals.total - snapshot.animals.fed, shipping: snapshot.shipping.reduce((sum, stack) => sum + stack.count, 0) },
    machines: {
      done: sumOutputs(done).sort((a, b) => b.slots - a.slots),
      running: sumOutputs(running).sort((a, b) => a.finish! - b.finish!),
      idle: [...idle].map(([itemId, machines]) => ({ itemId, machines })).sort((a, b) => b.machines - a.machines),
      freeSlots,
    },
    deliveries: { open: snapshot.deliveriesOpen, ready: lines.filter((line) => line.have >= line.remain), missing: lines.filter((line) => line.have < line.remain) },
  };
}

/** Deliveries accept the required quality or better. */
export function held(stacks: DailyStack[], itemId: number, rank: number): number {
  return stacks.reduce((sum, stack) => sum + (stack.itemId === itemId && stack.rank >= rank ? stack.count : 0), 0);
}

export interface LandSummary { area: number; planted: number; tilled: number; plain: number; wild: number }

/** Count the farm area: planted cells, tilled soil waiting for seeds, and ground that needs tilling again. */
export function landSummary(cells: DailyCell[], area: ReadonlySet<number>): LandSummary {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const summary: LandSummary = { area: area.size, planted: 0, tilled: 0, plain: 0, wild: 0 };
  for (const id of area) {
    const cell = byId.get(id);
    if (cell?.crop) summary.planted++;
    else if (cell?.wild) summary.wild++;
    else if (cell?.soil) summary.tilled++;
    else summary.plain++;
  }
  return summary;
}
