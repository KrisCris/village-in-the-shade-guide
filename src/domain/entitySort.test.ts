import { describe, expect, it } from 'vitest';
import type { Entity } from '../data/types';
import { entityMetrics, sortEntities, type PriceIndex } from './entitySort';

const name = (zh_hans: string) => ({
  zh_hans,
  zh_hant: zh_hans,
  ja: '',
  internal: zh_hans,
  aliases: [zh_hans],
  review_status: 'test',
});

const priced = { id: 'priced', kind: 'items', name: name('乙'), sell_price: 20, searchText: '' } as Entity;
const expensive = { id: 'expensive', kind: 'items', name: name('甲'), sell_price: 80, searchText: '' } as Entity;
const missing = { id: 'missing', kind: 'items', name: name('丙'), searchText: '' } as Entity;

describe('entity sorting', () => {
  it.each(['asc', 'desc'] as const)('keeps missing values last for %s', (direction) => {
    const sorted = sortEntities([priced, missing, expensive], 'sell', direction, 'normal');
    expect(sorted.at(-1)?.id).toBe('missing');
  });

  it('keeps the chosen direction when the field changes', () => {
    expect(sortEntities([priced, expensive], 'sell', 'asc', 'normal').map((row) => row.id)).toEqual(['priced', 'expensive']);
    expect(sortEntities([priced, expensive], 'name', 'asc', 'normal').map((row) => row.id)).toEqual(['expensive', 'priced']);
  });

  it('reorders quality-sensitive sell values', () => {
    const fixedItem = { ...expensive, id: 'fixed', sell_price: 100, quality_eligible: false };
    const qualityCrop = { ...priced, id: 'crop', kind: 'crops', sell_price: 63, quality_eligible: true };
    expect(sortEntities([fixedItem, qualityCrop], 'sell', 'desc', 'brand')[0].id).toBe('crop');
  });
});

it('prices eligible and fixed processing inputs separately', () => {
  const process = {
    id: 'process', kind: 'processes', name: name('加工'), searchText: '',
    inputs: [{ item_id: 'quality-input', quantity: 1 }, { item_id: 'fixed-input', quantity: 1 }],
    output: { item_id: 'output', quantity: 1 }, duration_minutes: 1440,
  } as Entity;
  const prices: PriceIndex = {
    'quality-input': { sell_price: 50, quality_eligible: true },
    'fixed-input': { sell_price: 20, quality_eligible: false },
    output: { sell_price: 100, quality_eligible: true },
  };

  expect(entityMetrics(process, 'brand', prices)).toMatchObject({ buy: 120, sell: 200, profit: 80 });
});
