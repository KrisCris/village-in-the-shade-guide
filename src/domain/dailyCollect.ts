import type { FishSpot } from '../data/dailyPayload';
import { itemSources, TREE_SAPS, type ItemSource, type SourceContext } from './dailySources';

/** Why an item is worth fetching: the encyclopedia has no entry for it yet, or deliveries still need some. */
export interface CollectNeed {
  itemId: number;
  missing: boolean;
  /** Still owed to deliveries, beyond what is held. */
  short: number;
}
export interface SpotCatch extends CollectNeed {
  /** Chance on one bite with no bait in each of the plan's `periods`; 0 when it does not bite then. */
  odds: number[];
}
export interface SpotPlan { id: string; name: string; catches: SpotCatch[] }
/** Sources a trip or a machine can act on today. */
export type CollectSource = Extract<ItemSource, { kind: 'wild' | 'sap' | 'quarry' | 'machine' }>;
export interface CollectLine extends CollectNeed { source: CollectSource }
export interface CollectPlan {
  /** FISH_PERIODS indexes left before the 07:00 turnover. */
  periods: number[];
  /** Spots with something wanted on the hook, the most wanted fish first. */
  spots: SpotPlan[];
  /** Everything else, grouped by source in COLLECT_ORDER. */
  lines: CollectLine[];
}

export const COLLECT_ORDER: CollectSource['kind'][] = ['wild', 'sap', 'quarry', 'machine'];

/**
 * What can still be had today that the encyclopedia lacks or a delivery is
 * short of: fish at each spot in the periods left before the turnover, wild
 * plants and insects of the season, saps from grown trees, quarry drops on
 * floors already reached and products the farm's own machines can make from
 * what is in stock. Items the encyclopedia never lists only count when a
 * delivery needs them.
 */
export function collectPlan(input: {
  fishing: FishSpot[];
  /** `held` is the stock left after deliveries; `processes` are the recipes of the machines on the farm. */
  context: SourceContext;
  registered: ReadonlySet<number>;
  hidden: ReadonlySet<number>;
  needs: ReadonlyMap<number, number>;
}): CollectPlan {
  const { context } = input, { season, periods } = context;
  const need = (itemId: number): CollectNeed | undefined => {
    const missing = !input.registered.has(itemId) && !input.hidden.has(itemId), short = input.needs.get(itemId) ?? 0;
    return missing || short > 0 ? { itemId, missing, short } : undefined;
  };
  // Delivery shortfalls first, then the likeliest bites.
  const rank = (a: CollectNeed, b: CollectNeed) => Number(b.short > 0) - Number(a.short > 0);

  const spots = input.fishing.flatMap((spot): SpotPlan[] => {
    const odds = new Map<number, number[]>();
    for (const [at, period, itemId, chance] of spot.catches) {
      const index = periods.indexOf(period);
      if (at !== season || index < 0) continue;
      (odds.get(itemId) ?? odds.set(itemId, periods.map(() => 0)).get(itemId)!)[index] = chance;
    }
    const catches = [...odds].flatMap(([itemId, chances]): SpotCatch[] => { const why = need(itemId); return why ? [{ ...why, odds: chances }] : []; })
      .sort((a, b) => rank(a, b) || Math.max(...b.odds) - Math.max(...a.odds));
    return catches.length ? [{ id: spot.id, name: spot.name, catches }] : [];
  }).sort((a, b) => b.catches.length - a.catches.length);

  const fish = new Set(input.fishing.flatMap((spot) => spot.catches.map(([, , itemId]) => itemId)));
  const candidates = new Set([
    ...Object.keys(context.payload.wild).map(Number), ...Object.keys(TREE_SAPS).map(Number),
    ...context.payload.quarry.flatMap((band) => band.drops.map(([itemId]) => itemId)), ...context.processes.map((process) => process.output),
  ]);
  const lines = [...candidates].flatMap((itemId): CollectLine[] => {
    const why = fish.has(itemId) ? undefined : need(itemId), source = why && todaySource(itemId, context);
    return why && source ? [{ ...why, source }] : [];
  }).sort((a, b) => COLLECT_ORDER.indexOf(a.source.kind) - COLLECT_ORDER.indexOf(b.source.kind) || rank(a, b));
  return { periods, spots, lines };
}

function todaySource(itemId: number, context: SourceContext): CollectSource | undefined {
  return itemSources(itemId, context).find((source): source is CollectSource => source.kind === 'wild' ? source.now
    : source.kind === 'sap' ? source.trees.length > 0
    : source.kind === 'quarry' ? source.reached
    : source.kind === 'machine' && source.inputs.every(([id, count]) => (context.held.get(id) ?? 0) >= count));
}
