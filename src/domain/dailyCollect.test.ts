import { describe, expect, it } from 'vitest';
import type { FishSpot } from '../data/dailyPayload';
import { collectPlan } from './dailyCollect';
import type { SourceContext } from './dailySources';

const CHUB = 160000, GOBY = 160010, WHITE = 160020, GHOST = 162000, SUMMER_FISH = 160030;
const BRACKEN = 140040, LOQUAT = 140150, COIN = 140390, SWEET_SAP = 140300, ORE = 240020, DEEP_ORE = 240030, PICKLE = 300000, CUCUMBER = 100120, SALT = 300100;
const CHESTNUT = 1000;
const spots: FishSpot[] = [
  { id: 'FISHING_ID_01', name: '岔路钓鱼点', catches: [[0, 0, CHUB, .3], [0, 1, CHUB, .2], [0, 0, WHITE, .0104], [0, 1, WHITE, .0104], [0, 3, GHOST, .04], [1, 0, SUMMER_FISH, .5]] },
  { id: 'FISHING_ID_02', name: '村中钓鱼点', catches: [[0, 0, GOBY, .1], [0, 1, CHUB, .25]] },
  { id: 'FISHING_ID_03', name: '瀑布钓鱼点', catches: [[0, 0, CHUB, .4]] },
];
const context = (fields: Partial<SourceContext> = {}): SourceContext => ({
  season: 0, periods: [0, 1, 2, 3], daysLeft: 5, crops: new Map(), ripening: [], owned: new Set(), quarryReached: 40,
  trees: [{ crop: CHESTNUT, cell: 7, grown: true }],
  processes: [{ output: PICKLE, count: 1, inputs: [[CUCUMBER, 1]], minutes: 1380, machine: 400000 }, { output: SALT, count: 1, inputs: [[CUCUMBER, 9]], minutes: 60, machine: 400000 }],
  payload: {
    fish: {}, animals: [],
    wild: { [BRACKEN]: { season: 0 }, [LOQUAT]: { season: 1 }, [COIN]: { season: 4, flag: 12902 } },
    quarry: [{ from: 1, to: 39, drops: [[ORE, 4]] }, { from: 81, to: 99, drops: [[DEEP_ORE, 2]] }],
  },
  held: new Map([[CUCUMBER, 3]]),
  ...fields,
});
const plan = (fields: Partial<Parameters<typeof collectPlan>[0]> = {}) => collectPlan({
  fishing: spots, context: context(), registered: new Set([CHUB, GHOST]), hidden: new Set(), needs: new Map(), ...fields,
});

describe('what to collect today', () => {
  it('lists unregistered fish and fish the deliveries lack at each spot, with their odds in the periods left', () => {
    const result = plan({ needs: new Map([[CHUB, 2]]) });
    expect(result.periods).toEqual([0, 1, 2, 3]);
    // The spot with the most wanted fish first; the delivery fish leads each spot.
    expect(result.spots.map((spot) => [spot.id, spot.catches.map((entry) => [entry.itemId, entry.missing, entry.short, entry.odds])])).toEqual([
      ['FISHING_ID_01', [[CHUB, false, 2, [.3, .2, 0, 0]], [WHITE, true, 0, [.0104, .0104, 0, 0]]]],
      ['FISHING_ID_02', [[CHUB, false, 2, [0, .25, 0, 0]], [GOBY, true, 0, [.1, 0, 0, 0]]]],
      ['FISHING_ID_03', [[CHUB, false, 2, [.4, 0, 0, 0]]]],
    ]);
  });

  it('drops spots and fish that only bite in periods already past or in other seasons', () => {
    // After midnight only the late-night period is left.
    expect(plan({ registered: new Set(), context: context({ periods: [3] }) }).spots).toEqual([
      { id: 'FISHING_ID_01', name: '岔路钓鱼点', catches: [{ itemId: GHOST, missing: true, short: 0, odds: [.04] }] },
    ]);
    expect(plan({ registered: new Set(), context: context({ season: 1 }) }).spots.map((spot) => spot.catches.map((entry) => entry.itemId))).toEqual([[SUMMER_FISH]]);
  });

  it('leaves out what the encyclopedia never lists unless a delivery needs it', () => {
    expect(plan({ hidden: new Set([WHITE, GOBY]) }).spots).toEqual([]);
    expect(plan({ hidden: new Set([WHITE, GOBY]), needs: new Map([[GOBY, 1]]) }).spots.map((spot) => spot.catches.map((entry) => entry.itemId))).toEqual([[GOBY]]);
  });

  it('finds wild plants in season, saps from grown trees, quarry drops already in reach and products the stock covers', () => {
    // The loquat is a summer plant, the deep ore lies below floor 80, salt needs more cucumbers than are held and the coin waits for its flag.
    expect(plan().lines.map((line) => [line.itemId, line.source.kind])).toEqual([[BRACKEN, 'wild'], [SWEET_SAP, 'sap'], [ORE, 'quarry'], [PICKLE, 'machine']]);
    expect(plan({ context: context({ unlocked: new Set([12902]) }) }).lines.map((line) => line.itemId)).toContain(COIN);
    // Registered items only stay for the deliveries that lack them.
    const registered = new Set([BRACKEN, SWEET_SAP, ORE, PICKLE]);
    expect(plan({ registered }).lines).toEqual([]);
    expect(plan({ registered, needs: new Map([[ORE, 30]]) }).lines).toMatchObject([{ itemId: ORE, missing: false, short: 30, source: { kind: 'quarry', from: 1, to: 39 } }]);
  });
});
