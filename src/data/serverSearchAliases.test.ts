import { expect, it } from 'vitest';
import { buildPinyinAliases } from './serverSearchAliases';

it('builds compact, spaced and initial pinyin aliases', () => {
  expect(buildPinyinAliases('洋葱')).toEqual(expect.arrayContaining(['yangcong', 'yang cong', 'yc']));
});
