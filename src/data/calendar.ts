import calendar from '../../data/sources/game-calendar.json';
import type { Locale } from '../i18n/locales';

/**
 * The village calendar from data/sources/game-calendar.json (tools/extract-calendar.py):
 * festivals, the Evaluation on the 27th, the days without a late night, weekdays and gift limits.
 * Seasons are 0 spring … 3 winter and days 1–28, as the save keeps them.
 */
export const DAYS_PER_SEASON = calendar.days_per_season;
export const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonKey = (typeof SEASON_KEYS)[number];
export const GIFTS = calendar.gifts;

/** 0 Monday … 6 Sunday; every season starts on a Monday. */
export const weekday = (day: number) => (day - 1 + calendar.week.first_day_weekday) % 7;
export const weekdayName = (index: number, locale: Locale) => calendar.week.weekday_names[index][locale];
export const isWeekend = (day: number) => weekday(day) >= 5;

export type FestivalKey = 'SAKURA_VIEWING' | 'FESTIVAL' | 'HARVEST' | 'NEW_YEARS_EVE' | 'FAIR';
export interface CalendarFestival {
  key: FestivalKey;
  /** Every season for the Evaluation. */
  season: number | null;
  day: number;
  /** Day the invitation letter (for the Evaluation, the entry form) arrives. */
  letterDay: number;
  fromYear: number;
  start: string;
  end: string;
  name: string;
}

export function festivals(locale: Locale): CalendarFestival[] {
  return [
    ...calendar.festivals.map((festival) => ({
      key: festival.key as FestivalKey, season: SEASON_KEYS.indexOf(festival.season as SeasonKey), day: festival.day, letterDay: festival.letter_day,
      fromYear: festival.from_year, start: festival.start, end: festival.end, name: festival.names[locale],
    })),
    { key: 'FAIR', season: null, day: calendar.fair.day, letterDay: calendar.fair.letter_day, fromYear: 1, start: calendar.fair.start, end: calendar.fair.end, name: calendar.fair.names[locale] },
  ];
}

/** The festivals held on a day of a season, in a given year (the Cherry Blossom Festival starts in Year 2). */
export function festivalsOn(list: CalendarFestival[], season: number, day: number, year = Infinity): CalendarFestival[] {
  return list.filter((festival) => (festival.season === null || festival.season === season) && festival.day === day && year >= festival.fromYear);
}

/** Festival eves: the game skips the late night (and with it the fox shrine) on these days. */
export function isFestivalEve(season: number, day: number): boolean {
  const eves = calendar.eves as Record<string, number[]>;
  return eves.every_season.includes(day) || (eves[SEASON_KEYS[season]] ?? []).includes(day);
}

/** Days that always bring a late night (after chapter 1), unless purifying salt cancels it. */
export const LATE_NIGHT_DAYS: readonly number[] = calendar.late_night_days;

/** Calendar label for a villager's birthday, in the game's own words. */
export const birthdayLabel = (name: string, locale: Locale) => calendar.birthday_label[locale].replace('<value 1>', name);

/** A date `offset` days after (season, day), wrapping into the following seasons and years. */
export function addDays(date: { year: number; season: number; day: number }, offset: number) {
  const index = ((date.year - 1) * 4 + date.season) * DAYS_PER_SEASON + date.day - 1 + offset;
  return { year: Math.floor(index / (4 * DAYS_PER_SEASON)) + 1, season: Math.floor(index / DAYS_PER_SEASON) % 4, day: index % DAYS_PER_SEASON + 1 };
}
