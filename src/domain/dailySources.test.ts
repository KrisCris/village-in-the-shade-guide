import { describe, expect, it } from 'vitest';
import type { CropRules } from './dailyDigest';
import { bestRecipe, itemSources, periodsLeft, type SourceContext } from './dailySources';

const CABBAGE = 1, TURNIP = 2, CABBAGE_ITEM = 100, TURNIP_ITEM = 101, FISH = 300, GHOST = 162000, BERRY = 310, COIN = 311, MILK = 320, ORE = 240020, BAR = 210020, COAL = 230040, CHARCOAL = 230041;
const crops: CropRules = new Map([
  [CABBAGE, { seasons: ['winter'], harvest: [[CABBAGE_ITEM, 2]] }],
  [TURNIP, { seasons: ['spring'], harvest: [[TURNIP_ITEM, 1]] }],
]);
const context = (fields: Partial<SourceContext> = {}): SourceContext => ({
  season: 3, crops, ripening: [], owned: new Set(), trees: [], held: new Map(), processes: [], quarryReached: 0, periods: [0, 1, 2, 3], daysLeft: 26,
  payload: { fish: { [FISH]: [[0, 0], [0, 1], [3, 0], [3, 2]], [GHOST]: [[0, 3], [3, 3]] }, wild: { [BERRY]: { season: 2 }, [COIN]: { season: 4, flag: 12902 } }, animals: [{ species: 7, house: 0, products: [MILK] }, { species: 8, house: 0, products: [MILK] }], quarry: [
    { from: 11, to: 29, drops: [[ORE, 4]] },
    { from: 41, to: 49, drops: [[ORE, 12]] },
    { from: 71, to: 79, drops: [[ORE, 26.5]] },
  ] },
  ...fields,
});

describe('item sources', () => {
  it('counts what the growing crops yield and offers crops to sow otherwise', () => {
    const ripening = [{ crop: CABBAGE, cell: 5, days: 4, left: 20 }, { crop: CABBAGE, cell: 6, days: 2, left: 20 }];
    expect(itemSources(CABBAGE_ITEM, context({ ripening }))).toEqual([{ kind: 'field', crop: CABBAGE, cells: [5, 6], days: 2, ready: [2, 4], each: 2, count: 4 }]);
    expect(itemSources(CABBAGE_ITEM, context())).toEqual([{ kind: 'plant', crop: CABBAGE, seasons: [3], now: true }]);
    expect(itemSources(TURNIP_ITEM, context())).toEqual([{ kind: 'plant', crop: TURNIP, seasons: [0], now: false }]);
  });

  it('offers fruit trees, shrubs and soybeans to plant, with the sapling held or the shop and what its sale waits for', () => {
    const APPLE_TREE = 100, TEA = 64, EDAMAME = 34, APPLE = 122100, TEA_LEAF = 100390, EDAMAME_ITEM = 100190, SOYBEAN = 100330;
    const SAPLING = 12100, TEA_SAPLING = 12390, EDAMAME_SEED = 10190;
    const orchard: CropRules = new Map([
      [APPLE_TREE, { seasons: ['spring', 'summer', 'autumn', 'winter'], perennial: { kind: 'fruit_tree', bearing_seasons: ['autumn'] }, harvest: [] }],
      [TEA, { seasons: ['spring', 'summer', 'autumn', 'winter'], perennial: { kind: 'shrub', bearing_seasons: ['spring'] }, harvest: [] }],
      [EDAMAME, { seasons: ['summer'], harvest: [[EDAMAME_ITEM, 2]], withered: [[SOYBEAN, 6]], witheredHarvest: true }],
    ]);
    const seeds = {
      [APPLE_TREE]: { seed: SAPLING, days: 12, items: [APPLE], sales: [{ place: '田上杂货店', seasons: [], flags: [529], conditions: ['夏季蔬菜出货后'] }] },
      [TEA]: { seed: TEA_SAPLING, days: 10, items: [TEA_LEAF], sales: [{ place: '田上杂货店', seasons: [], flags: [532], conditions: ['首次参加品评会后'] }] },
      [EDAMAME]: { seed: EDAMAME_SEED, days: 7, items: [EDAMAME_ITEM, SOYBEAN], sales: [{ place: '田上杂货店', seasons: [1], flags: [], conditions: [] }, { place: '行商', seasons: [1], flags: [], conditions: [] }] },
    };
    const at = (fields: Partial<SourceContext> = {}) => context({ crops: orchard, payload: { ...context().payload, seeds }, ...fields });
    // The sapling waits for its flag; once it is on, the shop sells it.
    expect(itemSources(APPLE, at())).toEqual([{ kind: 'plant', crop: APPLE_TREE, seasons: [0, 1, 2, 3], now: false, bearing: { kind: 'fruit_tree', seasons: [2] },
      seed: { itemId: SAPLING, held: 0, days: 12, sale: { places: ['田上杂货店'], open: false, seasons: [], conditions: ['夏季蔬菜出货后'] } } }]);
    expect(itemSources(APPLE, at({ season: 2, unlocked: new Set([529]) }))[0]).toMatchObject({ now: true, seed: { sale: { open: true, conditions: [] } } });
    expect(itemSources(APPLE, at({ held: new Map([[SAPLING, 2]]) }))[0]).toMatchObject({ seed: { held: 2 } });
    // Shrubs and trees already planted are counted instead; a picked shrub bears again in a day.
    const planted = [{ crop: TEA, cell: 7, days: 0 }, { crop: TEA, cell: 8, days: 1 }, { crop: TEA, cell: 9, days: 3 }];
    expect(itemSources(TEA_LEAF, at({ season: 0, orchard: planted }))).toEqual([{ kind: 'orchard', crop: TEA, cells: [7, 8, 9], grown: 1, days: 1, bearing: { kind: 'shrub', seasons: [0] }, now: true }]);
    // Soybeans are what ripe edamame leaves when it withers; edamame is sold in summer by both shops.
    expect(itemSources(SOYBEAN, at({ season: 1 }))).toEqual([{ kind: 'plant', crop: EDAMAME, seasons: [1], now: true, withered: true,
      seed: { itemId: EDAMAME_SEED, held: 0, days: 7, sale: { places: ['田上杂货店', '行商'], open: true, seasons: [1], conditions: [] } } }]);
    expect(itemSources(SOYBEAN, at())[0]).toMatchObject({ now: false, seed: { sale: { places: ['田上杂货店'], open: false, seasons: [1] } } });
  });

  it('sends meat to selling the animal and hunting spoils to the certificate held', () => {
    const CHICKEN_MEAT = 131020, FEATHER = 150040, PHEASANT = 155060;
    expect(itemSources(CHICKEN_MEAT, context({ owned: new Set([3]) }))).toEqual([{ kind: 'sell', species: [1, 3, 30, 302, 304], owned: true }]);
    expect(itemSources(131040, context())).toEqual([{ kind: 'sell', species: [15], owned: false }]);
    const payload = { ...context().payload, hunts: { [FEATHER]: [PHEASANT] } };
    expect(itemSources(FEATHER, context({ payload, held: new Map([[PHEASANT, 2]]) }))).toEqual([{ kind: 'hunt', certificates: [PHEASANT], held: 2 }]);
  });

  it('knows fish and wild plants by season and animals by whether one lives on the farm', () => {
    expect(itemSources(FISH, context())).toEqual([{ kind: 'fish', seasons: [0, 3], now: true, today: true, night: false }]);
    expect(itemSources(BERRY, context())).toEqual([{ kind: 'wild', season: 2, now: false }]);
    // Buried coins turn up all year, once the story flag for them is on.
    expect(itemSources(COIN, context())).toEqual([]);
    expect(itemSources(COIN, context({ unlocked: new Set([12902]) }))).toEqual([{ kind: 'wild', season: 4, now: true }]);
    expect(itemSources(MILK, context({ owned: new Set([8]) }))).toEqual([{ kind: 'animal', species: [7, 8], owned: true }]);
  });

  it('knows which fish still bite before the 07:00 turnover', () => {
    expect([periodsLeft(7), periodsLeft(13), periodsLeft(23), periodsLeft(0), periodsLeft(6)]).toEqual([[0, 1, 2, 3], [1, 2, 3], [2, 3], [3], [3]]);
    // After midnight only the cursed fish bite; the day fish wait for the morning.
    expect(itemSources(FISH, context({ periods: [3] }))).toEqual([{ kind: 'fish', seasons: [0, 3], now: true, today: false, night: false }]);
    expect(itemSources(GHOST, context({ periods: [3] }))).toEqual([{ kind: 'fish', seasons: [0, 3], now: true, today: true, night: true }]);
    // In the evening, a fish that only bites in the morning and afternoon is gone for today.
    expect(itemSources(FISH, context({ periods: [2, 3] }))[0]).toMatchObject({ today: true });
    expect(itemSources(FISH, context({ season: 0, periods: [2, 3] }))[0]).toMatchObject({ now: true, today: false });
  });

  it('points wood at the matching trees, saplings and tree seeds held, and 木材 also at the 附身草丛 stumps', () => {
    const trees = [{ crop: 1000, cell: 1, grown: true }, { crop: 1002, cell: 2, grown: false }, { crop: 1001, cell: 3, grown: true }];
    const held = new Map([[140270, 9], [140280, 4]]);
    expect(itemSources(230000, context({ trees, held }))).toEqual([{ kind: 'trees', crops: [1000, 1003, 1002], grown: [1], young: 1, seeds: [[140270, 9]], stumps: true }]);
    expect(itemSources(230001, context({ trees, held }))).toEqual([{ kind: 'trees', crops: [1001], grown: [3], young: 0, seeds: [[140280, 4]] }]);
  });

  it('sends sap to a sap extractor on grown trees instead of the machine recipe, counting the extractors already running', () => {
    const trees = [{ crop: 1000, cell: 1, grown: true }, { crop: 1000, cell: 2, grown: false }, { crop: 1000, cell: 3, grown: true }];
    const processes = [{ output: 140300, count: 1, inputs: [[1, 1]] as Array<[number, number]>, minutes: 4320, machine: 9 }];
    expect(itemSources(140300, context({ trees, processes }))).toEqual([{ kind: 'sap', tree: 1000, trees: [1, 3], collectors: 0 }]);
    expect(itemSources(140300, context({ trees, collectors: new Map([[140300, 2], [140370, 5]]) }))).toEqual([{ kind: 'sap', tree: 1000, trees: [1, 3], collectors: 2 }]);
  });

  it('picks the richest quarry floors already reached, or the shallowest ones that have the item', () => {
    expect(itemSources(ORE, context({ quarryReached: 50 }))).toEqual([{ kind: 'quarry', from: 41, to: 49, perHundred: 12, reached: true }]);
    expect(itemSources(ORE, context({ quarryReached: 120 }))).toEqual([{ kind: 'quarry', from: 71, to: 79, perHundred: 26.5, reached: true }]);
    // Floor 1 is always open; floors 11 and deeper need the elevator.
    expect(itemSources(ORE, context())).toEqual([{ kind: 'quarry', from: 11, to: 29, perHundred: 4, reached: false }]);
  });

  it('prefers the recipe whose other inputs are best covered', () => {
    const processes = [
      { output: BAR, count: 1, inputs: [[ORE, 5], [CHARCOAL, 1]] as Array<[number, number]>, minutes: 710, machine: 9 },
      { output: BAR, count: 1, inputs: [[ORE, 5], [COAL, 1]] as Array<[number, number]>, minutes: 710, machine: 9 },
    ];
    expect(bestRecipe(BAR, { processes, held: new Map([[COAL, 40], [CHARCOAL, 2]]) })?.inputs[1][0]).toBe(COAL);
    expect(bestRecipe(BAR, { processes, held: new Map([[CHARCOAL, 40]]) })?.inputs[1][0]).toBe(CHARCOAL);
    expect(itemSources(BAR, context({ processes, held: new Map([[COAL, 40]]) }))).toEqual([{ kind: 'machine', machine: 9, inputs: [[ORE, 5], [COAL, 1]], count: 1, minutes: 710 }]);
  });
});
