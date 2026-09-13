export const GAME_SEASONS = ['春', '夏', '秋', '冬'] as const;
const DAY = 86400n;
const DAY_START = 7n * 3600n;
export const MAX_GAME_SECONDS = (1n << 63n) - 1n;
export interface GameDate {
  year: string;
  season: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/** Calendar days turn over at 07:00; early morning stays on the same game day. */
export function splitGameTime(value: string): GameDate | null {
  if (!/^\d+$/.test(value)) return null;
  const seconds = BigInt(value);
  if (seconds > MAX_GAME_SECONDS) return null;
  const days = seconds / DAY;
  const clock = (seconds % DAY + DAY_START) % DAY;
  return {
    year: String(days / 112n + 1n), season: String(days % 112n / 28n), day: String(days % 28n + 1n),
    hour: String(clock / 3600n), minute: String(clock % 3600n / 60n), second: String(clock % 60n),
  };
}

export function joinGameTime(date: GameDate): string | null {
  if (!Object.values(date).every(value => /^\d+$/.test(value))) return null;
  const { year, season, day, hour, minute, second } = Object.fromEntries(Object.entries(date).map(([key, value]) => [key, BigInt(value)])) as Record<keyof GameDate, bigint>;
  if (year < 1n || season > 3n || day < 1n || day > 28n || hour > 23n || minute > 59n || second > 59n) return null;
  const days = (year - 1n) * 112n + season * 28n + day - 1n;
  const result = days * DAY + (hour * 3600n + minute * 60n + second - DAY_START + DAY) % DAY;
  return result <= MAX_GAME_SECONDS ? String(result) : null;
}
