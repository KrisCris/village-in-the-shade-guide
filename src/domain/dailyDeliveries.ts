import type { DailyBundleSpec } from '../data/dailyPayload';
import type { DailyBundle, DailyStack } from '../lib/saveDaily';
import { itemSources, type ItemSource, type SourceContext } from './dailySources';

/**
 * Which delivery lists to hand in today. A save keeps what is still owed for
 * every list: fox shrine offerings, the five shrine repairs and the village
 * head's catalog. Items held in the backpack and storage chests are shared
 * between lists, so they are handed out in order: first to lists they can
 * finish today, then to unfinished lists, which keep them back from selling
 * and processing.
 */
export interface DeliveryLine { itemId: number; rank: number; remain: number; have: number; sources: ItemSource[] }
export interface DeliveryPlan {
  spec: DailyBundleSpec;
  lines: DeliveryLine[];
  /** Every item is in hand: hand it in today. */
  ready: boolean;
  /** Turnovers until the last missing item can be had, when every missing item has a dated source this season. */
  eta?: number;
}
export interface KeepLine { itemId: number; rank: number; count: number; bundles: number[] }
export interface DeliveryDigest {
  ready: DeliveryPlan[];
  /** Unfinished lists in priority order: the current repair, this season's offerings, the catalog, other seasons. */
  pending: DeliveryPlan[];
  done: number;
  total: number;
  catalogOpen: boolean;
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

/** When a missing item can be had this season, in turnovers: ripe crops, fish and wild plants in season. */
function sourceDays(source: ItemSource, short: number): number | undefined {
  if (source.kind === 'field') return source.ready[Math.ceil(short / source.each) - 1];
  if ((source.kind === 'fish' || source.kind === 'wild') && source.now) return 0;
  if (source.kind === 'animal' && source.owned) return 0;
  return undefined;
}

export function planDeliveries(specs: DailyBundleSpec[], progress: DailyBundle[], held: DailyStack[], context: SourceContext, catalogOpen: boolean): DeliveryDigest {
  const owed = new Map(progress.map((bundle) => [bundle.bundleId, bundle.items.filter((item) => item.remain > 0)]));
  const tracked = specs.filter((spec) => owed.has(spec.id));
  const open = tracked.filter((spec) => owed.get(spec.id)!.length);
  // Repairs go one shrine at a time; only the first unfinished one can take materials.
  const stage = Math.min(...open.filter((spec) => spec.list === 'repair').map((spec) => spec.stage ?? Infinity));
  const order = (spec: DailyBundleSpec) => spec.list === 'repair' ? 0
    : spec.list === 'shrine' ? (spec.season === context.season ? 1 : 3 + (spec.season! - context.season + 4) % 4)
    : 2;
  // Within one priority, lists that ask for quality go first so plain lists do not use up their items.
  const strictness = (spec: DailyBundleSpec) => Math.max(0, ...owed.get(spec.id)!.map((row) => row.rank));
  const candidates = open.filter((spec) => spec.list === 'repair' ? spec.stage === stage : spec.list === 'catalog' ? catalogOpen : true)
    .sort((a, b) => order(a) - order(b) || strictness(b) - strictness(a) || a.id - b.id);

  const items = pool(held);
  const ready: DeliveryPlan[] = [], pending: DeliveryPlan[] = [];
  const line = (item: { itemId: number; rank: number; remain: number }, have: number): DeliveryLine =>
    ({ ...item, have, sources: have < item.remain ? itemSources(item.itemId, context) : [] });
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
      const known = row.sources.map((source) => sourceDays(source, row.remain - row.have)).filter((value): value is number => value !== undefined);
      return known.length ? Math.min(...known) : undefined;
    });
    pending.push({ spec, ready: false, lines, ...(days.every((value) => value !== undefined) ? { eta: Math.max(...days as number[]) } : {}) });
  }
  return { ready, pending, done: tracked.length - open.length, total: tracked.length, catalogOpen, keep: [...keep.values()] };
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
