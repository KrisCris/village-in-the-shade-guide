import { addDays, DAYS_PER_SEASON, festivalsOn, GIFTS, isFestivalEve, LATE_NIGHT_DAYS, type CalendarFestival } from '../data/calendar';
import type { DailyResident } from '../data/dailyPayload';
import type { DailyStack, DailyVillager } from '../lib/saveDaily';

/**
 * Residents, birthdays and the calendar for the daily planner: who still takes
 * a gift today and which of their liked items are held, whose birthday is near,
 * and the festivals and Evaluation days of the coming week.
 */
export interface GameDay { year: number; season: number; day: number }

export interface ResidentDay {
  resident: DailyResident;
  love: number;
  talked: boolean;
  giftsToday: number;
  giftsWeek: number;
  /** Days until the next birthday, 0 on the day; null without one. */
  birthdayIn: number | null;
  /** Gifts that still count today: the weekly limit does not apply on a birthday. */
  giftsLeft: number;
  /** Liked items in the backpack and storage, most held first. */
  liked: Array<[itemId: number, count: number]>;
}

export type WeekEvent =
  | { kind: 'birthday'; offset: number; date: GameDay; resident: number }
  | { kind: 'festival' | 'fair'; offset: number; date: GameDay; festival: CalendarFestival }
  /** The Evaluation notice, answered with the division to enter. */
  | { kind: 'letter'; offset: number; date: GameDay; festival: CalendarFestival }
  /** The last day of a season: crops that cannot grow next season wither at the turnover. */
  | { kind: 'end'; offset: number; date: GameDay };

export interface VillagerPlan {
  residents: ResidentDay[];
  /** Events from today through the next six days, in date order. */
  week: WeekEvent[];
  /**
   * The late night after today's midnight: 'never' on a festival eve, 'always' on days 1 and 15
   * (and in a thunderstorm), otherwise 'maybe'. Null before chapter 1 ends, and for a save made after midnight, whose night is already here.
   */
  tonight: 'never' | 'always' | 'maybe' | null;
}

/** Days from one date to the next time (season, day) comes round, 0 when it is that day. */
export function daysUntil(from: GameDay, season: number, day: number): number {
  const year = DAYS_PER_SEASON * 4, offset = season * DAYS_PER_SEASON + day - (from.season * DAYS_PER_SEASON + from.day);
  return (offset % year + year) % year;
}

const EVENT_ORDER: WeekEvent['kind'][] = ['festival', 'fair', 'birthday', 'letter', 'end'];

export function villagerPlan(input: {
  date: GameDay & { hour: number };
  /** The save's weather ID: a thunderstorm always brings a late night. */
  weather: number;
  /** Late nights have started (after chapter 1). */
  lateNights: boolean;
  residents: DailyResident[];
  villagers: DailyVillager[];
  held: DailyStack[];
  festivals: CalendarFestival[];
}): VillagerPlan {
  const { date } = input;
  const held = new Map<number, number>();
  for (const stack of input.held) held.set(stack.itemId, (held.get(stack.itemId) ?? 0) + stack.count);
  const state = new Map(input.villagers.map((villager) => [villager.id, villager]));

  const residents = input.residents.map((resident): ResidentDay => {
    const saved = state.get(resident.id);
    const birthdayIn = resident.birthday ? daysUntil(date, ...resident.birthday) : null;
    const giftsToday = saved?.giftsToday ?? 0, giftsWeek = saved?.giftsWeek ?? 0;
    const weekly = birthdayIn === 0 && GIFTS.birthday_outside_weekly ? Infinity : GIFTS.per_week - giftsWeek;
    return {
      resident, love: saved?.love ?? 0, talked: saved?.talked ?? false, giftsToday, giftsWeek, birthdayIn,
      giftsLeft: Math.max(0, Math.min(GIFTS.per_day - giftsToday, weekly)),
      liked: resident.likes.flatMap((itemId): Array<[number, number]> => held.get(itemId) ? [[itemId, held.get(itemId)!]] : []).sort((a, b) => b[1] - a[1]),
    };
  });

  const week: WeekEvent[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = addDays(date, offset);
    for (const festival of festivalsOn(input.festivals, day.season, day.day, day.year)) week.push({ kind: festival.key === 'FAIR' ? 'fair' : 'festival', offset, date: day, festival });
    for (const festival of input.festivals.filter((entry) => entry.key === 'FAIR' && entry.letterDay === day.day)) week.push({ kind: 'letter', offset, date: day, festival });
    for (const resident of input.residents.filter((entry) => entry.birthday?.[0] === day.season && entry.birthday[1] === day.day)) week.push({ kind: 'birthday', offset, date: day, resident: resident.id });
    if (day.day === DAYS_PER_SEASON) week.push({ kind: 'end', offset, date: day });
  }
  week.sort((a, b) => a.offset - b.offset || EVENT_ORDER.indexOf(a.kind) - EVENT_ORDER.indexOf(b.kind));

  const tonight = date.hour < 7 || !input.lateNights ? null : isFestivalEve(date.season, date.day) ? 'never' : LATE_NIGHT_DAYS.includes(date.day) || input.weather === THUNDERSTORM ? 'always' : 'maybe';
  return { residents, week, tonight };
}

/** WEATHER_ID_THUNDERSTORM as the save keeps it (5, 雷雨 in the save editor's weather names). */
export const THUNDERSTORM = 5;

/** Birthday first, then residents who still take a gift and like something held, then the nearest birthdays. */
export function residentOrder(a: ResidentDay, b: ResidentDay): number {
  const rank = (entry: ResidentDay) => entry.birthdayIn === 0 && entry.giftsLeft > 0 ? 0 : entry.giftsLeft > 0 && entry.liked.length ? 1 : entry.giftsLeft > 0 ? 2 : 3;
  return rank(a) - rank(b) || (a.birthdayIn ?? 999) - (b.birthdayIn ?? 999) || a.resident.id - b.resident.id;
}
