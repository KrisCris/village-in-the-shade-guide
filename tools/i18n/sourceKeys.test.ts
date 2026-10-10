import { describe, expect, it } from 'vitest';
import { extractKeys, findUnwrapped, placeholders, stripComments } from './sourceKeys';

describe('source key extraction', () => {
  it('finds literal keys passed to the translation helpers', () => {
    const source = "t('名称'); tHtml(\"见<a href=\\\"/x/\\\">链接</a>\"); msg(`季节`); tr('{count} 个', { count }); format('不是');";
    expect(extractKeys(source)).toEqual(['名称', '见<a href="/x/">链接</a>', '季节', '{count} 个']);
  });

  it('ignores method calls and keys inside comments', () => {
    expect(extractKeys("obj.t('甲'); // t('乙')\n/* tr('丙') */ <!-- t('丁') -->")).toEqual([]);
  });

  it('keeps line numbers when blanking comments', () => {
    expect(stripComments('a /* 一\n二 */ b').split('\n')).toHaveLength(2);
    expect(stripComments('const url = "http://x"; // 注')).toBe('const url = "http://x";     ');
  });

  it('reports Chinese or Japanese left outside translation calls', () => {
    const source = [
      "t('已翻译')",
      "const raw = '未翻译';",
      "const ok = 'ひらがな'; // i18n-ignore",
      '// i18n-ignore-next-line',
      "const skip = '跳过';",
      "const sep = ' · ';",
    ].join('\n');
    expect(findUnwrapped(source)).toEqual([{ line: 2, text: "const raw = '未翻译';" }]);
  });

  it('honors ignore blocks and whole-file opt-out', () => {
    expect(findUnwrapped("// i18n-ignore-start\nconst a = '甲';\n// i18n-ignore-end\nconst b = '乙';")).toEqual([{ line: 4, text: "const b = '乙';" }]);
    expect(findUnwrapped("// i18n-ignore-file\nconst a = '甲';")).toEqual([]);
  });

  it('compares placeholders regardless of order', () => {
    expect(placeholders('{b} 与 {a}')).toBe(placeholders('{a} and {b}'));
    expect(placeholders('{a}')).not.toBe(placeholders('{a} {b}'));
  });
});
