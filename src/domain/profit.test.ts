import { expect, it } from 'vitest';
import { calculateCropProfit, calculateProcessProfit } from './profit';

it('uses sold inputs as processing opportunity cost', () => {
  expect(calculateProcessProfit({ inputCost: 60, outputValue: 100, durationMinutes: 2880 }))
    .toMatchObject({ net: 40, perDay: 20 });
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
