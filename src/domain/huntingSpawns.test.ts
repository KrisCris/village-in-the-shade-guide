import { describe, expect, it } from 'vitest';
import data from '../../data/sources/game-hunting.json';
import { seasonsOf, tableOdds } from './huntingSpawns';

const odds = (table: keyof typeof data.tables, season: number) => {
  const t = data.tables[table];
  return Object.fromEntries(tableOdds(t.rows, t.spots.length, season).map((o) => [o.animal, o]));
};

describe('daily hunting spawn odds', () => {
  it('fills the single boar spot in row order', () => {
    const boar = odds('9', 0);
    expect(boar.BOAR.atLeastOne).toBeCloseTo(0.3);
    expect(boar.BOAR_BIG.atLeastOne).toBeCloseTo(0.7 * 0.02 * 0.5);
    expect(boar.WEASEL.atLeastOne).toBeCloseTo(0.693 * 0.5);
    expect(boar.RACCOON_DOG.atLeastOne).toBeCloseTo(0.3465 * 0.5);
    expect(Object.values(boar).reduce((sum, o) => sum + o.atLeastOne, 0)).toBeCloseTo(1 - 0.17325);
  });

  it('places the bear row on every roll that passes', () => {
    const bear = odds('11', 2);
    expect(bear.BEAR_BIG.atLeastOne).toBeCloseTo(0.05);
    expect(bear.BEAR.atLeastOne).toBeCloseTo(0.95 * 0.3);
    expect(bear.BEAR.expected).toBeCloseTo(bear.BEAR.atLeastOne);
  });

  it('always places squirrels in the squirrel and rabbit spots', () => {
    const small = odds('4', 3);
    expect(small.RABBIT.atLeastOne).toBeCloseTo(0.025);
    expect(small.SQUIRREL.atLeastOne).toBe(1);
    expect(small.SQUIRREL.expected).toBeCloseTo(3);
  });

  it('cuts counts to the free spots', () => {
    const pheasant = odds('5', 0);
    expect(pheasant.PHEASANT.atLeastOne).toBeCloseTo(0.75);
    expect(pheasant.SQUIRREL.expected + pheasant.PHEASANT.expected + pheasant.RABBIT.expected).toBeLessThanOrEqual(7);
    // 6 or 5 squirrels and pheasants leave 1 or 2 spots for 0–3 rabbits: 1.5 − (0.75 × 1/16 + 0.25 × 2/16).
    expect(pheasant.RABBIT.expected).toBeCloseTo(1.421875);
  });

  it('keeps season-only rows to their season', () => {
    expect(odds('10', 1).FOX.atLeastOne).toBeGreaterThan(0);
    expect(odds('10', 0).FOX).toBeUndefined();
    expect(seasonsOf(data.tables['10'].rows, 'FOX')).toEqual([1]);
    expect(seasonsOf(data.tables['7'].rows, 'SQUIRREL')).toEqual([0]);
    expect(odds('7', 0).SQUIRREL.atLeastOne).toBeGreaterThan(odds('6', 0).SQUIRREL.atLeastOne);
    expect(odds('7', 2).SQUIRREL).toBeUndefined();
  });
});
