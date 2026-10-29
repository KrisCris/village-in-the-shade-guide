import { Converter } from 'opencc-js';
import type { Locale } from '../i18n/locales';
import data from '../../data/sources/game-night-monsters.json';

/** Build-time only (the page is static): the game ships no Simplified names for these creatures. */
const toSimplified = Converter({ from: 'tw', to: 'cn' });

export type MonsterKey = keyof typeof data.monsters;
export const monsters = data.monsters;

/** Official name: Japanese, English and Traditional Chinese from creature.dat, Simplified converted from the Traditional one. */
export function monsterName(name: { ja: string; en?: string; zh_hant: string }, locale: Locale) {
  if (locale === 'ja') return name.ja;
  if (locale === 'en') return name.en || name.ja;
  return locale === 'zh-TW' ? name.zh_hant : toSimplified(name.zh_hant);
}

/** Hearts lost to one hit, as a vulgar fraction (4 HP make one heart). */
export function heartText(hearts: number) {
  const whole = Math.floor(hearts), part = Math.round((hearts - whole) * 4);
  const fraction = ['', '¼', '½', '¾'][part];
  return whole ? `${whole}${fraction}` : fraction || '0';
}

/** Game frames (60 per second) as seconds, at most one decimal. */
export const seconds = (frames: number) => String(Math.round(frames / 6) / 10);

/** Map-unit distance as whole tiles (MAP_GLID_SIZE). */
export const tiles = (units: number) => Math.round(units / data.grid);

/** Corners of an area's spawn blocks, for an 'area' map layer. */
export const areaPoints = (blocks: number[][]) => blocks.map(([x, y]) => ({ x, y }));
