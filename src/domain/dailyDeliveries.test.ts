import { describe, expect, it } from 'vitest';
import type { DailyBundleSpec } from '../data/dailyPayload';
import type { DailyBundle } from '../lib/saveDaily';
import { freeAfterDeliveries, planDeliveries, type DeliveryGates } from './dailyDeliveries';
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
/** Everything open: the catalog, all four of the shrine's offerings this season and the first repair. */
const gates = (fields: { catalogOpen?: boolean; shrine?: Partial<DeliveryGates['shrine']>; repair?: Partial<DeliveryGates['repair']> } = {}): DeliveryGates => ({
  catalogOpen: fields.catalogOpen ?? true,
  shrine: { clears: 3, open: true, gone: false, ...fields.shrine },
  repair: { level: 0, open: true, last: 4, ...fields.repair },
});
const shrine = (season: number, slot: number) => ({ season, slot });

describe('delivery plan', () => {
  it('finishes lists in priority order and keeps the rest of the stock for unfinished ones', () => {
    const specs = [spec(20, 'shrine', shrine(3, 1)), spec(30, 'repair', { stage: 1 }), spec(40, 'catalog')];
    const progress = [owed(20, [STONE, 3]), owed(30, [STONE, 4]), owed(40, [STONE, 2])];
    const plan = planDeliveries(specs, progress, [{ itemId: STONE, rank: 0, count: 8 }], context, gates());
    // The repair comes first, then the fox shrine, then the catalog.
    expect(plan.ready.map((entry) => entry.spec.id)).toEqual([30, 20]);
    expect(plan.pending.map((entry) => [entry.spec.id, entry.lines[0].have])).toEqual([[40, 1]]);
    expect(plan.keep).toEqual([{ itemId: STONE, rank: 0, count: 1, bundles: [40] }]);
    expect(freeAfterDeliveries([{ itemId: STONE, rank: 0, count: 8 }], plan).get(STONE)).toBe(0);
  });

  it('hands over the lowest quality that qualifies', () => {
    const specs = [spec(40, 'catalog'), spec(41, 'catalog')];
    const progress = [owed(40, [GEM, 2]), owed(41, [GEM, 2, 4])];
    const stacks = [{ itemId: GEM, rank: 0, count: 2 }, { itemId: GEM, rank: 4, count: 2 }];
    expect(planDeliveries(specs, progress, stacks, context, gates()).ready.map((entry) => entry.spec.id)).toEqual([41, 40]);
    // Without the plain stack, the quality items go to the list that asks for them.
    const short = planDeliveries(specs, progress, stacks.slice(1), context, gates());
    expect(short.ready.map((entry) => entry.spec.id)).toEqual([41]);
    expect(short.pending[0].lines[0].have).toBe(0);
  });

  it('counts finished lists, takes only the current repair and skips a closed catalog', () => {
    const specs = [spec(30, 'repair', { stage: 1 }), spec(31, 'repair', { stage: 2 }), spec(32, 'repair', { stage: 3 }), spec(40, 'catalog')];
    const progress = [owed(30), owed(31, [WOOD, 10]), owed(32, [WOOD, 5]), owed(40, [GEM, 1])];
    const plan = planDeliveries(specs, progress, [{ itemId: WOOD, rank: 0, count: 20 }], context, gates({ catalogOpen: false, repair: { level: 1 } }));
    expect(plan.ready.map((entry) => entry.spec.id)).toEqual([31]);
    expect(plan.pending).toEqual([]);
    expect([plan.done, plan.total, plan.gates.catalogOpen]).toEqual([1, 4, false]);
    // The toolbox is put away between story requests; the repair still counts as one to do.
    const away = planDeliveries(specs, progress, [{ itemId: WOOD, rank: 0, count: 20 }], context, gates({ repair: { level: 1, open: false } }));
    expect([away.ready, away.pending.map((entry) => entry.spec.id), away.total]).toEqual([[], [40], 4]);
  });

  it('offers only this season\'s first clears + 1 fox shrine offerings, and none while the shrine is away', () => {
    const specs = [1, 2, 3, 4].map((slot) => spec(19 + slot, 'shrine', shrine(3, slot))).concat(spec(8, 'shrine', shrine(0, 1)));
    const progress = specs.map((entry) => owed(entry.id, [STONE, 1]));
    const listed = (shrineGates: Partial<DeliveryGates['shrine']>) => {
      const plan = planDeliveries(specs, progress, [{ itemId: STONE, rank: 0, count: 9 }], context, gates({ shrine: shrineGates }));
      return { ready: plan.ready.map((entry) => entry.spec.id), total: plan.total };
    };
    // One clear so far: mountain vegetables and vegetables. Spring's offering waits for spring.
    expect(listed({ clears: 1 })).toEqual({ ready: [20, 21], total: 5 });
    expect(listed({ clears: 3 })).toEqual({ ready: [20, 21, 22, 23], total: 5 });
    // Cleared this month: back next season.
    expect(listed({ clears: 2, open: false })).toEqual({ ready: [], total: 5 });
    // After the fourth clear the shrine is gone, and what it never asked for no longer counts.
    expect(listed({ clears: 4, open: false, gone: true })).toEqual({ ready: [], total: 0 });
  });

  it('leaves out repairs the game can no longer offer', () => {
    const specs = [spec(36, 'repair', { stage: 4 }), spec(38, 'repair', { stage: 5 })];
    const progress = [owed(36), owed(38, [WOOD, 10])];
    const plan = (repair: Partial<DeliveryGates['repair']>) => {
      const result = planDeliveries(specs, progress, [{ itemId: WOOD, rank: 0, count: 10 }], context, gates({ repair }));
      return { ready: result.ready.map((entry) => entry.spec.id), done: result.done, total: result.total };
    };
    // Normal mode never takes the fifth repair; chapter 6 sets the level past it.
    expect(plan({ level: 4 })).toEqual({ ready: [], done: 1, total: 1 });
    expect(plan({ level: 6, open: false })).toEqual({ ready: [], done: 1, total: 1 });
    // あんしん暮し mode keeps the toolbox out for it.
    expect(plan({ level: 4, last: 5 })).toEqual({ ready: [38], done: 1, total: 2 });
  });

  it('estimates when a list can be finished from crops ripening and fish in season', () => {
    const specs = [spec(20, 'shrine', shrine(3, 1)), spec(21, 'shrine', shrine(3, 2)), spec(22, 'shrine', shrine(3, 3))];
    const progress = [owed(20, [CABBAGE_ITEM, 2], [FISH, 1]), owed(21, [CABBAGE_ITEM, 3]), owed(22, [FISH, 1], [GEM, 1])];
    const [first, second, third] = planDeliveries(specs, progress, [], context, gates()).pending;
    expect(first.eta).toBe(6);
    // Two cabbages are growing, three are owed: no date, but more can still be sown this season.
    expect([second.eta, second.offSeason]).toEqual([undefined, undefined]);
    // Nothing is known about where the gem comes from.
    expect([third.eta, third.offSeason]).toEqual([undefined, true]);
    expect(first.lines[1].sources).toEqual([{ kind: 'fish', seasons: [3], now: true, today: true, night: false }]);
  });

  it('moves day fishing to the next day after midnight, unless the season ends at the turnover', () => {
    const specs = [spec(20, 'shrine', shrine(3, 1))], progress = [owed(20, [FISH, 1])];
    const eta = (fields: Partial<SourceContext>) => planDeliveries(specs, progress, [], { ...context, ...fields }, gates()).pending[0].eta;
    expect(eta({})).toBe(0);
    expect(eta({ periods: [3] })).toBe(1);
    expect(eta({ periods: [3], daysLeft: 0 })).toBeUndefined();
    expect(planDeliveries(specs, progress, [], { ...context, periods: [3], daysLeft: 0 }, gates()).pending[0].offSeason).toBe(true);
  });
});
