import { describe, expect, it } from 'vitest';
import { formatQualityPrice, parseQuality, qualityLabel, qualityPrice, qualityTargetSteps, type QualityTarget } from './quality';

describe('quality prices', () => {
  it('applies all verified game multipliers', () => {
    expect(qualityPrice(40, true, 'normal')?.value).toBe(40);
    expect(qualityPrice(40, true, 'copper')?.value).toBe(50);
    expect(qualityPrice(40, true, 'silver')?.value).toBe(60);
    expect(qualityPrice(40, true, 'gold')?.value).toBe(70);
    expect(qualityPrice(40, true, 'brand')?.value).toBe(80);
  });

  it('keeps fixed-price items unchanged', () => {
    expect(qualityPrice(40, false, 'brand')).toMatchObject({ value: 40, exact: true });
  });

  it('marks fractional results as estimates', () => {
    expect(formatQualityPrice(qualityPrice(63, true, 'copper'))).toBe('≈78.75');
  });

  it('normalizes unknown URL values and exposes labels', () => {
    expect(parseQuality('bogus')).toBe('normal');
    expect(qualityLabel('gold')).toBe('金★');
    expect(formatQualityPrice(null)).toBe('数据不足');
  });
});

describe('harvest quality targets', () => {
  const rice: QualityTarget = { seed_item_id: 'ITEM_ID_SEED_RICE', count_item_id: 'ITEM_ID_CROPS_RICE', count_item_numeric_id: 100400, need: 1000, copper: 100, silver: 400, gold: 1000 };

  it('counts what is left before each grade and the seeds that covers', () => {
    expect(qualityTargetSteps(rice, 10, 150)).toEqual([
      { quality: 'copper', count: 100, remaining: 0, seeds: 0 },
      { quality: 'silver', count: 400, remaining: 250, seeds: 25 },
      { quality: 'gold', count: 1000, remaining: 850, seeds: 85 },
    ]);
  });

  it('rounds seeds up and leaves them unknown without a yield', () => {
    expect(qualityTargetSteps(rice, 12).map(step => step.seeds)).toEqual([9, 34, 84]);
    expect(qualityTargetSteps(rice, null).map(step => step.seeds)).toEqual([null, null, null]);
    expect(qualityTargetSteps(rice, 0, 2000).map(step => [step.remaining, step.seeds])).toEqual([[0, null], [0, null], [0, null]]);
  });
});
