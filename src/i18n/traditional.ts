import { Converter } from 'opencc-js';
import terms from './catalogs/zh-TW.terms.json';

export const opencc = Converter({ from: 'cn', to: 'twp' });

/**
 * Simplified → Traditional with Taiwan phrasing. Official game terms
 * (zh-TW.terms.json: the game's own zh-TW names plus a short vocabulary list)
 * win over OpenCC, and quotation marks follow the game's 「」 style.
 * Build-time only; keep it out of browser bundles.
 */
export function createTraditional(terms: Record<string, string>) {
  const entries = Object.entries(terms).sort(([a], [b]) => b.length - a.length);
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = entries.length ? new RegExp(entries.map(([source]) => escape(source)).join('|'), 'g') : null;
  const index = new Map(entries.map(([source], i) => [source, i]));
  // Private-use characters stand in for protected terms while OpenCC runs.
  const token = (i: number) => String.fromCharCode(0xe000 + i);
  const tokens = new RegExp(`[${token(0)}-${token(Math.max(entries.length - 1, 0))}]`, 'g');
  return (text: string): string => {
    const protectedText = pattern ? text.replace(pattern, (match) => token(index.get(match)!)) : text;
    return quotes(opencc(protectedText).replace(tokens, (char) => entries[char.charCodeAt(0) - 0xe000][1]));
  };
}

export const quotes = (text: string) => text.replace(/“/g, '「').replace(/”/g, '」').replace(/‘/g, '『').replace(/’/g, '』');

export const toTraditional = createTraditional(terms as Record<string, string>);
