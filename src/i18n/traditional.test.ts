import { describe, expect, it } from 'vitest';
import { createTraditional, quotes, toTraditional } from './traditional';

describe('Traditional Chinese conversion', () => {
  it('converts with Taiwan phrasing and the game quotation style', () => {
    expect(quotes('“布”‘衣’')).toBe('「布」『衣』');
    expect(toTraditional('打开“设置”')).toBe('開啟「設定」');
  });

  it('lets official terms win over OpenCC, longest match first', () => {
    const convert = createTraditional({ 山女鱼: '山女魚', 山女: 'X' });
    expect(convert('钓山女鱼')).toBe('釣山女魚');
  });

  it('applies the hand-written vocabulary', () => {
    expect(toTraditional('姜')).toBe('薑');
    expect(toTraditional('计划')).toBe('計畫');
    // OpenCC reads 天后 and 球后 as titles (Queen of Heaven, female sports star).
    expect(toTraditional('3 天后到账')).toBe('3 天後到帳');
    expect(toTraditional('遇到煤炭球后')).toBe('遇到煤炭球後');
  });

  it('works without any terms', () => {
    expect(createTraditional({})('简体')).toBe('簡體');
  });
});
