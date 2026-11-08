import { describe, expect, it } from 'vitest';
import curse from '../../data/sources/game-curse-items.json';
import { mudSeedNights, mudSeedSoil, yieldsCursed, type MudEntry } from './mudSeeds';

const growth = curse.mud_growth;
const pools = curse.mud_pool as Record<string, MudEntry[]>;
const entry = (crop: string) => Object.values(pools).flat().find((e) => e.crop === crop)!;

describe('Dorotabo Seed timing', () => {
  it('counts the seed night, then the pick from its first stage', () => {
    // Turnip prefers ridges: 80 → 400 points is 4 nights at 100 or at 80.
    expect(mudSeedNights(entry('CROPS_ID_TURNIP'), 'ridge', growth)).toBe(5);
    expect(mudSeedNights(entry('CROPS_ID_TURNIP'), 'tilled', growth)).toBe(5);
    // Strawberry prefers ridges: 300 → 1400 is 11 nights at 100, 14 at 80.
    expect(mudSeedNights(entry('CROPS_ID_STRAWBERRY'), 'ridge', growth)).toBe(12);
    expect(mudSeedNights(entry('CROPS_ID_STRAWBERRY'), 'tilled', growth)).toBe(15);
    // Corn prefers tilled soil.
    expect(mudSeedNights(entry('CROPS_ID_CORN'), 'tilled', growth)).toBe(12);
    expect(mudSeedNights(entry('CROPS_ID_CORN'), 'ridge', growth)).toBe(14);
  });

  it('picks the soil whose slowest cursed outcome is soonest', () => {
    const plans = Object.fromEntries(Object.entries(pools).map(([season, pool]) => [season, mudSeedSoil(pool, growth)]));
    expect(Object.fromEntries(Object.entries(plans).map(([season, plan]) => [season, plan.soil])))
      .toEqual({ spring: 'ridge', summer: 'tilled', autumn: 'tilled', winter: 'ridge' });
    expect(plans.spring.lastDay).toEqual({ tilled: 13, ridge: 15 });
    expect(plans.summer.lastDay).toEqual({ tilled: 15, ridge: 14 });
    expect(plans.autumn.lastDay).toEqual({ tilled: 19, ridge: 17 });
    expect(plans.winter.lastDay).toEqual({ tilled: 15, ridge: 17 });
  });

  it('times only the outcomes that give a cursed item', () => {
    for (const pool of Object.values(pools)) {
      const plan = mudSeedSoil(pool, growth);
      expect(plan.rows.map((row) => row.entry)).toEqual(pool.filter(yieldsCursed));
      expect(plan.rows.every((row) => row.entry.outcome !== 'none')).toBe(true);
    }
  });

  it('breaks a tie on the slowest outcome by total nights, then keeps tilled soil', () => {
    const make = (ridge: boolean, ripe: number): MudEntry => ({ crop: `x${ripe}`, outcome: 'cursed', ridge, points: [100, ripe], other_soil: 80, item: 'i' });
    // Slowest is 11 nights on both soils; the extra ridge crop makes ridges 25 nights to 26.
    const tie = [make(false, 900), make(true, 900), make(true, 500)];
    expect(mudSeedSoil(tie, growth).soil).toBe('ridge');
    expect(mudSeedSoil([make(false, 500), make(true, 500)], growth).soil).toBe('tilled');
  });
});
