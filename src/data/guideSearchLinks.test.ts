import { describe, expect, it } from 'vitest';
import en from '../i18n/catalogs/en.json';
import ja from '../i18n/catalogs/ja.json';
import zhTW from '../i18n/catalogs/zh-TW.json';
import type { Locale } from '../i18n/locales';
import { applyEntityFilters } from '../components/table/EntityExplorer';
import { getCatalog } from './repository';

// Keys are the Simplified Chinese source text, so they carry the zh-CN links.
const pages: Record<Locale, string[]> = { 'zh-CN': Object.keys(ja), 'zh-TW': Object.values(zhTW), ja: Object.values(ja), en: Object.values(en) };

describe('guide search links', () => {
  for (const [locale, texts] of Object.entries(pages) as Array<[Locale, string[]]>) {
    it(`find at least one entry on ${locale} pages`, () => {
      const catalog = getCatalog(locale);
      const links = [...new Set(texts.flatMap((text) => [...text.matchAll(/href="\/data\/([\w-]+)\/\?q=([^"#&]+)"/g)].map((match) => `${match[1]}|${match[2]}`)))];
      expect(links.length).toBeGreaterThanOrEqual(4);
      const empty = links.filter((link) => {
        const [kind, query] = link.split('|');
        return applyEntityFilters(catalog.entities.filter((entity) => entity.kind === kind), { query }).length === 0;
      });
      expect(empty).toEqual([]);
    });
  }
});
