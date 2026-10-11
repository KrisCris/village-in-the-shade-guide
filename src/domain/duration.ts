import type { Translate } from '../i18n/translate';

/** Game minutes as days, hours and minutes, e.g. 2820 → "1 日 23 小时". */
export function durationText(minutes: number, t: Translate): string {
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  return [days && t('{days} 日', { days }), hours && t('{hours} 小时', { hours }), (rest || !minutes) && t('{minutes} 分钟', { minutes: rest })].filter(Boolean).join(' ');
}
