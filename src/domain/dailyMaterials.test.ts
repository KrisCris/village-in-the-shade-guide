import { describe, expect, it } from 'vitest';
import { planMaterials } from './dailyMaterials';
import type { SourceContext } from './dailySources';

const WOOD = 230000, BAR = 210020, ORE = 240020, COAL = 230040, STONE = 230020;
const context = (held: Map<number, number>): SourceContext => ({
  season: 3, crops: new Map(), ripening: [], owned: new Set(), trees: [], held, quarryReached: 80,
  payload: { fish: {}, wild: {}, animals: [], quarry: [{ from: 71, to: 79, drops: [[ORE, 26.5]] }] },
  processes: [{ output: BAR, count: 1, inputs: [[ORE, 5], [COAL, 1]], minutes: 710, machine: 9 }],
});

describe('material plan', () => {
  it('keeps a share of each material back and reports the shortfall', () => {
    const free = new Map([[WOOD, 100], [STONE, 50]]);
    const lines = planMaterials([[WOOD, 90], [STONE, 30]], free, 0.2, context(free));
    expect(lines.map(({ itemId, need, held, reserve, short }) => [itemId, need, held, reserve, short])).toEqual([[WOOD, 90, 100, 20, 10], [STONE, 30, 50, 10, 0]]);
    expect(lines[0].sources).toEqual([{ kind: 'trees', crops: [1000, 1003, 1002], grown: [], young: 0, seeds: [] }]);
    expect(planMaterials([[WOOD, 90]], free, 0, context(free))[0].short).toBe(0);
  });

  it('plans the ore and coal for bars it cannot cover', () => {
    const free = new Map([[BAR, 2], [ORE, 10], [COAL, 3]]);
    const lines = planMaterials([[BAR, 6]], free, 0, context(free));
    expect(lines.map(({ itemId, need, short, for: parent }) => [itemId, need, short, parent])).toEqual([[BAR, 6, 4, undefined], [ORE, 20, 10, BAR], [COAL, 4, 1, BAR]]);
    expect(lines[1].sources).toEqual([{ kind: 'quarry', from: 71, to: 79, perHundred: 26.5, reached: true }]);
  });

  it('shares what is left of a material between the lines that use it', () => {
    const free = new Map([[BAR, 0], [COAL, 5]]);
    const lines = planMaterials([[COAL, 4], [BAR, 2]], free, 0, context(free));
    // Lines are planned by item ID: the bars' coal is taken first, and the machines' own coal finds three left.
    expect(lines.filter((line) => line.itemId === COAL).map((line) => [line.need, line.short, line.for])).toEqual([[2, 0, BAR], [4, 1, undefined]]);
  });
});
