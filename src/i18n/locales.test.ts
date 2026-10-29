import { describe, expect, it } from 'vitest';
import { isLocale, localeDataPath, localeFromPath, localizePath, stripLocale } from './locales';

describe('locale routes', () => {
  it('keeps the default language on unprefixed URLs', () => {
    expect(localizePath('/data/items/', 'zh-CN')).toBe('/data/items/');
    expect(localizePath('/', 'zh-CN')).toBe('/');
    expect(localizePath('/ja/data/items/', 'zh-CN')).toBe('/data/items/');
  });

  it('prefixes other languages and replaces an existing prefix', () => {
    expect(localizePath('/', 'ja')).toBe('/ja/');
    expect(localizePath('/data/items/', 'zh-TW')).toBe('/zh-TW/data/items/');
    expect(localizePath('/zh-TW/data/items/', 'ja')).toBe('/ja/data/items/');
    expect(localizePath('/ja/data/items/', 'en')).toBe('/en/data/items/');
  });

  it('keeps query and hash, and leaves external or relative URLs alone', () => {
    expect(localizePath('/data/fish/?q=ヤマメ#top', 'ja')).toBe('/ja/data/fish/?q=ヤマメ#top');
    expect(localizePath('https://example.com/a', 'ja')).toBe('https://example.com/a');
    expect(localizePath('//cdn.example.com/a', 'ja')).toBe('//cdn.example.com/a');
    expect(localizePath('#notes', 'ja')).toBe('#notes');
  });

  it('does not treat a path that only starts with the prefix text as localized', () => {
    expect(localeFromPath('/japan/', '/')).toBe('zh-CN');
    expect(localeFromPath('/english/', '/')).toBe('zh-CN');
    expect(stripLocale('/japan/', '/')).toBe('/japan/');
  });

  it('reads and strips the language with a deployment base', () => {
    expect(localeFromPath('/guide/ja/data/', '/guide/')).toBe('ja');
    expect(localeFromPath('/guide/zh-TW', '/guide/')).toBe('zh-TW');
    expect(localeFromPath('/guide/en/guides/', '/guide/')).toBe('en');
    expect(localeFromPath('/guide/data/', '/guide/')).toBe('zh-CN');
    expect(stripLocale('/guide/ja/data/', '/guide/')).toBe('/data/');
    expect(stripLocale('/guide/ja', '/guide/')).toBe('/');
  });

  it('serves non-default page data from per-language copies', () => {
    expect(localeDataPath('/workflow-data.json', 'zh-CN')).toBe('/workflow-data.json');
    expect(localeDataPath('/workflow-data.json', 'ja')).toBe('/locales/ja/workflow-data.json');
    expect(localeDataPath('/workflow-data.json', 'en')).toBe('/locales/en/workflow-data.json');
  });

  it('recognizes only supported languages', () => {
    expect(isLocale('ja')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ko')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
