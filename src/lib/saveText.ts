import { Converter } from 'opencc-js/t2cn';
import { activeLocale } from '../i18n/active';

/** Player, pet, animal and brand names. Patch 1.30 raised the cap from 5 to 8 characters (UPDATE_TEXT_1_30). */
export const NAME_LIMIT = 8;

/**
 * Traditional → Simplified, for search normalization only. Never apply it to
 * display text: Japanese kanji share Traditional forms (漬物樽 would become
 * 渍物樽), and editable save values must stay as the player wrote them.
 */
export const simplifySaveText = Converter({ from: 'tw', to: 'cn' });

type Translations = Record<string, string> | undefined;

/** The game's own text for the page language; the source value is Simplified Chinese. */
export function gameText(value: string, translations?: Translations): string {
  return translations?.[activeLocale()] || value;
}

/**
 * Localize game data for the page language: every `field` with a sibling
 * `fieldTranslations` takes the official text. IDs, codes and numbers are left
 * alone, and the translation tables stay for cross-language lookups.
 */
export function localizeGameData<T>(data: T): T {
  if (activeLocale() === 'zh-CN') return data;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.some((entry) => entry && typeof entry === 'object') ? value.map(walk) : value;
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      const translations = record[`${key}Translations`] as Translations;
      result[key] = typeof entry === 'string' && translations ? gameText(entry, translations) : key.endsWith('Translations') ? entry : walk(entry);
    }
    return result;
  };
  return walk(data) as T;
}
