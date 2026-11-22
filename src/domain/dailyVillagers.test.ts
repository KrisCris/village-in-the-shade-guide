import { describe, expect, it } from 'vitest';
import { festivals } from '../data/calendar';
import type { DailyResident } from '../data/dailyPayload';
import type { DailyVillager } from '../lib/saveDaily';
import { dailyActions } from './dailyActions';
import type { DailyDigest } from './dailyDigest';
import { daysUntil, residentOrder, THUNDERSTORM, villagerPlan } from './dailyVillagers';

const RIN = 1040, KISUKE = 1020, SUMIRE = 1120;
const residents: DailyResident[] = [
  { id: KISUKE, birthday: [0, 18], likes: [10, 11], dislikes: [] },
  { id: RIN, birthday: [0, 4], likes: [20, 21, 22], dislikes: [30] },
  { id: SUMIRE, birthday: [0, 21], likes: [40], dislikes: [] },
];
const villager = (id: number, fields: Partial<DailyVillager> = {}): DailyVillager => ({ id, love: 0, talked: false, giftsToday: 0, giftsWeek: 0, ...fields });
const plan = (date: { year?: number; season?: number; day: number; hour?: number }, fields: Partial<Parameters<typeof villagerPlan>[0]> = {}) => villagerPlan({
  date: { year: 1, season: 0, hour: 9, ...date }, weather: 1, lateNights: true, residents, villagers: residents.map((entry) => villager(entry.id)),
  held: [], festivals: festivals('en'), ...fields,
});

describe('resident days', () => {
  it('counts the days to the next birthday across the year end', () => {
    expect(daysUntil({ year: 1, season: 0, day: 4 }, 0, 4)).toBe(0);
    expect(daysUntil({ year: 1, season: 0, day: 1 }, 0, 4)).toBe(3);
    expect(daysUntil({ year: 1, season: 3, day: 27 }, 0, 4)).toBe(5);
  });

  it('applies the daily and weekly gift limits, but not the weekly one on a birthday', () => {
    const villagers = [villager(KISUKE, { giftsWeek: 2 }), villager(RIN, { giftsWeek: 2 }), villager(SUMIRE, { giftsToday: 1, giftsWeek: 1 })];
    const byId = new Map(plan({ day: 4 }, { villagers }).residents.map((entry) => [entry.resident.id, entry]));
    expect(byId.get(KISUKE)!.giftsLeft).toBe(0);
    expect(byId.get(RIN)).toMatchObject({ birthdayIn: 0, giftsLeft: 1 });
    expect(byId.get(SUMIRE)!.giftsLeft).toBe(0);
  });

  it('lists held liked items, most held first, and puts a birthday ahead of everyone', () => {
    const held = [{ itemId: 21, rank: 0, count: 2 }, { itemId: 22, rank: 2, count: 5 }, { itemId: 21, rank: 1, count: 4 }, { itemId: 10, rank: 0, count: 1 }];
    const result = plan({ day: 4 }, { held });
    const rin = result.residents.find((entry) => entry.resident.id === RIN)!;
    expect(rin.liked).toEqual([[21, 6], [22, 5]]);
    expect([...result.residents].sort(residentOrder).map((entry) => entry.resident.id)).toEqual([RIN, KISUKE, SUMIRE]);
  });
});

describe('the coming week', () => {
  it('lists birthdays, the Evaluation notice and festivals within seven days', () => {
    const week = (date: Parameters<typeof plan>[0]) => plan(date).week.map((event) => [event.kind, event.offset, event.date.day]);
    expect(week({ day: 15 })).toEqual([['birthday', 3, 18], ['letter', 4, 19], ['birthday', 6, 21]]);
    // The Cherry Blossom Festival starts in Year 2.
    expect(week({ day: 10 }).filter(([kind]) => kind === 'festival')).toEqual([]);
    expect(week({ year: 2, day: 10 }).filter(([kind]) => kind === 'festival')).toEqual([['festival', 2, 12]]);
    expect(week({ season: 2, day: 22 }).map(([kind, , day]) => [kind, day])).toEqual([['festival', 23], ['fair', 27], ['end', 28]]);
  });

  it('wraps the week into the next season', () => {
    const events = plan({ season: 3, day: 26 }).week;
    expect(events.map((event) => [event.kind, event.date.season, event.date.day])).toEqual([['fair', 3, 27], ['festival', 3, 28], ['end', 3, 28], ['birthday', 0, 4]]);
  });

  it('says when tonight always or never has a late night', () => {
    expect(plan({ day: 11 }).tonight).toBe('never');
    expect(plan({ day: 26 }).tonight).toBe('never');
    expect(plan({ day: 15 }).tonight).toBe('always');
    expect(plan({ day: 9 }, { weather: THUNDERSTORM }).tonight).toBe('always');
    expect(plan({ day: 9 }).tonight).toBe('maybe');
    expect(plan({ day: 15, hour: 2 }).tonight).toBeNull();
    expect(plan({ day: 15 }, { lateNights: false }).tonight).toBeNull();
  });
});

describe('birthday and festival tasks', () => {
  const digest = (hour: number): DailyDigest => ({
    date: { year: 1, season: 2, day: 23, hour, minute: 0 }, daysLeft: 5, hoursToTurnover: hour < 7 ? 7 - hour : 0, harvest: [], forecast: [],
    seasonEnd: { lost: [], witherTomorrow: [] }, scarecrows: [], chores: { water: [], withered: [], spentScarecrows: [], hungry: 0, shipping: 0 },
    machines: { done: [], running: [], idle: [], freeSlots: 0 },
  });
  const run = (hour: number, villagers: DailyVillager[] = residents.map((entry) => villager(entry.id))) => dailyActions({
    digest: digest(hour), processing: { produce: [], machines: [], build: [] }, materials: [], planting: [], vacant: 0, animals: [],
    deliveries: { ready: [], pending: [], done: 0, total: 0, gates: { catalogOpen: true, shrine: { clears: 0, open: true, gone: false }, repair: { level: 0, open: true, last: 4 } }, keep: [] },
    villagers: villagerPlan({ date: { year: 1, season: 2, day: 23, hour }, weather: 1, lateNights: true, residents: [{ id: RIN, birthday: [2, 23], likes: [], dislikes: [] }], villagers, held: [], festivals: festivals('en') }),
  });

  it('puts today’s festival and birthday at the top', () => {
    expect(run(9).map((action) => action.kind === 'event' ? action.event.festival.key : action.kind)).toEqual(['HARVEST', 'birthday']);
  });

  it('drops a birthday once the gift is given and keeps both for the morning in a midnight save', () => {
    expect(run(9, [villager(RIN, { giftsToday: 1 })]).map((action) => action.kind)).toEqual(['event']);
    expect(run(2).map((action) => [action.kind, 'later' in action && action.later])).toEqual([['event', true], ['birthday', true]]);
  });
});
