import { describe, expect, it } from 'vitest';
import { buildDailyDigest, daysToRipe, held, landSummary, needsWater, type CropRules } from './dailyDigest';
import type { DailyCell, DailySnapshot } from '../lib/saveDaily';

const TARO = 46, SPINACH = 58, RICE = 63, SHIITAKE = 55, CHERRY = 101, MANDARIN = 104, TEA = 64, CABBAGE = 1, EDAMAME = 34;
const crops: CropRules = new Map([
  [TARO, { seasons: ['autumn'] }],
  [SPINACH, { seasons: ['winter'] }],
  [RICE, { seasons: ['spring'] }],
  [SHIITAKE, { seasons: ['autumn'] }],
  [CABBAGE, { seasons: ['autumn', 'winter'] }],
  [EDAMAME, { seasons: ['summer'], witheredHarvest: true }],
  [CHERRY, { seasons: ['spring', 'summer', 'autumn', 'winter'], perennial: { kind: 'fruit_tree', bearing_seasons: ['spring'] } }],
  [MANDARIN, { seasons: ['spring', 'summer', 'autumn', 'winter'], perennial: { kind: 'fruit_tree', bearing_seasons: ['winter'] } }],
  [TEA, { seasons: ['spring', 'summer', 'autumn', 'winter'], perennial: { kind: 'shrub', bearing_seasons: ['spring'] } }],
]);

let nextId = 1;
const cell = (fields: Partial<DailyCell>): DailyCell => ({ id: nextId++, crop: 0, wild: false, soil: 1, wet: false, form: 1, growth: 0, maximum: 0, fertilizer: 0, ...fields });
const snapshot = (fields: Partial<DailySnapshot> & { season?: number; day?: number; hour?: number }): DailySnapshot => {
  const { season = 2, day = 10, hour = 7, ...rest } = fields;
  const seconds = (season * 28 + day - 1) * 86_400 + (hour - 7 + 24) % 24 * 3600;
  return {
    seconds, date: { year: 1, season, day, hour, minute: 0 }, weather: 1, money: 0, player: 'p',
    cells: [], machines: [], deliveriesOpen: true, deliveries: [], held: [], shipping: [], animals: { total: 0, fed: 0 }, ...rest,
  };
};

describe('daily crop rules', () => {
  it('counts the watered days a crop still needs', () => {
    expect(daysToRipe({ growth: 0, maximum: 400 })).toBe(4);
    expect(daysToRipe({ growth: 350, maximum: 400 })).toBe(1);
    expect(daysToRipe({ growth: 500, maximum: 400 })).toBe(0);
    expect([0, 1, 2, 3].map((soil) => needsWater({ soil }))).toEqual([false, true, true, false]);
  });

  it('lists ripe crops by kind and size, and the next week by day', () => {
    const digest = buildDailyDigest(snapshot({ cells: [
      cell({ crop: TARO, growth: 400, maximum: 400 }), cell({ crop: TARO, growth: 400, maximum: 400 }),
      cell({ crop: TARO, form: 9 }),
      cell({ crop: CABBAGE, growth: 200, maximum: 400 }), cell({ crop: TARO, growth: 300, maximum: 400 }),
      cell({ crop: TARO, growth: 0, maximum: 900 }),
    ] }), crops);
    expect(digest.harvest.map(({ crop, kind, cells }) => [crop, kind, cells.length])).toEqual([[TARO, 'ripe', 2], [TARO, 'withered', 1]]);
    expect(digest.forecast.map(({ days, groups }) => [days, groups.map((g) => g.crop)])).toEqual([[1, [TARO]], [2, [CABBAGE]]]);
  });

  it('asks for water only on dry tilled soil and ridges with a growing crop', () => {
    const dry = cell({ crop: TARO, soil: 2, maximum: 400 });
    const digest = buildDailyDigest(snapshot({ cells: [
      dry, cell({ crop: TARO, wet: true, maximum: 400 }), cell({ crop: RICE, soil: 3, maximum: 400 }),
      cell({ crop: SHIITAKE, soil: 0, form: 4, maximum: 400 }), cell({ crop: TARO, growth: 400, maximum: 400 }),
      cell({ crop: TARO, form: 2 }), cell({ crop: TEA, soil: 2, form: 10 }),
    ], season: 0 }), crops);
    expect(digest.chores.water).toEqual([dry.id]);
    expect(digest.chores.withered).toEqual([{ crop: TARO, cells: [expect.any(Number)] }]);
  });

  it('shakes grown fruit trees only in their bearing season', () => {
    const trees = [cell({ crop: CHERRY, soil: 0, growth: 900, maximum: 900 }), cell({ crop: MANDARIN, soil: 0, growth: 900, maximum: 900 }), cell({ crop: MANDARIN, soil: 0, growth: 100, maximum: 900 })];
    const winter = buildDailyDigest(snapshot({ cells: trees, season: 3 }), crops);
    expect(winter.harvest.map(({ crop, kind }) => [crop, kind])).toEqual([[MANDARIN, 'shake']]);
    expect(winter.forecast).toEqual([]);
    expect(buildDailyDigest(snapshot({ cells: trees, season: 0 }), crops).harvest.map((g) => g.crop)).toEqual([CHERRY]);
  });

  it('warns about field crops that cannot ripen before they wither at the season change', () => {
    const late = cell({ crop: TARO, growth: 0, maximum: 300 }), inTime = cell({ crop: TARO, growth: 100, maximum: 300 });
    const digest = buildDailyDigest(snapshot({ day: 26, cells: [
      late, inTime, cell({ crop: CABBAGE, maximum: 900 }), cell({ crop: SHIITAKE, soil: 0, form: 4, maximum: 900 }),
    ] }), crops);
    expect(digest.daysLeft).toBe(2);
    expect(digest.seasonEnd.lost).toEqual([{ crop: TARO, cells: [late.id], days: 3 }]);
    // A lost crop is not worth watering and never shows up in the forecast.
    expect(digest.chores.water).not.toContain(late.id);
    expect(digest.forecast.flatMap((day) => day.groups.flatMap((g) => g.cells))).toEqual([inTime.id]);
  });

  it('on the last day, flags ripe crops that wither overnight unless harvested', () => {
    const digest = buildDailyDigest(snapshot({ day: 28, cells: [cell({ crop: TARO, growth: 400, maximum: 400 }), cell({ crop: CABBAGE, growth: 400, maximum: 400 })] }), crops);
    expect(digest.daysLeft).toBe(0);
    expect(digest.seasonEnd.witherAtChange.map((g) => g.crop)).toEqual([TARO]);
  });

  it('lets ripe edamame wither into soybeans but still warns about unripe edamame', () => {
    const unripe = cell({ crop: EDAMAME, growth: 100, maximum: 400 });
    const digest = buildDailyDigest(snapshot({ season: 1, day: 28, cells: [cell({ crop: EDAMAME, growth: 400, maximum: 400 }), unripe] }), crops);
    expect(digest.seasonEnd.witherAtChange).toEqual([]);
    expect(digest.seasonEnd.lost).toEqual([{ crop: EDAMAME, cells: [unripe.id], days: 3 }]);
  });

  it('reports the hours left before the 07:00 turnover in a save made after midnight', () => {
    expect(buildDailyDigest(snapshot({ hour: 0 }), crops).hoursToTurnover).toBe(7);
    expect(buildDailyDigest(snapshot({ hour: 7 }), crops).hoursToTurnover).toBe(0);
  });
});

describe('daily machines, deliveries and chores', () => {
  it('splits machine slots into finished, running, idle machines and spare slots', () => {
    const base = snapshot({});
    const digest = buildDailyDigest({ ...base, machines: [
      { key: 'a', itemId: 10, jobs: [{ output: 7, count: 2, seconds: 600, remaining: 0 }, { output: 7, count: 2, seconds: 600, remaining: 300 }, { output: 0, count: 0, seconds: 0, remaining: 0 }] },
      { key: 'b', itemId: 10, jobs: [{ output: 8, count: 1, seconds: 600, remaining: 60 }] },
      { key: 'c', itemId: 11, jobs: [{ output: 0, count: 0, seconds: 0, remaining: 0 }] },
      { key: 'd', itemId: 11, jobs: [{ output: 0, count: 0, seconds: 0, remaining: 0 }] },
    ] }, crops);
    expect(digest.machines.done).toEqual([{ itemId: 7, count: 2, slots: 1 }]);
    expect(digest.machines.running).toEqual([{ itemId: 8, count: 1, slots: 1, finish: base.seconds + 60 }, { itemId: 7, count: 2, slots: 1, finish: base.seconds + 300 }]);
    expect(digest.machines.idle).toEqual([{ itemId: 11, machines: 2 }]);
    expect(digest.machines.freeSlots).toBe(1);
  });

  it('counts held items of the required quality or better toward deliveries', () => {
    const stacks = [{ itemId: 5, rank: 0, count: 3 }, { itemId: 5, rank: 4, count: 2 }, { itemId: 6, rank: 0, count: 9 }];
    expect(held(stacks, 5, 0)).toBe(5);
    expect(held(stacks, 5, 4)).toBe(2);
    const digest = buildDailyDigest(snapshot({ held: stacks, deliveries: [
      { bundleId: 1, index: 0, itemId: 5, rank: 4, count: 2, remain: 2 },
      { bundleId: 1, index: 1, itemId: 6, rank: 0, count: 20, remain: 10 },
      { bundleId: 2, index: 0, itemId: 6, rank: 0, count: 5, remain: 0 },
    ] }), crops);
    expect(digest.deliveries.ready).toEqual([{ bundleId: 1, index: 0, itemId: 5, rank: 4, remain: 2, have: 2 }]);
    expect(digest.deliveries.missing).toEqual([{ bundleId: 1, index: 1, itemId: 6, rank: 0, remain: 10, have: 9 }]);
  });

  it('counts hungry animals and items waiting in the shipping box', () => {
    const digest = buildDailyDigest(snapshot({ animals: { total: 10, fed: 8 }, shipping: [{ itemId: 1, rank: 0, count: 99 }, { itemId: 2, rank: 0, count: 4 }] }), crops);
    expect(digest.chores).toMatchObject({ hungry: 2, shipping: 103 });
  });
});

describe('land summary', () => {
  it('counts planted, tilled, wild and plain cells inside the farm area only', () => {
    const cells = [cell({ id: 101, crop: TARO }), cell({ id: 102 }), cell({ id: 103, soil: 0, wild: true }), cell({ id: 104, crop: TARO })];
    expect(landSummary(cells, new Set([101, 102, 103, 105]))).toEqual({ area: 4, planted: 1, tilled: 1, plain: 1, wild: 1 });
  });
});
