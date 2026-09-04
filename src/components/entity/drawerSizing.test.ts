import { describe, expect, it } from 'vitest';
import { clampDrawerWidth } from './drawerSizing';

describe('drawer sizing', () => {
  it.each([
    [200, 1400, 480],
    [800, 1400, 800],
    [1300, 1400, 1260],
    [800, 600, 600],
  ])('clamps %s for viewport %s to %s', (width, viewport, expected) => {
    expect(clampDrawerWidth(width, viewport)).toBe(expected);
  });
});
