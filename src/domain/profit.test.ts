import { expect, it } from 'vitest';
import { calculateCropProfit, calculateEntityCropProfit, calculateEntityProcessProfit, calculateProcessProfit } from './profit';

it('uses sold inputs as processing opportunity cost', () => {
  expect(calculateProcessProfit({ inputCost: 60, outputValue: 100, durationMinutes: 2880 }))
    .toMatchObject({ net: 40, perDay: 20 });
});

it('retains seed expense without inventing a harvest for a long-growing crop', () => {
  expect(calculateCropProfit({seedCost:60,harvestValue:670,growthDays:50}))
    .toMatchObject({harvests:0,inputCost:60,outputValue:0,net:-60});
});

it('calculates one-harvest crop net without inventing growth time', () => {
  expect(calculateCropProfit({ seedCost: 40, harvestValue: 63 })).toMatchObject({ net: 23, perDay: null });
});

it('fits repeat harvests inside a 28-day season', () => {
  expect(calculateCropProfit({ seedCost: 100, harvestValue: 50, growthDays: 12, regrowDays: 4 }))
    .toMatchObject({ harvests: 5, outputValue: 250, net: 150, perDay: 150 / 28 });
});

it('repurchases seed after each one-shot harvest', () => {
  expect(calculateCropProfit({ seedCost: 40, harvestValue: 63, growthDays: 5 }))
    .toMatchObject({ harvests: 5, inputCost: 200, outputValue: 315, net: 115 });
});

it('changes crop output value without changing seed cost', () => {
  const result = calculateCropProfit({ seedCost: 40, harvestValue: 63 * 1.5, growthDays: 5 });
  expect(result).toMatchObject({ inputCost: 200, outputValue: 472.5, net: 272.5 });
});

it('calculates process profit from catalog prices at selected quality', () => {
  const catalog = { byId: {
    ore: { id: 'ore', kind: 'items', quality_eligible: true, sell_price: 40 },
    bar: { id: 'bar', kind: 'items', quality_eligible: true, sell_price: 63 },
  } } as never;
  const entity = { kind: 'processes', inputs: [{ item_id: 'ore', quantity: 1 }], output: { item_id: 'bar', quantity: 1 }, duration_minutes: 1440 } as never;
  expect(calculateEntityProcessProfit(entity, catalog, 'silver')).toMatchObject({ inputCost: 60, outputValue: 94.5, net: 34.5 });
});

it('calculates crop profit with fixed seed cost and quality harvest value', () => {
  const catalog = { byId: {
    seed: { id: 'seed', kind: 'items', buy_price: 40, quality_eligible: false },
    harvest: { id: 'harvest', kind: 'items', sell_price: 63, quality_eligible: true },
  } } as never;
  const entity = { kind: 'crops', seed_item_ids: ['seed'], harvest_item_ids: ['harvest'], growth_days: 5 } as never;
  expect(calculateEntityCropProfit(entity, catalog, 'silver')).toMatchObject({ inputCost: 200, outputValue: 472.5, net: 272.5 });
});

it('does not invent crop profit when growth timing is unknown', () => {
  const catalog = { byId: {
    seed: { id: 'seed', kind: 'items', buy_price: 3000, quality_eligible: false },
    harvest: { id: 'harvest', kind: 'items', sell_price: 120, quality_eligible: true },
  } } as never;
  const tree = { kind: 'crops', seed_item_ids: ['seed'], harvest_item_ids: ['harvest'] } as never;

  expect(calculateEntityCropProfit(tree, catalog, 'normal')).toBeNull();
});
