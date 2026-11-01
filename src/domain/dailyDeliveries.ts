import type { DailyBundleSpec } from '../data/dailyPayload';
import type { DailyBundle, DailyStack } from '../lib/saveDaily';
import { itemSources, type ItemSource, type SourceContext } from './dailySources';
import { qualityProgress, type QualityProgress } from './dailyQuality';

/**
 * Which delivery lists to hand in today. A save keeps what is still owed for
 * every list: fox shrine offerings, the five shrine repairs and the village
 * head's catalog, but the game only takes a few of them at a time (see
 * `DeliveryGates`). Items held in the backpack and storage chests are shared
 * between the lists it takes now, so they are handed out in order: first to
 * lists they can finish today, then to unfinished lists, which keep them back
 * from selling and processing.
 */
export interface DeliveryGates {
  /** The village head's catalog opens with a story flag. */
  catalogOpen: boolean;
  /**
   * The fox shrine turns up at night once chapter 1 is over and takes this season's offerings only, the first
   * `clears + 1` of them: CTask_Menu_Bundle::initialize_Inner stops its slot loop for fox shrine groups at
   * GAME_VALUE_HORROR_INARI_SHRINE_CLEAR_COUNT + 1. After a clear it stays away until the month (season) turns,
   * and after the fourth for good, so the offerings it never showed can no longer be handed in.
   */
  shrine: { clears: number; open: boolean; gone: boolean };
  /**
   * The shrine toolbox takes the repair after the ones done (GAME_VALUE_SHRINE_LEVEL) while gimmick_shrine puts it out.
   * `last` is the last repair it can ever take: 4, or 5 when GAME_FLAG_SHRINE_REPAIR_ENABLE_05 (set by nothing in
   * build 25640656) or あんしん暮し mode lets it. Chapter 6 sets the level to 5 and 6, past every repair still owed.
   */
  repair: { level: number; open: boolean; last: number };
}
type Availability = 'open' | 'later' | 'never';
function availability(spec: DailyBundleSpec, gates: DeliveryGates, season: number): Availability {
  if (spec.list === 'catalog') return gates.catalogOpen ? 'open' : 'later';
  if (spec.list === 'repair') {
    const { level, open, last } = gates.repair, stage = spec.stage!;
    if (stage <= level || stage > last) return 'never';
    return open && stage === level + 1 ? 'open' : 'later';
  }
  if (gates.shrine.gone) return 'never';
  return gates.shrine.open && spec.season === season && spec.slot! <= gates.shrine.clears + 1 ? 'open' : 'later';
}

/** `quality` is set when the crop's harvest count does not give the grade the line asks for yet. */
export interface DeliveryLine { itemId: number; rank: number; remain: number; have: number; sources: ItemSource[]; quality?: QualityProgress }
export interface DeliveryPlan {
  spec: DailyBundleSpec;
  lines: DeliveryLine[];
  /** Every item is in hand: hand it in today. */
  ready: boolean;
  /** Turnovers until the last missing item can be had, when every missing item has a dated source this season. */
  eta?: number;
  /** Some missing item has no source this season: it is out of season, or where it comes from is unknown. */
  offSeason?: boolean;
}
export interface KeepLine { itemId: number; rank: number; count: number; bundles: number[] }
export interface DeliveryDigest {
  ready: DeliveryPlan[];
  /** Unfinished lists the game takes now, in priority order: the current repair, the fox shrine's offerings, the catalog. */
  pending: DeliveryPlan[];
  done: number;
  /** Lists done or still to be offered; ones the game can no longer offer are left out. */
  total: number;
  gates: DeliveryGates;
  /** Held items set aside for unfinished lists. */
  keep: KeepLine[];
}

type Pool = Map<number, number[]>;
const RANKS = 5;

function pool(stacks: DailyStack[]): Pool {
  const result: Pool = new Map();
  for (const stack of stacks) {
    const ranks = result.get(stack.itemId) ?? result.set(stack.itemId, Array<number>(RANKS).fill(0)).get(stack.itemId)!;
    ranks[Math.min(Math.max(stack.rank, 0), RANKS - 1)] += stack.count;
  }
  return result;
}
/** Deliveries accept the required quality or better. */
const available = (items: Pool, itemId: number, rank: number) => (items.get(itemId) ?? []).slice(rank).reduce((sum, count) => sum + count, 0);
/** Hand over the lowest qualities that qualify, keeping better ones for lists that ask for them. */
function take(items: Pool, itemId: number, rank: number, count: number): number {
  const ranks = items.get(itemId);
  let taken = 0;
  for (let index = rank; ranks && index < RANKS && taken < count; index++) {
    const used = Math.min(ranks[index], count - taken);
    ranks[index] -= used;
    taken += used;
  }
  return taken;
}

/**
 * When a missing item can be had this season, in turnovers: ripe crops, fish and wild plants in season.
 * Fish that do not bite before the turnover (day fish after midnight) wait a day, if the season has one left.
 */
function sourceDays(source: ItemSource, short: number, daysLeft: number): number | undefined {
  if (source.kind === 'field') return source.ready[Math.ceil(short / source.each) - 1];
  if (source.kind === 'fish') return source.today ? 0 : source.now && daysLeft > 0 ? 1 : undefined;
  if (source.kind === 'wild' && source.now) return 0;
  if (source.kind === 'animal' && source.owned) return 0;
  // A grown fruit tree bears one fruit a day (perennial.fruit_per_day) while in season.
  if (source.kind === 'orchard' && source.now && source.grown && source.bearing.kind === 'fruit_tree') return Math.ceil(short / source.grown) - 1;
  return undefined;
}

/** Sources that give the grade a line asks for: crops harvest below it until their count reaches it. */
const GROWN = new Set<ItemSource['kind']>(['field', 'plant', 'orchard']);
const supply = (line: DeliveryLine) => line.quality ? line.sources.filter((source) => !GROWN.has(source.kind)) : line.sources;

/** Whether a source can still supply the item this season, dated or not: sowing, felling and machines count. */
function inSeason(source: ItemSource, daysLeft: number): boolean {
  if (source.kind === 'fish') return source.today || source.now && daysLeft > 0;
  return 'now' in source ? source.now : true;
}

export function planDeliveries(specs: DailyBundleSpec[], progress: DailyBundle[], held: DailyStack[], context: SourceContext, gates: DeliveryGates): DeliveryDigest {
  const owed = new Map(progress.map((bundle) => [bundle.bundleId, bundle.items.filter((item) => item.remain > 0)]));
  const saved = specs.filter((spec) => owed.has(spec.id));
  const finished = saved.filter((spec) => !owed.get(spec.id)!.length);
  const unfinished = saved.filter((spec) => owed.get(spec.id)!.length).map((spec) => ({ spec, state: availability(spec, gates, context.season) }));
  const order = (spec: DailyBundleSpec) => ({ repair: 0, shrine: 1, catalog: 2 })[spec.list];
  // Within one priority, lists that ask for quality go first so plain lists do not use up their items.
  const strictness = (spec: DailyBundleSpec) => Math.max(0, ...owed.get(spec.id)!.map((row) => row.rank));
  const candidates = unfinished.filter((entry) => entry.state === 'open').map((entry) => entry.spec)
    .sort((a, b) => order(a) - order(b) || strictness(b) - strictness(a) || a.id - b.id);

  const items = pool(held);
  const ready: DeliveryPlan[] = [], pending: DeliveryPlan[] = [];
  const line = (item: { itemId: number; rank: number; remain: number }, have: number): DeliveryLine => {
    if (have >= item.remain) return { ...item, have, sources: [] };
    const quality = qualityProgress(item.itemId, item.rank, context);
    return { ...item, have, sources: itemSources(item.itemId, context), ...(quality ? { quality } : {}) };
  };
  for (const spec of candidates) {
    const rows = owed.get(spec.id)!;
    if (!rows.every((row) => available(items, row.itemId, row.rank) >= row.remain)) continue;
    for (const row of rows) take(items, row.itemId, row.rank, row.remain);
    ready.push({ spec, ready: true, lines: rows.map((row) => line(row, row.remain)) });
  }
  const keep = new Map<string, KeepLine>();
  for (const spec of candidates) {
    if (ready.some((plan) => plan.spec === spec)) continue;
    const lines = owed.get(spec.id)!.map((row) => {
      const have = take(items, row.itemId, row.rank, row.remain);
      if (have) {
        const key = `${row.itemId}:${row.rank}`, entry = keep.get(key) ?? keep.set(key, { itemId: row.itemId, rank: row.rank, count: 0, bundles: [] }).get(key)!;
        entry.count += have;
        entry.bundles.push(spec.id);
      }
      return line(row, have);
    });
    const days = lines.filter((row) => row.have < row.remain).map((row) => {
      const known = supply(row).map((source) => sourceDays(source, row.remain - row.have, context.daysLeft)).filter((value): value is number => value !== undefined);
      return known.length ? Math.min(...known) : undefined;
    });
    const offSeason = lines.some((row) => row.have < row.remain && !supply(row).some((source) => inSeason(source, context.daysLeft)));
    pending.push({ spec, ready: false, lines, ...(days.every((value) => value !== undefined) ? { eta: Math.max(...days as number[]) } : {}), ...(offSeason ? { offSeason } : {}) });
  }
  const total = finished.length + unfinished.filter((entry) => entry.state !== 'never').length;
  return { ready, pending, done: finished.length, total, gates, keep: [...keep.values()] };
}

/** Held items left free once deliveries take theirs: what processing and crafting may use. */
export function freeAfterDeliveries(held: DailyStack[], digest: Pick<DeliveryDigest, 'ready' | 'keep'>): Map<number, number> {
  const free = new Map<number, number>();
  for (const stack of held) free.set(stack.itemId, (free.get(stack.itemId) ?? 0) + stack.count);
  const spend = (itemId: number, count: number) => free.set(itemId, Math.max(0, (free.get(itemId) ?? 0) - count));
  for (const plan of digest.ready) for (const row of plan.lines) spend(row.itemId, row.remain);
  for (const row of digest.keep) spend(row.itemId, row.count);
  return free;
}
