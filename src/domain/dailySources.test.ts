import { describe, expect, it } from 'vitest';
import type { CropRules } from './dailyDigest';
import { bestRecipe, itemSources, type SourceContext } from './dailySources';

const CABBAGE = 1, TURNIP = 2, CABBAGE_ITEM = 100, TURNIP_ITEM = 101, FISH = 300, BERRY = 310, MILK = 320, ORE = 240020, BAR = 210020, COAL = 230040, CHARCOAL = 230041;
const crops: CropRules = new Map([
  [CABBAGE, { seasons: ['winter'], harvest: [[CABBAGE_ITEM, 2]] }],
  [TURNIP, { seasons: ['spring'], harvest: [[TURNIP_ITEM, 1]] }],
]);
const context = (fields: Partial<SourceContext> = {}): SourceContext => ({
  season: 3, crops, ripening: [], owned: new Set(), trees: [], held: new Map(), processes: [], quarryReached: 0,
  payload: { fish: { [FISH]: [0, 3] }, wild: { [BERRY]: 2 }, animals: [{ species: 7, house: 0, products: [MILK] }, { species: 8, house: 0, products: [MILK] }], quarry: [
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

  it('knows fish and wild plants by season and animals by whether one lives on the farm', () => {
    expect(itemSources(FISH, context())).toEqual([{ kind: 'fish', seasons: [0, 3], now: true }]);
    expect(itemSources(BERRY, context())).toEqual([{ kind: 'wild', season: 2, now: false }]);
    expect(itemSources(MILK, context({ owned: new Set([8]) }))).toEqual([{ kind: 'animal', species: [7, 8], owned: true }]);
  });

  it('points wood at the matching trees, saplings and tree seeds held', () => {
    const trees = [{ crop: 1000, cell: 1, grown: true }, { crop: 1002, cell: 2, grown: false }, { crop: 1001, cell: 3, grown: true }];
    const held = new Map([[140270, 9], [140280, 4]]);
    expect(itemSources(230000, context({ trees, held }))).toEqual([{ kind: 'trees', crops: [1000, 1003, 1002], grown: [1], young: 1, seeds: [[140270, 9]] }]);
    expect(itemSources(230001, context({ trees, held }))).toEqual([{ kind: 'trees', crops: [1001], grown: [3], young: 0, seeds: [[140280, 4]] }]);
  });

  it('sends sap to a sap extractor on grown trees instead of the machine recipe', () => {
    const trees = [{ crop: 1000, cell: 1, grown: true }, { crop: 1000, cell: 2, grown: false }];
    const processes = [{ output: 140300, count: 1, inputs: [[1, 1]] as Array<[number, number]>, minutes: 4320, machine: 9 }];
    expect(itemSources(140300, context({ trees, processes }))).toEqual([{ kind: 'sap', tree: 1000, trees: [1] }]);
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
