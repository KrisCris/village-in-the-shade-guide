import { describe, expect, it } from 'vitest';
import { formatQualityPrice, parseQuality, qualityLabel, qualityPrice } from './quality';

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
