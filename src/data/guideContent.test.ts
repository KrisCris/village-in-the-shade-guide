import { describe, expect, it } from 'vitest';
import { characterGuideRedirects, guideCategories, guides, localizeGuide, pendingGuides, translateHeading } from './guideContent';
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

describe('guide index audit', () => {
  const byTitle = (title: string) => guides.find((guide) => guide.title === title)!;
  it('sends topics our own guides cover to those guides', () => {
    expect(byTitle('釣りのやり方').guideTarget).toBe('/guides/fishing-spots/');
    expect(byTitle('採掘のやり方').guideTarget).toBe('/guides/quarry/');
    expect(byTitle('品評会の勝ち方').guideTarget).toBe('/guides/livestock-plan/#fair');
    for (const title of ['ヤギの解放条件と入手アイテム', 'カシミヤヤギの解放条件と入手アイテム', 'ブタの解放条件と入手アイテム', 'ウマの解放条件と入手アイテム', 'カラーヒヨコの入手方法と雄鶏の入手アイテム'])
      expect(byTitle(title).guideTarget, title).toBe('/guides/livestock-plan/#unlock');
    expect(byTitle('スプリンクラー').guideTarget).toMatch(/^\/data\/items\/ITEM_ID_GIMMICK_SPRINKLER_/);
    const chapters = guides.filter((guide) => /^[春夏秋冬]月[前後]半/.test(guide.title));
    expect(chapters).toHaveLength(9);
    for (const chapter of chapters) expect(chapter.guideTarget).toBe('/guides/progression/#story');
  });
  it('drops basic and off-topic topics back to the guide index', () => {
    for (const title of ['雑談・質問掲示板', 'セーブのやり方', 'マルチはある？', '注視の使い方', 'あんしん暮しモード', '取り返せないこと', '指笛の種類'])
      expect(byTitle(title).guideTarget, title).toBe('/guides/');
  });
  it('lists only topics without a guide of our own as pending', () => {
    expect(pendingGuides.every((guide) => !guide.guideTarget)).toBe(true);
    expect(pendingGuides.some((guide) => guide.title === '雪女')).toBe(true);
    expect(pendingGuides.some((guide) => guide.title === '釣りのやり方')).toBe(false);
  });
});
