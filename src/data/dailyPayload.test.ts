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
