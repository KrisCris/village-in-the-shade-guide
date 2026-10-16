import { describe, expect, it } from 'vitest';
import anomalies from '../../data/sources/game-anomalies.json';
import items from '../../data/generated/build-25311578/entities/items.json';

const RANDOM = 'GameGetRandomLateNightItemID';
const itemIds = new Set(items.map((item) => item.id));
type Reward = { item: string; count: number };
const rewardItems = (rewards: unknown): Reward[] => JSON.stringify(rewards ?? null).match(/\{"item":"[^"]+","count":\d+\}/g)?.map((s) => JSON.parse(s)) ?? [];

describe('late-night anomaly data', () => {
  const byId = Object.fromEntries(anomalies.events.map((event) => [event.id.replace('LATE_NIGHT_EVENT_', ''), event]));

  it('lists the nine late-night anomalies, all gated on the end of chapter 1', () => {
    expect(Object.keys(byId)).toEqual(['HAND_EYES', 'STATUE_GAME', 'SOOT_SPRITE', 'GRASS', 'MASK', 'DEMON', 'KASA_GHOST', 'FUJIN_RAIJIN', 'SNOW_WOMAN']);
    for (const event of anomalies.events) expect(event.start_requires.requires).toEqual(['GAME_FLAG_STORY_01_END']);
  });

  it('keeps the weather, season and story conditions', () => {
    expect(byId.KASA_GHOST.weathers).toEqual(['rain']);
    expect(byId.FUJIN_RAIJIN.weathers).toEqual(['thunderstorm']);
    expect(byId.SNOW_WOMAN).toMatchObject({ seasons: ['winter'], weathers: ['snow'] });
    expect(byId.DEMON).toMatchObject({ requires: ['GAME_FLAG_STORY_04_034'], days: [1, 15] });
    expect(byId.GRASS.from_date).toEqual(byId.MASK.from_date);
  });

  it('points every 木札 at an anomaly that has its forced flag', () => {
    expect(anomalies.tablets).toHaveLength(5);
    for (const tablet of anomalies.tablets) expect(byId[tablet.late_night_event.replace('LATE_NIGHT_EVENT_', '')].forced_flag).toBe(tablet.forced_flag);
  });

  it('only names reward items that exist in the catalog', () => {
    const rewards = [...anomalies.events.flatMap((event) => rewardItems(event.rewards)), ...rewardItems(anomalies.unknown_livestock), ...anomalies.mask_night_pickups.flatMap((group) => group.items)];
    expect(rewards.length).toBeGreaterThan(30);
    for (const { item } of rewards) if (item !== RANDOM) expect(itemIds.has(item), item).toBe(true);
  });

  it('keeps the fixed positions the guide maps', () => {
    const counts = Object.fromEntries(Object.entries(anomalies.map_points).map(([key, points]) => [key, points.length]));
    expect(counts).toMatchObject({ evil_eye_stone: 5, evil_eye_monument_big: 1, husband_grave: 3, jizo: 1, phone_box: 1, red_phone: 5, mask_item_red: 21, mask_item_blue: 21, dorotabo: 6, dorotabo_field: 6 });
    for (const points of Object.values(anomalies.map_points)) for (const p of points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
    }
  });

  it('names existing items in the smaller night events', () => {
    const { petopeto, giant_rabbit, phone_booth, doll, dorotabo } = anomalies.night_events;
    const ids = [...petopeto.rewards, ...giant_rabbit.rewards].map((r) => r.item).filter((id) => id.startsWith('ITEM_ID_'));
    ids.push(...phone_booth.rewards, phone_booth.pickup, phone_booth.after_answer, doll.pickup, doll.head, dorotabo.grown_harvest);
    for (const id of ids) expect(itemIds.has(id), id).toBe(true);
    expect(anomalies.night_events.abyss.need_per_level).toEqual([1, 3, 6, 10, 15, 15, 15]);
    expect(anomalies.hand_eyes_monuments.hits).toEqual({ GIMMICK_ID_EVENT_EVILEYE_STONE_MONUMENT_SMALL: 2, GIMMICK_ID_EVENT_EVILEYE_STONE_MONUMENT_BIG: 4 });
  });
});
