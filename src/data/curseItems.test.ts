import { describe, expect, it } from 'vitest';
import curse from '../../data/sources/game-curse-items.json';
import fishing from '../../data/sources/game-fishing.json';
import items from '../../data/generated/build-25311578/entities/items.json';
import crops from '../../data/generated/build-25311578/entities/crops.json';

// The cursed-items guide reads these exports; check them against the catalog.
const cursedCrops = (items as { id: string; category_id?: string; feature_ids?: number[] }[])
  .filter(item => item.category_id === 'ITEM_CATEGORY_DEFORMITY_CROPS' && item.feature_ids?.includes(10)).map(item => item.id);
const pool = Object.values(curse.mud_pool).flat();

describe('cursed item sources', () => {
  it('gives every cursed crop exactly one mud seed route', () => {
    const routes = pool.filter(entry => entry.outcome !== 'none').map(entry => entry.item);
    expect([...routes].sort()).toEqual([...cursedCrops].sort());
  });
  it('lists only catalog crops, each in a single season', () => {
    const known = new Set((crops as { id: string }[]).map(crop => crop.id));
    expect(pool.every(entry => known.has(entry.crop))).toBe(true);
    expect(new Set(pool.map(entry => entry.crop)).size).toBe(pool.length);
  });
  it('links each giant crop back to its seasonal crop and cursed item', () => {
    const giants = pool.filter(entry => entry.outcome === 'giant');
    expect(giants.map(entry => entry.giant).sort()).toEqual(Object.keys(curse.giants).sort());
    for (const entry of giants) expect(curse.giants[entry.giant as keyof typeof curse.giants].cursed).toBe(entry.item);
  });
  it('knows the fish kind of every late-night catch', () => {
    const kinds = curse.fish_kind as Record<string, number>;
    const late = fishing.spawns.filter(row => row.period === 'late-night');
    expect(late.every(row => kinds[row.item] === 0 || kinds[row.item] === 3)).toBe(true);
  });
});
