import { describe, expect, it } from 'vitest';
import production from '../../data/sources/game-livestock-products.json';
import { saleGiftOdds, type SaleGift } from './livestockSaleGift';

const gift = (id: string) => production.animals.find((animal) => animal.livestock_id === id)!.sale_gift as SaleGift;
const item = (odds: ReturnType<typeof saleGiftOdds>, id: string) => odds.items.find((entry) => entry.item_id === id)!;

describe('saleGiftOdds', () => {
  it('gives a chicken 1 meat and 1 feather, then draws the third item 40/30/30', () => {
    const odds = saleGiftOdds(gift('LIVESTOCK_ID_CHICKEN'));
    expect(odds.draws).toBe(1);
    expect(item(odds, 'ITEM_ID_LIVESTOCK_CHICKEN')).toMatchObject({ min: 1, max: 2, perDraw: 0.4 });
    expect(item(odds, 'ITEM_ID_LIVESTOCK_CHICKEN').average).toBeCloseTo(1.4);
    expect(item(odds, 'ITEM_ID_LIVESTOCK_CHICKEN_TAIL_FEATHER')).toMatchObject({ min: 0, max: 1 });
    expect(item(odds, 'ITEM_ID_LIVESTOCK_CHICKEN_TAIL_FEATHER').atLeastOne).toBeCloseTo(0.3);
  });
  it('draws a cow horn on 7 extra draws at 10% each', () => {
    const odds = saleGiftOdds(gift('LIVESTOCK_ID_COW'));
    expect(odds.draws).toBe(12 - 3 - 2);
    expect(item(odds, 'ITEM_ID_LIVESTOCK_COW_HORN').atLeastOne).toBeCloseTo(1 - 0.9 ** 7);
  });
  it('leaves the sheep slot with item 0 out of the draw', () => {
    const odds = saleGiftOdds(gift('LIVESTOCK_ID_SHEEP'));
    expect(odds.items.map((entry) => entry.item_id)).toEqual(['ITEM_ID_LIVESTOCK_LAMB', 'ITEM_ID_HUNTING_SMALL_ANIMAL_BONES']);
    expect(item(odds, 'ITEM_ID_LIVESTOCK_LAMB').perDraw).toBeCloseTo(55 / 85);
  });
  it('always sends exactly count items on average', () => {
    for (const animal of production.animals) {
      if (!animal.sale_gift) continue;
      const odds = saleGiftOdds(animal.sale_gift as SaleGift);
      expect(odds.items.reduce((sum, entry) => sum + entry.average, 0)).toBeCloseTo(animal.sale_gift.count);
    }
  });
  it('gives only the fixed amounts when they already reach count', () => {
    const odds = saleGiftOdds({ count: 1, items: [{ item_id: 'A', fixed: 2, weight: 50 }, { item_id: 'B', fixed: 0, weight: 50 }] });
    expect(odds.draws).toBe(0);
    expect(odds.items.map(({ min, max, atLeastOne }) => [min, max, atLeastOne])).toEqual([[2, 2, 1], [0, 0, 0]]);
  });
});
