import { describe, expect, it } from 'vitest';
import { buildSaveSearchText, normalizeSearch } from './saveSearch';

describe('save editor search uses catalog phonetics', () => {
  it('matches names, compact/spaced pinyin, initials, and IDs', () => {
    const text = buildSaveSearchText('腌渍小黄瓜', '211000');
    for (const query of ['小黄瓜', 'yanzixiaohuanggua', 'yan zi xiao huang gua', 'yzxhg', '  YZXHG  ', '２１１０００']) {
      expect(text.includes(normalizeSearch(query)), query).toBe(true);
    }
    expect(text.includes(normalizeSearch('yangcong'))).toBe(false);
  });
  it('supports traditional quest titles and Chinese field labels', () => {
    expect(buildSaveSearchText('規矩之二，要為村子盡一份力。')).toContain('guiju');
    const text = buildSaveSearchText('持有金钱', 'money_');
    expect(text).toContain('jin qian');
    expect(text).toContain('cyjq');
    expect(text).toContain('money_');
  });
});
