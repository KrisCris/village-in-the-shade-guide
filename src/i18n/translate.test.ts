import { describe, expect, it } from 'vitest';
import { createTranslate, createTranslateHtml, format, interpolate, localizeLinks } from './translate';

describe('translate', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(format('{count} 条', { count: 3 })).toBe('3 条');
    expect(format('{a} / {b}', { a: 1 })).toBe('1 / {b}');
    expect(format('{value}', { value: 0n })).toBe('0');
  });

  it('uses the source text for the default language and the catalog otherwise', () => {
    const messages = { '{count} 条': '{count} 件' };
    expect(createTranslate('zh-CN', messages)('{count} 条', { count: 2 })).toBe('2 条');
    expect(createTranslate('ja', messages)('{count} 条', { count: 2 })).toBe('2 件');
  });

  it('escapes HTML parameters and localizes internal links', () => {
    const t = createTranslate('ja', { '见<a href="/data/fish/">{name}</a>': '<a href="/data/fish/">{name}</a>を見る' });
    const tHtml = createTranslateHtml('ja', t);
    expect(tHtml('见<a href="/data/fish/">{name}</a>', { name: '<b>' })).toBe('<a href="/ja/data/fish/">&lt;b&gt;</a>を見る');
  });

  it('only rewrites site-relative links', () => {
    expect(localizeLinks('<a href="https://appmedia.jp/">x</a> <a href="/planner/">y</a>', 'zh-TW')).toBe(
      '<a href="https://appmedia.jp/">x</a> <a href="/zh-TW/planner/">y</a>',
    );
  });

  it('splits a template so elements can sit inside a sentence', () => {
    expect(interpolate('{link} を開く', { link: 0 })).toEqual([0, ' を開く']);
    expect(interpolate('{a}{missing}', { a: 'x' })).toEqual(['x', '{missing}']);
  });
});
