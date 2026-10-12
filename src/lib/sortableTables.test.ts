import { describe, expect, it } from 'vitest';
import { compareKeys, sortKey } from './sortableTables';

describe('sortable table keys', () => {
  it('reads leading numbers from percentages, approximations, counts and ranges', () => {
    expect(sortKey('12.5%')).toBe(12.5);
    expect(sortKey('≈22.4')).toBe(22.4);
    expect(sortKey('3 种')).toBe(3);
    expect(sortKey('11–20')).toBe(11);
    expect(sortKey('1,200')).toBe(1200);
    expect(sortKey('-3940')).toBe(-3940);
    expect(sortKey('Lv2')).toBe('Lv2');
  });
  it('treats blanks and dashes as empty', () => {
    expect(sortKey('')).toBeNull();
    expect(sortKey(' — ')).toBeNull();
  });
  it('keeps empty cells last in both directions and orders text naturally', () => {
    const collator = new Intl.Collator('zh-CN', { numeric: true });
    const keys = [5, null, 12, 'Lv10', 'Lv2'];
    expect([...keys].sort((a, b) => compareKeys(a, b, false, collator))).toEqual([5, 12, 'Lv2', 'Lv10', null]);
    expect([...keys].sort((a, b) => compareKeys(a, b, true, collator))).toEqual(['Lv10', 'Lv2', 12, 5, null]);
  });
});
