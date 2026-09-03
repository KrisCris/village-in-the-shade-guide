import { pinyin } from 'pinyin-pro';

export function buildPinyinAliases(value: string): string[] {
  if (!/[\u3400-\u9fff]/u.test(value)) return [];
  const spaced = pinyin(value, { toneType: 'none', type: 'array' }).join(' ').toLowerCase();
  const compact = spaced.replaceAll(' ', '');
  const initials = pinyin(value, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
  return [...new Set([compact, spaced, initials].filter(Boolean))];
}
