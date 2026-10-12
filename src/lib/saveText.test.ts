import { afterEach, describe, expect, it } from 'vitest';
import { setActiveI18n } from '../i18n/active';
import { format } from '../i18n/translate';
import { gameText, localizeGameData } from './saveText';

const as = (locale: 'zh-CN' | 'zh-TW' | 'ja') => setActiveI18n({ locale, t: format });
const tool = { itemId: 660001, code: 'ITEM_ID_TOOL_WATERING_CAN_1', name: '浇水壶', nameTranslations: { ja: 'ジョウロ', 'zh-TW': '澆水壺', 'zh-CN': '浇水壶' } };

describe('game text for the page language', () => {
  afterEach(() => as('zh-CN'));

  it('uses the official text and keeps IDs, codes and the translation table', () => {
    as('ja');
    expect(localizeGameData({ tools: [tool] }).tools[0]).toEqual({ ...tool, name: 'ジョウロ' });
    as('zh-TW');
    expect(localizeGameData([tool])[0].name).toBe('澆水壺');
  });

  it('leaves Simplified Chinese source data untouched on the default language', () => {
    const data = { tools: [tool] };
    expect(localizeGameData(data)).toBe(data);
  });

  it('falls back to the source text when the game has no translation', () => {
    as('ja');
    expect(gameText('我的家')).toBe('我的家');
    expect(gameText('浇水壶', { ja: '' })).toBe('浇水壶');
  });
});

describe('save editor game data', () => {
  const sources = import.meta.glob('../../data/sources/game-save-*.json', { eager: true, import: 'default' });
  it('ships Japanese and Traditional Chinese text for every translated field', () => {
    const gaps: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) return value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      if (!value || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value)) {
        if (key.endsWith('Translations')) {
          const table = entry as Record<string, string>;
          if (!table.ja || !table['zh-TW']) gaps.push(`${path}.${key}`);
        } else walk(entry, `${path}.${key}`);
      }
    };
    for (const [file, data] of Object.entries(sources)) walk(data, file.split('/').at(-1)!);
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    expect(gaps).toEqual([]);
  });
});
