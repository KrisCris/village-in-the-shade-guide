import { describe, expect, it } from 'vitest';
import { dailyPayload, quarryBands } from './dailyPayload';
import { getCatalog } from './repository';

const IRON_ORE = 240020, COPPER_ORE = 240010;

describe('daily payload', () => {
  const catalog = getCatalog(), payload = dailyPayload(catalog);
  const numeric = new Map(catalog.entities.filter((entity) => entity.kind === 'items').map((entity) => [entity.id, entity.numeric_id as number]));

  it('sorts the bundles into the three delivery lists', () => {
    const count = (list: string) => payload.bundles.filter((bundle) => bundle.list === list).length;
    expect([count('shrine'), count('repair'), count('catalog')]).toEqual([16, 10, 35]);
    expect(payload.bundles.filter((bundle) => bundle.list === 'shrine').map((bundle) => bundle.season)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    expect(new Set(payload.bundles.filter((bundle) => bundle.list === 'repair').map((bundle) => bundle.stage))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(payload.bundles.every((bundle) => bundle.items.length > 0)).toBe(true);
  });

  it('merges quarry floors with the same drops and finds iron where it is richest', () => {
    const bands = quarryBands(numeric);
    expect(bands.every((band, index) => index === 0 || band.from > bands[index - 1].to)).toBe(true);
    const best = (itemId: number) => bands.flatMap((band) => band.drops.filter(([id]) => id === itemId).map(([, count]) => ({ ...band, count }))).sort((a, b) => b.count - a.count)[0];
    expect(best(IRON_ORE)).toMatchObject({ from: 71, to: 79, count: 26.5 });
    expect(bands.find((band) => band.drops.some(([id]) => id === IRON_ORE))?.from).toBe(41);
    expect(best(COPPER_ORE)).toMatchObject({ from: 11 });
  });

  it('gives each fishing spot its catch odds per season and period, and the wild spawns their season', () => {
    expect(payload.fishing.map((spot) => spot.id)).toEqual(['FISHING_ID_01', 'FISHING_ID_02', 'FISHING_ID_03', 'FISHING_ID_04', 'FISHING_ID_05', 'FISHING_ID_06']);
    expect(payload.fishing.every((spot) => spot.name && !spot.name.startsWith('FISHING_ID_'))).toBe(true);
    for (const spot of payload.fishing) {
      const pools = new Map<string, number>();
      for (const [season, period, , chance] of spot.catches) pools.set(`${season}|${period}`, (pools.get(`${season}|${period}`) ?? 0) + chance);
      // Trash is left out, so a pool's fish add up to at most one bite.
      expect([...pools.values()].every((total) => total > 0 && total <= 1.0001)).toBe(true);
    }
    // Only the cursed fish bite late at night.
    const night = new Set(payload.fishing.flatMap((spot) => spot.catches.filter(([, period]) => period === 3).map(([, , itemId]) => itemId)));
    expect([...night].every((itemId) => itemId >= 162000 && itemId < 163000)).toBe(true);
    expect(payload.wild[numeric.get('ITEM_ID_OBJECT_BRACKEN')!]).toEqual({ season: 0 });
    expect(payload.wild[numeric.get('ITEM_ID_OBJECT_MATSUTAKE_MUSHROOM')!]).toEqual({ season: 2 });
    expect(payload.wild[numeric.get('ITEM_ID_OBJECT_BUERGER_RASPBERRY')!]).toEqual({ season: 3 });
    expect(payload.wild[numeric.get('ITEM_ID_OBJECT_COIN')!]).toEqual({ season: 4, flag: 12902 });
  });

  it('gives each crop its seed or sapling, growing days, harvest items and shops, and each hunting reward its certificates', () => {
    const crop = (id: string) => catalog.byId[id].numeric_id as number;
    expect(payload.seeds[crop('CROPS_ID_APPLE_TREE')]).toEqual({ seed: numeric.get('ITEM_ID_SEED_APPLE'), days: 12, items: [numeric.get('ITEM_ID_CROPS_APPLE')],
      sales: [{ place: '田上杂货店', seasons: [], flags: [529], conditions: ['夏季蔬菜出货后'] }] });
    // Edamame left to wither gives soybeans; the shop and the travelling merchant sell its seeds in summer.
    expect(payload.seeds[crop('CROPS_ID_EDAMAME')].items).toContain(numeric.get('ITEM_ID_CROPS_SOYBEAN'));
    expect(payload.seeds[crop('CROPS_ID_EDAMAME')].sales.map((sale) => [sale.place, sale.seasons])).toEqual([['田上杂货店', [1]], ['行商', [1]]]);
    expect(payload.hunts[numeric.get('ITEM_ID_HUNTING_PHEASANT_FEATHER')!]).toEqual([numeric.get('ITEM_ID_HUNTING_CERTIFICATE_PHEASANT')]);
  });

  it('carries machine recipes, animal products and the animal house orders', () => {
    const barrel = payload.crafts.find((craft) => craft.machine === 400030);
    expect(barrel?.inputs.length).toBeGreaterThan(0);
    expect(payload.animals.find((animal) => animal.products.includes(130080))?.house).toBe(1);
    expect(payload.houses.map(({ type, slots, from, limit }) => [type, slots, from, limit])).toEqual([
      [0, 4, null, 4], [0, 8, 4, 0], [0, 12, 8, 0], [1, 8, null, 4], [1, 8, 4, 0], [1, 12, 8, 0], [2, 3, null, 1],
    ]);
    expect(payload.houses.find((order) => order.type === 2)?.flag).toBe(550);
  });
});
