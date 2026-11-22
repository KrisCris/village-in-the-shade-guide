import { describe, expect, it } from 'vitest';
import { addDays, festivals, festivalsOn, isFestivalEve, weekday, birthdayLabel } from './calendar';
import { laterSeeds, lateSeedConditions, seasonPlans, yearRoundCatalog } from './seasonPlan';
import { getCatalog } from './repository';

describe('village calendar', () => {
  it('starts every season on a Monday', () => {
    expect([1, 7, 8, 15, 22, 28].map(weekday)).toEqual([0, 6, 0, 0, 0, 6]);
  });

  it('places the festivals and the Evaluation on their days', () => {
    const list = festivals('en');
    const on = (season: number, day: number, year?: number) => festivalsOn(list, season, day, year).map((festival) => festival.key);
    expect(on(0, 12, 2)).toEqual(['SAKURA_VIEWING']);
    expect(on(0, 12, 1)).toEqual([]);
    expect(on(1, 15)).toEqual(['FESTIVAL']);
    expect(on(2, 23)).toEqual(['HARVEST']);
    expect(on(3, 28)).toEqual(['NEW_YEARS_EVE']);
    expect([0, 1, 2, 3].map((season) => on(season, 27))).toEqual([['FAIR'], ['FAIR'], ['FAIR'], ['FAIR']]);
    expect(list.find((festival) => festival.key === 'FAIR')).toMatchObject({ name: 'Evaluation Day', letterDay: 19, start: '10:00', end: '16:00' });
  });

  it('marks the festival eves that skip the late night', () => {
    expect([[0, 11], [1, 14], [2, 22], [3, 27], [0, 26], [2, 26]].every(([season, day]) => isFestivalEve(season, day))).toBe(true);
    expect(isFestivalEve(0, 12) || isFestivalEve(1, 11) || isFestivalEve(3, 28)).toBe(false);
  });

  it('wraps dates into the next season and year', () => {
    expect(addDays({ year: 1, season: 3, day: 27 }, 3)).toEqual({ year: 2, season: 0, day: 2 });
    expect(addDays({ year: 1, season: 0, day: 1 }, 0)).toEqual({ year: 1, season: 0, day: 1 });
  });

  it('uses the game wording for birthdays', () => {
    expect(birthdayLabel('Sumire', 'en')).toBe("Sumire's Birthday");
    expect(birthdayLabel('堇怜', 'zh-CN')).toBe('堇怜的生日');
  });
});

describe('season plan', () => {
  const catalog = getCatalog(), plans = seasonPlans(catalog);
  const ids = (rows: Array<{ item: { id: string } }>) => rows.map((row) => row.item.id);

  it('lists the shrine offerings in the order the shrine asks for them', () => {
    expect(plans.map((plan) => plan.shrine.map((row) => row.entity.id))).toEqual(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']
      .map((season) => [1, 2, 3, 4].map((slot) => `BUNDLE_ID_${season}_0${slot}`)));
    expect(plans[3].shrine[0].items).toHaveLength(2);
    expect(plans.every((plan) => plan.shrine.every((row) => row.rewards[0]?.item.id.startsWith('ITEM_ID_TOOL_SCARECROW_')))).toBe(true);
  });

  it('takes the vegetable, fruit and flower catalog entries of the same season', () => {
    expect(plans[2].catalog.map((row) => row.entity.id)).toEqual(['BUNDLE_ID_VILLAGE_HEAD_02_03', 'BUNDLE_ID_VILLAGE_HEAD_03_03', 'BUNDLE_ID_VILLAGE_HEAD_04_03']);
    expect([...plans[2].shared].sort()).toEqual(['ITEM_ID_CROPS_CHRYSANTHEMUM', 'ITEM_ID_CROPS_COSMOS', 'ITEM_ID_CROPS_DAHLIA']);
    expect(ids(plans[0].catalog[0].items)).toContain('ITEM_ID_CROPS_CABBAGE');
  });

  it('notes only the seeds that open after that season of Year 1', () => {
    expect(lateSeedConditions(catalog, 'ITEM_ID_CROPS_CORN', 1)).toEqual([]);
    expect(lateSeedConditions(catalog, 'ITEM_ID_CROPS_COSMOS', 2)).toEqual([]);
    expect(lateSeedConditions(catalog, 'ITEM_ID_CROPS_CABBAGE', 0)).toEqual(['第三年春起']);
    expect(lateSeedConditions(catalog, 'ITEM_ID_CROPS_SHIMEJI_MUSHROOM', 2)).toEqual(['秋季品评会次日起']);
    expect(lateSeedConditions(catalog, 'ITEM_ID_OBJECT_BRACKEN', 0)).toEqual([]);
    const summer = plans[1].seedNotes.flatMap((note) => note.items.map((item) => item.id));
    expect(summer).not.toContain('ITEM_ID_CROPS_CORN');
    expect(summer).toContain('ITEM_ID_CROPS_PUMPKIN');
  });

  it('lists birthdays by day', () => {
    expect(plans[0].birthdays.map((person) => [person.id, person.birthday_day])).toEqual([['CHARA_ID_VILLAGE_HEAD', 4], ['CHARA_ID_CARPENTER', 18], ['CHARA_ID_BOY', 21]]);
    expect(plans.flatMap((plan) => plan.birthdays)).toHaveLength(14);
  });

  it('groups the year-round catalog by page and leaves the seasonal pages out', () => {
    const pages = yearRoundCatalog(catalog);
    const bundles = pages.flatMap((page) => page.bundles.map((row) => row.entity.id));
    expect(bundles).toHaveLength(35 - 12);
    expect(bundles.some((id) => /^BUNDLE_ID_VILLAGE_HEAD_0[234]_/.test(id))).toBe(false);
    expect(pages[0].bundles.map((row) => row.entity.id)).toEqual(['BUNDLE_ID_VILLAGE_HEAD_01_01', 'BUNDLE_ID_VILLAGE_HEAD_01_02', 'BUNDLE_ID_VILLAGE_HEAD_01_03']);
  });

  it('groups the Year 2 and Year 3 seeds by the season they go on sale', () => {
    const groups = laterSeeds(catalog);
    expect(groups.map((group) => [group.year, group.season])).toEqual([[2, 0], [2, 1], [2, 2], [3, 0], [3, 1]]);
    expect(groups[0].seeds.map((seed) => seed.id)).toContain('ITEM_ID_SEED_STRAWBERRY');
    expect(groups.at(-1)!.seeds.map((seed) => seed.id)).toContain('ITEM_ID_SEED_PINEAPPLE');
  });
});
