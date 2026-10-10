import { describe, expect, it } from 'vitest';
import { characterGuideRedirects, guideCategories, guides, localizeGuide, translateHeading } from './guideContent';
import { toTraditional } from '../i18n/traditional';
import characters from '../../data/generated/build-25311578/entities/characters.json';
import sourceCatalog from '../../data/sources/appmedia-honogurashi.json';

const kana = /[ぁ-ゖァ-ヺ]/;

describe('Chinese guide content', () => {
  it('has a kana-free Chinese title and checklist for every source', () => {
    expect(guides.length + characterGuideRedirects.length).toBe(111);
    for (const guide of guides) {
      expect(guide.chineseTitle, guide.sourceId).not.toMatch(kana);
      for (const heading of guide.headings) expect(translateHeading(heading), `${guide.sourceId}: ${heading}`).not.toMatch(kana);
    }
  });
  it('does not publish product articles or their index category', () => {
    expect(guideCategories).not.toContain('产品');
    expect(guides.some((guide) => guide.category === '产品')).toBe(false);
    const productIds = sourceCatalog.sources.filter((source) => source.category === '产品').map((source) => source.sourceId);
    expect(productIds).toHaveLength(4);
    expect(characterGuideRedirects.some((row) => productIds.includes(row.sourceId))).toBe(false);
  });
  it('does not publish the obsolete overview article or its category', () => {
    expect(guideCategories).not.toContain('总览');
    expect(guides.some((guide) => guide.category === '总览' || guide.sourceId === 'home')).toBe(false);
    expect(characterGuideRedirects.some((row) => row.sourceId === 'home')).toBe(false);
  });
  it('retires all 14 individual character guides in favor of matching native routes', () => {
    expect(characterGuideRedirects).toHaveLength(14);
    for (const redirect of characterGuideRedirects) {
      const source = sourceCatalog.sources.find((row) => row.sourceId === redirect.sourceId)!;
      const character = characters.find((row) => row.name.ja === source.title)!;
      expect(redirect.target).toBe(`/data/characters/${character.id}/`);
      expect(guides.some((guide) => guide.sourceId === redirect.sourceId)).toBe(false);
    }
    expect(characterGuideRedirects.find((row) => row.sourceId === '80257687')?.target)
      .toBe('/data/characters/CHARA_ID_FEMALE_DOCTOR/');
    expect(guides.some((guide) => guide.guideTarget === '/guides/residents/')).toBe(true);
    expect(guides.some((guide) => guide.guideTarget === '/guides/progression/')).toBe(true);
  });
});

describe('localized guide titles', () => {
  it('uses the source title on Japanese pages without the site suffix', () => {
    for (const guide of guides) {
      const { title, headings } = localizeGuide(guide, 'ja');
      expect(title, guide.sourceId).not.toMatch(/【ほの暮しの庭】$/);
      expect(headings).toBe(guide.headings);
    }
  });
  it('converts the Chinese title and checklist for Traditional Chinese pages', () => {
    for (const guide of guides) {
      const zhCN = localizeGuide(guide, 'zh-CN');
      const zhTW = localizeGuide(guide, 'zh-TW');
      expect(zhCN.title).toBe(guide.chineseTitle);
      expect(zhTW.title, guide.sourceId).toBe(toTraditional(guide.chineseTitle));
      expect(zhTW.headings).toEqual(zhCN.headings.map(toTraditional));
    }
  });
});
