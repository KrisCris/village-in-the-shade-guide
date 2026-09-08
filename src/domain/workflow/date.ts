export const SEASONS = ['spring','summer','autumn','winter'];
const dayIndex = (day:number) => Math.max(0, Math.floor(Number.isFinite(day) ? day : 1) - 1);
export function seasonAt(day:number):string {return SEASONS[Math.floor(dayIndex(day) / 28) % 4];}
export function yearAt(day:number):number {return Math.floor(dayIndex(day) / 112) + 1;}
export function formatDay(day:number):string {return `第${yearAt(day)}年 ${['春','夏','秋','冬'][Math.floor(dayIndex(day) / 28) % 4]}${dayIndex(day) % 28 + 1}日`;}
