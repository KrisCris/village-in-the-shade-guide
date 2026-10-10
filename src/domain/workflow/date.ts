import { tr } from '../../i18n/active';
export const SEASONS = ['spring','summer','autumn','winter'];
const dayIndex = (day:number) => Math.max(0, Math.floor(Number.isFinite(day) ? day : 1) - 1);
export function seasonAt(day:number):string {return SEASONS[Math.floor(dayIndex(day) / 28) % 4];}
export function yearAt(day:number):number {return Math.floor(dayIndex(day) / 112) + 1;}
const seasonName = (day:number) => [tr('春'),tr('夏'),tr('秋'),tr('冬')][Math.floor(dayIndex(day) / 28) % 4];
export function formatDay(day:number):string {return tr('第{year}年 {season}{day}日', {year:yearAt(day), season:seasonName(day), day:dayIndex(day) % 28 + 1});}
/** Year and season of a day, for month headers. */
export function formatSeason(day:number):string {return tr('第{year}年 {season}季', {year:yearAt(day), season:seasonName(day)});}
