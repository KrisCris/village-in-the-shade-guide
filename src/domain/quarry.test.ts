import { describe, expect, it } from 'vitest';
import { expectedRockCounts, rockCounts, sum, tilesetOf } from './quarry';

// Floor 11's rock list: two quarry rocks, a boulder, copper deposits, a copper boulder and a gem deposit.
const floor11 = [
  { rock: 1301, weight: 42 }, { rock: 1304, weight: 42 }, { rock: 1351, weight: 1 },
  { rock: 1307, weight: 7 }, { rock: 1354, weight: 1 }, { rock: 1311, weight: 1 },
];
const copperRoom = [
  { rock: 1301, weight: 2 }, { rock: 1304, weight: 2 }, { rock: 1351, weight: 1 },
  { rock: 1307, weight: 90 }, { rock: 1354, weight: 5 },
];

describe('rockCounts', () => {
  it('gives every rock type at least one rock, even past the density total', () => {
    // 10% of 42 cells is 4.7 rocks; each quarry rock gets trunc(0.42 × 4.7 + 0.5) = 2 and the rest 1 each.
    expect(rockCounts(floor11, 10, 42)).toEqual([2, 2, 1, 1, 1, 1]);
  });

  it('rounds each type from the shared total', () => {
    // 10% of 379 cells: 38.4; quarry rocks get 16 each, copper deposits 3.
    const counts = rockCounts(floor11, 10, 379);
    expect(counts).toEqual([16, 16, 1, 3, 1, 1]);
    expect(sum(counts)).toBe(38);
  });

  it('fills ore rooms mostly with deposit rocks', () => {
    // 30% of 42 cells: 13.1, so 12 copper deposits; 30% of 55 cells: 17.0, so 15.
    expect(rockCounts(copperRoom, 30, 42)).toEqual([1, 1, 1, 12, 1]);
    expect(rockCounts(copperRoom, 30, 55)).toEqual([1, 1, 1, 15, 1]);
  });

  it('places nothing without rock cells or density', () => {
    expect(rockCounts(floor11, 10, 0)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(rockCounts(floor11, 0, 300)).toEqual([0, 0, 0, 0, 0, 0]);
    // 5% of 9 cells rounds down to 0 rocks.
    expect(rockCounts(floor11, 5, 9)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('adds the shrine bonus to copper, iron and gold deposits only', () => {
    const base = rockCounts(floor11, 10, 379);
    const boosted = rockCounts(floor11, 10, 379, 10);
    expect(boosted[3]).toBeGreaterThan(base[3]);
    expect(boosted[5]).toBe(base[5]);
  });
});

describe('expectedRockCounts', () => {
  it('averages equally likely layouts', () => {
    expect(expectedRockCounts(copperRoom, 30, [42, 55])).toEqual([1, 1, 1, 13.5, 1]);
    expect(expectedRockCounts(copperRoom, 30, [])).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('tilesetOf', () => {
  it('reads the tileset from the layout key', () => {
    expect(tilesetOf('3301_dg01')).toBe(1);
    expect(tilesetOf('3319_dg03')).toBe(3);
    expect(tilesetOf('3200')).toBe(0);
  });
});
