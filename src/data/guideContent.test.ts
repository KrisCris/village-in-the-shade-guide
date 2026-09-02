import { describe, expect, it } from 'vitest';
import { guides, translateHeading } from './guideContent';

const kana = /[ぁ-ゖァ-ヺ]/;

describe('Chinese guide content', () => {
  it('has a kana-free Chinese title and checklist for every source', () => {
    expect(guides).toHaveLength(116);
    for (const guide of guides) {
      expect(guide.chineseTitle, guide.sourceId).not.toMatch(kana);
      for (const heading of guide.headings) expect(translateHeading(heading), `${guide.sourceId}: ${heading}`).not.toMatch(kana);
    }
  });
});
