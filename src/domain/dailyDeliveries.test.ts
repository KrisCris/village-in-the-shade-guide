import { describe, expect, it } from 'vitest';
import type { DailyBundleSpec } from '../data/dailyPayload';
import type { DailyBundle } from '../lib/saveDaily';
import { freeAfterDeliveries, planDeliveries } from './dailyDeliveries';
import type { SourceContext } from './dailySources';

const CABBAGE = 1, CABBAGE_ITEM = 100, FISH = 300, STONE = 400, WOOD = 230000, GEM = 500;
const context: SourceContext = {
  season: 3, owned: new Set(), trees: [], held: new Map(), processes: [], quarryReached: 0, periods: [0, 1, 2, 3], daysLeft: 26,
  crops: new Map([[CABBAGE, { seasons: ['winter'], harvest: [[CABBAGE_ITEM, 1]] }]]),
  ripening: [{ crop: CABBAGE, cell: 1, days: 6 }, { crop: CABBAGE, cell: 2, days: 4 }],
  payload: { fish: { [FISH]: [[3, 0], [3, 1]] }, wild: {}, animals: [], quarry: [] },
};
const spec = (id: number, list: DailyBundleSpec['list'], extra: Partial<DailyBundleSpec> = {}): DailyBundleSpec =>
  ({ id, list, name: `b${id}`, place: '', items: [], rewards: [], ...extra });
const owed = (bundleId: number, ...items: Array<[itemId: number, remain: number, rank?: number]>): DailyBundle =>
  ({ bundleId, items: items.map(([itemId, remain, rank = 0]) => ({ itemId, rank, remain })) });

describe('delivery plan', () => {
  it('finishes lists in priority order and keeps the rest of the stock for unfinished ones', () => {
    const specs = [spec(8, 'shrine', { season: 0 }), spec(20, 'shrine', { season: 3 }), spec(30, 'repair', { stage: 1 }), spec(40, 'catalog')];
    const progress = [owed(8, [STONE, 2]), owed(20, [STONE, 3]), owed(30, [STONE, 4]), owed(40, [STONE, 2])];
    const plan = planDeliveries(specs, progress, [{ itemId: STONE, rank: 0, count: 8 }], context, true);
    // The repair, this season's offering and the catalog come before an offering for another season.
    expect(plan.ready.map((entry) => entry.spec.id)).toEqual([30, 20]);
    expect(plan.pending.map((entry) => [entry.spec.id, entry.lines[0].have])).toEqual([[40, 1], [8, 0]]);
    expect(plan.keep).toEqual([{ itemId: STONE, rank: 0, count: 1, bundles: [40] }]);
    expect(freeAfterDeliveries([{ itemId: STONE, rank: 0, count: 8 }], plan).get(STONE)).toBe(0);
  });

  it('hands over the lowest quality that qualifies', () => {
    const specs = [spec(40, 'catalog'), spec(41, 'catalog')];
    const progress = [owed(40, [GEM, 2]), owed(41, [GEM, 2, 4])];
    const stacks = [{ itemId: GEM, rank: 0, count: 2 }, { itemId: GEM, rank: 4, count: 2 }];
    expect(planDeliveries(specs, progress, stacks, context, true).ready.map((entry) => entry.spec.id)).toEqual([41, 40]);
    // Without the plain stack, the quality items go to the list that asks for them.
    const short = planDeliveries(specs, progress, stacks.slice(1), context, true);
    expect(short.ready.map((entry) => entry.spec.id)).toEqual([41]);
    expect(short.pending[0].lines[0].have).toBe(0);
  });

  it('counts finished lists, takes only the current repair and skips a closed catalog', () => {
    const specs = [spec(30, 'repair', { stage: 1 }), spec(31, 'repair', { stage: 2 }), spec(32, 'repair', { stage: 3 }), spec(40, 'catalog')];
    const progress = [owed(30), owed(31, [WOOD, 10]), owed(32, [WOOD, 5]), owed(40, [GEM, 1])];
    const plan = planDeliveries(specs, progress, [{ itemId: WOOD, rank: 0, count: 20 }], context, false);
    expect(plan.ready.map((entry) => entry.spec.id)).toEqual([31]);
    expect(plan.pending).toEqual([]);
    expect([plan.done, plan.total, plan.catalogOpen]).toEqual([1, 4, false]);
  });

  it('estimates when a list can be finished from crops ripening and fish in season', () => {
    const specs = [spec(20, 'shrine', { season: 3 }), spec(21, 'shrine', { season: 3 }), spec(22, 'shrine', { season: 3 })];
    const progress = [owed(20, [CABBAGE_ITEM, 2], [FISH, 1]), owed(21, [CABBAGE_ITEM, 3]), owed(22, [FISH, 1], [GEM, 1])];
    const [first, second, third] = planDeliveries(specs, progress, [], context, true).pending;
    expect(first.eta).toBe(6);
    // Two cabbages are growing, three are owed: no date, but more can still be sown this season.
    expect([second.eta, second.offSeason]).toEqual([undefined, undefined]);
    // Nothing is known about where the gem comes from.
    expect([third.eta, third.offSeason]).toEqual([undefined, true]);
    expect(first.lines[1].sources).toEqual([{ kind: 'fish', seasons: [3], now: true, today: true, night: false }]);
  });

  it('moves day fishing to the next day after midnight, unless the season ends at the turnover', () => {
    const specs = [spec(20, 'shrine', { season: 3 })], progress = [owed(20, [FISH, 1])];
    const eta = (fields: Partial<SourceContext>) => planDeliveries(specs, progress, [], { ...context, ...fields }, true).pending[0].eta;
    expect(eta({})).toBe(0);
    expect(eta({ periods: [3] })).toBe(1);
    expect(eta({ periods: [3], daysLeft: 0 })).toBeUndefined();
    expect(planDeliveries(specs, progress, [], { ...context, periods: [3], daysLeft: 0 }, true).pending[0].offSeason).toBe(true);
  });
});
