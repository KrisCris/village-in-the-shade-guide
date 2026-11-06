import type { DailyQuality } from '../data/dailyPayload';
import { DAYS_PER_SEASON, SCARECROW_DAYS, SEASONS } from './dailyDigest';
import type { SourceContext } from './dailySources';

/**
 * How far a crop is from the grade a delivery asks for. A crop's harvests come
 * out at the best grade whose harvest count is reached; once a 金星 crop scores
 * S at the crop fair and is named, every harvest of it is 品牌. Fertiliser
 * chances are left out.
 */
export interface QualityProgress {
  crop: number;
  /** The grade harvests come out at now: 0 plain, 1 铜星, 2 银星, 3 金星, 4 品牌. */
  grade: number;
  harvested: number;
  /** The count the line's grade needs; 品牌 needs 金星 first. */
  target: number;
  plant?: QualityPlant;
}
/**
 * What harvests the rest of the count: seeds sown `today` or in `seasons`, or fruit trees and shrubs
 * bearing for one season, `have` of them already on the farm. A crop that needs longer than its seasons
 * (rice: 50 days in spring) also takes `scarecrow` of the last season, placed on its last day.
 */
export type QualityPlant =
  | { kind: 'sow'; seed: number; seeds: number; today: boolean; seasons: number[]; scarecrow?: { item: number; count: number } }
  | { kind: 'perennial'; plants: number; have: number };

/** ITEM_ID_TOOL_SCARECROW_SPRING; the summer, autumn and winter ones follow it. */
const SCARECROW_ITEM = 662000;
/** A scarecrow covers the 5×5 cells around it, its own cell left out. */
const SCARECROW_CELLS = 24;

/**
 * The grade an item harvests at now: 4 when its crop is named, else the
 * thresholds its harvest count has reached; 0 for items with no grades.
 */
export function harvestGrade(itemId: number, context: Pick<SourceContext, 'payload' | 'harvested' | 'brands'>): number {
  const entry = context.payload.quality?.[itemId];
  if (!entry) return 0;
  const harvested = context.harvested?.[entry.count] ?? 0;
  return context.brands?.has(entry.count) ? 4 : entry.ranks.filter((count) => harvested >= count).length;
}

/**
 * How `count` pieces of an item picked today split by grade, lowest first. Each plant takes the grade
 * of the count before it is picked, so a field that crosses a threshold partway comes out at two
 * grades, and one plant's `pick` pieces never split. Items that share a count are each split as if
 * picked alone.
 */
export function harvestGrades(itemId: number, count: number, context: Pick<SourceContext, 'payload' | 'harvested' | 'brands'>): Array<{ rank: number; count: number }> {
  const entry = context.payload.quality?.[itemId];
  if (count <= 0) return [];
  if (!entry || context.brands?.has(entry.count)) return [{ rank: entry ? 4 : 0, count }];
  const before = context.harvested?.[entry.count] ?? 0, pick = entry.pick ?? 1, parts: Array<{ rank: number; count: number }> = [];
  for (let rank = harvestGrade(itemId, context), picked = 0; picked < count; rank++) {
    // ranks[rank] is the count the next grade needs; the plants picked before it is reached keep this grade.
    const next = rank < 3 ? entry.ranks[rank] : Infinity;
    const take = Math.min(count - picked, Math.max(0, Math.ceil((next - before - picked) / pick) * pick));
    if (take > 0) parts.push({ rank, count: take });
    picked += take;
  }
  return parts;
}

/** Harvests of `crop` that can fill a line at `rank`, undefined when its count already gives that grade or it has none. */
export function qualityProgress(itemId: number, rank: number, context: SourceContext): QualityProgress | undefined {
  const entry = context.payload.quality?.[itemId];
  if (!entry || rank <= 0) return undefined;
  const harvested = context.harvested?.[entry.count] ?? 0;
  const grade = harvestGrade(itemId, context);
  if (grade >= rank) return undefined;
  const target = entry.ranks[Math.min(rank, 3) - 1];
  const remaining = target - harvested;
  const plant = remaining > 0 ? plantFor(entry, remaining, context) : undefined;
  return { crop: entry.crop, grade, harvested, target, ...(plant ? { plant } : {}) };
}

function plantFor(entry: DailyQuality, remaining: number, context: SourceContext): QualityPlant | undefined {
  if (entry.season) {
    const have = context.orchard?.filter((row) => row.crop === entry.crop).length ?? 0;
    return { kind: 'perennial', plants: Math.ceil(remaining / entry.season), have };
  }
  const rule = context.crops.get(entry.crop), seed = context.payload.seeds?.[entry.crop], growth = seed?.days;
  if (!entry.pick || !rule || !seed || !growth) return undefined;
  const seasons = new Set(rule.seasons.map((season) => SEASONS.indexOf(season)).filter((season) => season >= 0));
  // The seasons a crop sown in `from` keeps growing through before it withers.
  const run = (from: number) => {
    const list: number[] = [];
    for (let season = from; seasons.has(season) && list.length < 4; season = (season + 1) % 4) list.push(season);
    return list;
  };
  // Pieces one seed adds over `days` turnovers: one harvest, or every regrowth for crops that regrow.
  const perSeed = (days: number) => days < growth ? 0 : rule.regrow ? entry.pick! * (1 + Math.floor((days - growth) / rule.regrow.days)) : entry.pick!;
  // Turnovers a scarecrow placed on the last day keeps its season's crops growing past the change.
  const extra = SCARECROW_DAYS - 1;
  const sow = (days: number, today: boolean, list: number[]): QualityPlant | undefined => {
    const plain = perSeed(days);
    // Only crops that cannot ripen within their seasons even from day 1 get a scarecrow.
    const long = !plain && !perSeed(DAYS_PER_SEASON * list.length - 1) && perSeed(days + extra);
    if (!plain && !long) return undefined;
    const seeds = Math.ceil(remaining / (plain || perSeed(days + extra)));
    return { kind: 'sow', seed: seed.seed, seeds, today, seasons: list,
      ...long ? { scarecrow: { item: SCARECROW_ITEM + list[list.length - 1], count: Math.ceil(seeds / SCARECROW_CELLS) } } : {} };
  };
  const now = run(context.season);
  const today = now.length ? sow(context.daysLeft + DAYS_PER_SEASON * (now.length - 1), true, now) : undefined;
  if (today) return today;
  // Otherwise from day 1 of the next season that starts the crop's run.
  const next = [1, 2, 3, 4].map((step) => (context.season + step) % 4).find((season) => seasons.has(season) && (seasons.size === 4 || !seasons.has((season + 3) % 4)));
  if (next === undefined) return undefined;
  const later = run(next);
  return sow(DAYS_PER_SEASON * later.length - 1, false, later);
}
