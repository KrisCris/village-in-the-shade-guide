import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import quality from '../../data/sources/game-crop-quality.json';
import unlocks from '../../data/sources/game-save-unlocks.json';

const items: Array<{ id: string; numeric_id: number; category_id: string }> = JSON.parse(readFileSync('data/generated/build-25640656/entities/items.json', 'utf8'));
const byId = new Map(items.map(item => [item.id, item]));
const seedOf = (id: string) => quality.seeds.filter(seed => seed.harvest_item_ids.includes(id));

describe('crop quality data', () => {
  it('derives every threshold from the seed target and the gamedefine rates', () => {
    for (const seed of quality.seeds) {
      expect(byId.get(seed.seed_item_id)?.category_id).toBe('ITEM_CATEGORY_SEEDING');
      expect(byId.get(seed.count_item_id)?.numeric_id).toBe(seed.count_item_numeric_id);
      expect([seed.copper, seed.silver, seed.gold]).toEqual([seed.need * 0.1, seed.need * 0.4, seed.need].map(Math.ceil));
    }
  });

  it('counts each harvest item under exactly one seed, listed first when it is the counted item', () => {
    for (const seed of quality.seeds) expect(seed.harvest_item_ids[0]).toBe(seed.count_item_id);
    const all = quality.seeds.flatMap(seed => seed.harvest_item_ids);
    expect(new Set(all).size).toBe(all.length);
    expect(seedOf('ITEM_ID_CROPS_SOYBEAN').map(seed => seed.count_item_id)).toEqual(['ITEM_ID_CROPS_EDAMAME']);
    expect(seedOf('ITEM_ID_CROPS_BEAN_SPROUTS').map(seed => seed.count_item_id)).toEqual(['ITEM_ID_CROPS_EDAMAME']);
    expect(seedOf('ITEM_ID_CROPS_SNOW_PEAS').map(seed => seed.count_item_id)).toEqual(['ITEM_ID_CROPS_PEA']);
  });

  it('covers every brand crop the delivery catalog asks for', () => {
    const numeric = new Map(items.map(item => [item.numeric_id, item]));
    const brandCrops = unlocks.bundles.flatMap(bundle => bundle.items).filter(need => need.rank === 4).map(need => numeric.get(need.itemId)!).filter(item => item.category_id === 'ITEM_CATEGORY_CROPS');
    expect(brandCrops.map(item => item.id).sort()).toEqual(['ITEM_ID_CROPS_RICE', 'ITEM_ID_CROPS_SOYBEAN', 'ITEM_ID_CROPS_TEA_TREE']);
    for (const crop of brandCrops) expect(seedOf(crop.id)).toHaveLength(1);
    expect(seedOf('ITEM_ID_CROPS_RICE')[0].gold).toBe(1000);
  });

  it('gives each love level and mood band animal-product odds that add up to 100%', () => {
    expect(quality.animal_products.odds).toHaveLength(6);
    for (const level of quality.animal_products.odds) {
      expect(level).toHaveLength(3);
      for (const band of level) expect(band.reduce((sum, percent) => sum + percent, 0)).toBe(100);
    }
  });
});
