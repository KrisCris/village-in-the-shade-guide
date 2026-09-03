import { describe, expect, it } from 'vitest';
import { readQuality, writeQualityToUrl } from './qualityPreference';

describe('quality preference URL behavior', () => {
  it('prefers a valid URL quality over storage', () => {
    expect(readQuality('?quality=gold', 'silver')).toBe('gold');
  });

  it('falls back to normal for invalid values', () => {
    expect(readQuality('?quality=hacked', 'hacked')).toBe('normal');
  });

  it('uses a valid stored quality when the URL has no quality', () => {
    expect(readQuality('?sort=sell', 'copper')).toBe('copper');
  });

  it('preserves unrelated query parameters', () => {
    expect(writeQualityToUrl('/data/crops/?sort=sell', 'silver')).toBe('/data/crops/?sort=sell&quality=silver');
  });

  it('removes the quality parameter for normal quality', () => {
    expect(writeQualityToUrl('/data/crops/?quality=gold&sort=sell', 'normal')).toBe('/data/crops/?sort=sell');
  });
});
