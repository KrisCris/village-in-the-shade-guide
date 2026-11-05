import { describe, expect, it } from 'vitest';
import type { DailyQuality } from '../data/dailyPayload';
import type { CropRules } from './dailyDigest';
import { harvestGrade, harvestGrades, qualityProgress } from './dailyQuality';
import type { SourceContext } from './dailySources';

const RICE = 63, EDAMAME = 34, TEA = 64, TOMATO = 21, PADDY = 65;
const RICE_ITEM = 100400, EDAMAME_ITEM = 100190, SOYBEAN = 100330, TEA_LEAF = 100390, TOMATO_ITEM = 100110, PADDY_ITEM = 100401;
const crops: CropRules = new Map([
  [RICE, { seasons: ['summer', 'autumn'], harvest: [[RICE_ITEM, 10]] }],
  [EDAMAME, { seasons: ['summer'], harvest: [[EDAMAME_ITEM, 2]] }],
  [TOMATO, { seasons: ['summer'], harvest: [[TOMATO_ITEM, 3]], regrow: { days: 3, items: [[TOMATO_ITEM, 3]] } }],
  [PADDY, { seasons: ['spring'], harvest: [[PADDY_ITEM, 10]] }],
  [TEA, { seasons: ['spring', 'summer', 'autumn', 'winter'], perennial: { kind: 'shrub', bearing_seasons: ['spring'] }, harvest: [] }],
]);
const quality: Record<string, DailyQuality> = {
  [RICE_ITEM]: { count: RICE_ITEM, crop: RICE, ranks: [100, 400, 1000], pick: 10 },
  [EDAMAME_ITEM]: { count: EDAMAME_ITEM, crop: EDAMAME, ranks: [60, 240, 600], pick: 2 },
  [SOYBEAN]: { count: EDAMAME_ITEM, crop: EDAMAME, ranks: [60, 240, 600], pick: 2 },
  [TOMATO_ITEM]: { count: TOMATO_ITEM, crop: TOMATO, ranks: [90, 360, 900], pick: 3 },
  [TEA_LEAF]: { count: TEA_LEAF, crop: TEA, ranks: [60, 240, 600], season: 28 },
  [PADDY_ITEM]: { count: PADDY_ITEM, crop: PADDY, ranks: [100, 400, 1000], pick: 10 },
};
const seed = (days: number) => ({ seed: 1, days, items: [], sales: [] });
const context = (fields: Partial<SourceContext> = {}): SourceContext => ({
  season: 1, daysLeft: 20, crops, ripening: [], owned: new Set(), trees: [], held: new Map(), processes: [], quarryReached: 0, periods: [0],
  payload: { fish: {}, wild: {}, animals: [], quarry: [], quality, seeds: { [RICE]: seed(10), [EDAMAME]: seed(7), [TOMATO]: seed(9), [TEA]: seed(10), [PADDY]: seed(50) } },
  harvested: { [RICE_ITEM]: 150, [EDAMAME_ITEM]: 538 }, brands: new Set(), ...fields,
});

describe('crop grade progress', () => {
  it('takes the grade from the harvest count, and brand only from a brand name', () => {
    // 150 rice is past 铜星's 100: a 铜星 line is filled by harvests, a 银星 one is not.
    expect(qualityProgress(RICE_ITEM, 1, context())).toBeUndefined();
    expect(qualityProgress(RICE_ITEM, 2, context())).toMatchObject({ grade: 1, harvested: 150, target: 400 });
    expect(qualityProgress(RICE_ITEM, 4, context({ harvested: { [RICE_ITEM]: 1000 } }))).toEqual({ crop: RICE, grade: 3, harvested: 1000, target: 1000 });
    expect(qualityProgress(RICE_ITEM, 4, context({ brands: new Set([RICE_ITEM]) }))).toBeUndefined();
    // Today's harvest comes out at the same grade; soybeans share edamame's count.
    expect([harvestGrade(RICE_ITEM, context()), harvestGrade(SOYBEAN, context()), harvestGrade(TOMATO_ITEM, context()), harvestGrade(999, context())]).toEqual([1, 2, 0, 0]);
    expect(harvestGrade(RICE_ITEM, context({ brands: new Set([RICE_ITEM]) }))).toBe(4);
    // Plain lines and items without a count have nothing to track.
    expect(qualityProgress(RICE_ITEM, 0, context())).toBeUndefined();
    expect(qualityProgress(999, 4, context())).toBeUndefined();
  });

  it('splits today\'s harvest where the count crosses a grade threshold', () => {
    // 150 rice is 铜星; 250 more reach 银星's 400, so the last 50 come out 银星.
    expect(harvestGrades(RICE_ITEM, 300, context())).toEqual([{ rank: 1, count: 250 }, { rank: 2, count: 50 }]);
    // Tomatoes come 3 a plant: the plant picked at 358 is still 铜星, so 6 are 铜星, not 5.
    expect(harvestGrades(TOMATO_ITEM, 12, context({ harvested: { [TOMATO_ITEM]: 355 } }))).toEqual([{ rank: 1, count: 6 }, { rank: 2, count: 6 }]);
    // A big enough harvest crosses every threshold.
    expect(harvestGrades(PADDY_ITEM, 1100, context())).toEqual([{ rank: 0, count: 100 }, { rank: 1, count: 300 }, { rank: 2, count: 600 }, { rank: 3, count: 100 }]);
    expect(harvestGrades(RICE_ITEM, 30, context({ brands: new Set([RICE_ITEM]) }))).toEqual([{ rank: 4, count: 30 }]);
    expect([harvestGrades(999, 5, context()), harvestGrades(RICE_ITEM, 0, context())]).toEqual([[{ rank: 0, count: 5 }], []]);
  });

  it('counts the seeds to sow today, through every season the crop keeps growing in', () => {
    // Rice grows summer and autumn: sown with 20 days of summer left, it can be harvested once (no regrowth): 850 / 10.
    expect(qualityProgress(RICE_ITEM, 4, context())?.plant).toEqual({ kind: 'sow', seed: 1, seeds: 85, today: true, seasons: [1, 2] });
    // Soybeans count under edamame: 62 more at 2 a seed.
    expect(qualityProgress(SOYBEAN, 4, context())?.plant).toEqual({ kind: 'sow', seed: 1, seeds: 31, today: true, seasons: [1] });
    // Tomatoes regrow every 3 days: ripe on day 9, then 3 more picks within 20 days, 12 a seed.
    expect(qualityProgress(TOMATO_ITEM, 3, context())?.plant).toEqual({ kind: 'sow', seed: 1, seeds: 75, today: true, seasons: [1] });
  });

  it('waits for the crop\'s next season when today is too late or out of season', () => {
    // 5 days of summer left is too few for edamame's 7: next summer, sown on day 1.
    expect(qualityProgress(EDAMAME_ITEM, 3, context({ daysLeft: 5 }))?.plant).toEqual({ kind: 'sow', seed: 1, seeds: 31, today: false, seasons: [1] });
    // In winter, rice waits for summer and grows through autumn.
    expect(qualityProgress(RICE_ITEM, 3, context({ season: 3 }))?.plant).toEqual({ kind: 'sow', seed: 1, seeds: 85, today: false, seasons: [1, 2] });
  });

  it('adds scarecrows for a crop that grows longer than its seasons', () => {
    // 50 days in spring only: sown by day 5 and kept growing by spring scarecrows placed on its last day, 24 cells each.
    const scarecrow = { item: 662000, count: 5 };
    expect(qualityProgress(PADDY_ITEM, 3, context({ season: 0, daysLeft: 25 }))?.plant).toEqual({ kind: 'sow', seed: 1, seeds: 100, today: true, seasons: [0], scarecrow });
    expect(qualityProgress(PADDY_ITEM, 3, context({ season: 0, daysLeft: 2 }))?.plant).toEqual({ kind: 'sow', seed: 1, seeds: 100, today: false, seasons: [0], scarecrow });
  });

  it('counts fruit trees and shrubs by one bearing season, with the ones already planted', () => {
    const orchard = [{ crop: TEA, cell: 1, days: 0 }, { crop: TEA, cell: 2, days: 3 }];
    expect(qualityProgress(TEA_LEAF, 4, context({ orchard }))).toEqual({ crop: TEA, grade: 0, harvested: 0, target: 600, plant: { kind: 'perennial', plants: 22, have: 2 } });
  });
});
