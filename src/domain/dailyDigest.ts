import type { DailyCell, DailyScarecrow, DailySnapshot, DailyStack } from '../lib/saveDaily';

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
 *   wither. Ripe edamame is the exception the game data names: it withers
 *   into harvestable soybeans. Cultivation kits only grow in autumn (item
 *   text); whether they wither or wait out of season is not in the saves.
 * - A scarecrow keeps crops of its season growing in the 5×5 cells around it
 *   for 28 days, whatever the season. When it is spent, out-of-season field
 *   crops in its range wither (the 40 summer crops of the autumn 28 save).
 * - About half of the empty tilled soil and ridges turn back into plain ground
 *   each night; the save keeps nothing that predicts which.
 */
export const GROWTH_PER_DAY = 100;
export const DAYS_PER_SEASON = 28;
export const FORECAST_DAYS = 7;
export const SCARECROW_DAYS = 28;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const GROWING_FORMS = new Set([1, 4, 5]), REGROWING_FORMS = new Set([4, 5]);
const WITHERED = 2, WITHERED_HARVESTABLE = 9;

export interface CropRule {
  seasons: string[];
  perennial?: { kind: string; bearing_seasons?: string[] } | null;
  /** A ripe plant left past its season withers into something harvestable (edamame turns into soybeans). */
  witheredHarvest?: boolean;
  /** Items and counts of the first harvest. */
  harvest?: Array<[itemId: number, count: number]>;
  /** What a withered plant still gives when picked. */
  withered?: Array<[itemId: number, count: number]>;
  /** Crops that regrow after picking: the turnovers between picks and what each pick yields. */
  regrow?: { days: number; items: Array<[itemId: number, count: number]> };
}
export type CropRules = ReadonlyMap<number, CropRule>;
export interface CellGroup { crop: number; cells: number[] }
export interface HarvestGroup extends CellGroup { kind: 'ripe' | 'withered' | 'shake' }
/** What ends a crop's growing: the season change, or the scarecrow keeping it out of season running out. */
export type StopCause = 'season' | 'scarecrow';
export interface StopGroup extends CellGroup { cause: StopCause }
export interface LostGroup extends StopGroup { days: number; left: number }
/** `daysLeft` counts like the season's: turnovers before it is spent, 0 on its last day. `crops` are the growing cells of its season in range. */
export interface ScarecrowLine { key: string; itemId: number; season: number; daysLeft: number; cells: number[]; crops: number }
export interface MachineOutput { itemId: number; count: number; slots: number; finish?: number }

export interface DailyDigest {
  date: DailySnapshot['date'];
  /** Turnovers left before the season changes; crops must ripen within them. */
  daysLeft: number;
  /** Game hours until the 07:00 turnover for a save made after midnight. */
  hoursToTurnover: number;
  harvest: HarvestGroup[];
  forecast: Array<{ days: number; groups: CellGroup[] }>;
  /** Crops that stop before they ripen, and ripe field crops that wither at tomorrow's turnover unless harvested today. */
  seasonEnd: { lost: LostGroup[]; witherTomorrow: StopGroup[] };
  scarecrows: ScarecrowLine[];
  chores: { water: number[]; withered: CellGroup[]; spentScarecrows: Array<{ key: string; itemId: number; cells: number[] }>; hungry: number; shipping: number };
  machines: { done: MachineOutput[]; running: MachineOutput[]; idle: Array<{ itemId: number; machines: number }>; freeSlots: number };
}

/**
 * What today's harvest brings: each ripe crop's pick (the regrow pick for one
 * picked before), what withered plants still give, and the fruit each tree
 * drops when shaken. `fruit` names a fruit tree's fruit item.
 */
export function harvestToday(cells: DailyCell[], groups: HarvestGroup[], crops: CropRules, fruit: (crop: number) => number | undefined): Map<number, number> {
  const cellOf = new Map(cells.map((cell) => [cell.id, cell]));
  const result = new Map<number, number>();
  const add = (itemId: number, count: number) => { if (count > 0) result.set(itemId, (result.get(itemId) ?? 0) + count); };
  for (const group of groups) {
    const rule = crops.get(group.crop), item = group.kind === 'shake' ? fruit(group.crop) : undefined;
    for (const cell of group.cells.flatMap((id) => cellOf.get(id) ?? [])) {
      if (group.kind === 'shake') { if (item) add(item, cell.shake ?? 0); continue; }
      const items = group.kind === 'withered' ? rule?.withered : REGROWING_FORMS.has(cell.form) ? rule?.regrow?.items : rule?.harvest;
      for (const [itemId, count] of items ?? []) add(itemId, count);
    }
  }
  return result;
}

/** Soil that needs watering every day for the crop on it to grow. */
export const needsWater = (cell: Pick<DailyCell, 'soil'>) => cell.soil === 1 || cell.soil === 2;
export const daysToRipe = (cell: Pick<DailyCell, 'growth' | 'maximum'>) => Math.ceil(Math.max(0, cell.maximum - cell.growth) / GROWTH_PER_DAY);

export type CellRow = { crop: number; cell: number };
type StopRow = CellRow & { cause: StopCause; left: number };
function byCrop(rows: CellRow[]): CellGroup[] {
  const groups = new Map<number, number[]>();
  for (const { crop, cell } of rows) {
    const cells = groups.get(crop);
    if (cells) cells.push(cell); else groups.set(crop, [cell]);
  }
  return [...groups].map(([crop, cells]) => ({ crop, cells })).sort((a, b) => b.cells.length - a.cells.length || a.crop - b.crop);
}

/** Group stopping crops by crop, cause and turnovers left, so each row names one deadline. */
function byStop(rows: StopRow[]): Array<StopGroup & { left: number }> {
  const groups = new Map<string, StopRow[]>();
  for (const row of rows) {
    const key = `${row.crop}:${row.cause}:${row.left}`;
    groups.set(key, [...groups.get(key) ?? [], row]);
  }
  return [...groups.values()].map((group) => ({ crop: group[0].crop, cause: group[0].cause, left: group[0].left, cells: group.map((row) => row.cell) }))
    .sort((a, b) => b.cells.length - a.cells.length || a.crop - b.crop);
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

/**
 * Turnovers a seasonal crop still grows at before it stops, and what stops it:
 * the season change, unless an active scarecrow of one of its seasons covers
 * the cell for longer. Infinity when it also grows next season.
 */
export function growingTurnovers(rule: CropRule, date: DailySnapshot['date'], covering: DailyScarecrow[] = []): { left: number; cause: StopCause } {
  let best: { left: number; cause: StopCause } | undefined = !rule.seasons.includes(SEASONS[date.season]) ? undefined
    : { left: rule.seasons.includes(SEASONS[(date.season + 1) % 4]) ? Infinity : DAYS_PER_SEASON - date.day, cause: 'season' };
  for (const scarecrow of covering) {
    // Spent at the turnover that brings `days` to 28, so the crop grows at the ones before it.
    const until = SCARECROW_DAYS - 1 - scarecrow.days;
    if (!scarecrow.spent && rule.seasons.includes(SEASONS[scarecrow.season]) && (!best || until > best.left)) best = { left: until, cause: 'scarecrow' };
  }
  return best ?? { left: 0, cause: 'season' };
}

/** The active and spent scarecrows standing over each cell. */
function scarecrowCover(snapshot: DailySnapshot): Map<number, DailyScarecrow[]> {
  const covering = new Map<number, DailyScarecrow[]>();
  for (const scarecrow of snapshot.scarecrows) for (const id of scarecrow.cells) covering.set(id, [...covering.get(id) ?? [], scarecrow]);
  return covering;
}

/**
 * Growing field crops and kits that ripen before they stop: turnovers to ripe
 * (0 when ripe now) and turnovers left to grow. Fruit trees and shrubs are left
 * out; their yields are not modelled here.
 */
export function ripening(snapshot: DailySnapshot, crops: CropRules): Array<CellRow & { days: number; left: number }> {
  const covering = scarecrowCover(snapshot), season = SEASONS[snapshot.date.season];
  return snapshot.cells.flatMap((cell) => {
    const rule = cell.crop ? crops.get(cell.crop) : undefined;
    if (!rule || rule.perennial || !GROWING_FORMS.has(cell.form) || cell.maximum <= 0) return [];
    const { left, cause } = growingTurnovers(rule, snapshot.date, covering.get(cell.id));
    const days = daysToRipe(cell);
    if (days && cause === 'season' && !rule.seasons.includes(season)) return [];
    return days > left ? [] : [{ crop: cell.crop, cell: cell.id, days, left }];
  });
}

/** Fruit trees and shrubs on the farm, with turnovers until each is grown or bears again (0: now). */
export function orchard(snapshot: DailySnapshot, crops: CropRules): Array<CellRow & { days: number }> {
  return snapshot.cells.flatMap((cell) => {
    const rule = cell.crop ? crops.get(cell.crop) : undefined;
    return rule?.perennial && GROWING_FORMS.has(cell.form) && cell.maximum > 0 ? [{ crop: cell.crop, cell: cell.id, days: daysToRipe(cell) }] : [];
  });
}

export function buildDailyDigest(snapshot: DailySnapshot, crops: CropRules): DailyDigest {
  const { date } = snapshot;
  const season = SEASONS[date.season];
  const daysLeft = DAYS_PER_SEASON - date.day;
  const harvest: Record<HarvestGroup['kind'], CellRow[]> = { ripe: [], withered: [], shake: [] };
  const forecast: Array<CellRow & { days: number }> = [];
  const lost: Array<StopRow & { days: number }> = [];
  const witherTomorrow: StopRow[] = [], withered: CellRow[] = [];
  const water: number[] = [];
  const covering = scarecrowCover(snapshot);
  const protectedCells = new Map<string, number>();

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
    const { left, cause } = perennial ? { left: Infinity, cause: 'season' as const } : growingTurnovers(rule, date, covering.get(cell.id));
    for (const scarecrow of covering.get(cell.id) ?? []) if (rule.seasons.includes(SEASONS[scarecrow.season])) protectedCells.set(scarecrow.key, (protectedCells.get(scarecrow.key) ?? 0) + 1);
    if (!days) {
      harvest.ripe.push(row);
      // Field crops wither when they stop; kits are only known to stop growing.
      if (left === 0 && cell.soil > 0 && !rule.witheredHarvest) witherTomorrow.push({ ...row, cause, left });
      continue;
    }
    // Out of season with no scarecrow: a kit waits for autumn; field crops have already withered.
    if (cause === 'season' && !rule.seasons.includes(season)) continue;
    if (days > left) { lost.push({ ...row, cause, left, days }); continue; }
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

  return {
    date, daysLeft, hoursToTurnover: date.hour < 7 ? 7 - date.hour - (date.minute ? 1 : 0) : 0,
    harvest: (Object.keys(harvest) as HarvestGroup['kind'][]).flatMap((kind) => byCrop(harvest[kind]).map((group) => ({ ...group, kind }))).sort((a, b) => b.cells.length - a.cells.length),
    forecast: [...new Set(forecast.map((row) => row.days))].sort((a, b) => a - b).map((days) => ({ days, groups: byCrop(forecast.filter((row) => row.days === days)) })),
    seasonEnd: {
      lost: byStop(lost).map((group) => ({ ...group, days: Math.min(...lost.filter((row) => group.cells.includes(row.cell)).map((row) => row.days)) })),
      witherTomorrow: byStop(witherTomorrow).map(({ crop, cells, cause }) => ({ crop, cells, cause })),
    },
    scarecrows: snapshot.scarecrows.filter((scarecrow) => !scarecrow.spent).map(({ key, itemId, season, days, cells }) => ({ key, itemId, season, daysLeft: SCARECROW_DAYS - 1 - days, cells, crops: protectedCells.get(key) ?? 0 }))
      .sort((a, b) => a.daysLeft - b.daysLeft),
    chores: {
      water, withered: byCrop(withered), spentScarecrows: snapshot.scarecrows.filter((scarecrow) => scarecrow.spent).map(({ key, itemId, cells }) => ({ key, itemId, cells })),
      hungry: snapshot.animals.total - snapshot.animals.fed, shipping: snapshot.shipping.reduce((sum, stack) => sum + stack.count, 0),
    },
    machines: {
      done: sumOutputs(done).sort((a, b) => b.slots - a.slots),
      running: sumOutputs(running).sort((a, b) => a.finish! - b.finish!),
      idle: [...idle].map(([itemId, machines]) => ({ itemId, machines })).sort((a, b) => b.machines - a.machines),
      freeSlots,
    },
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
