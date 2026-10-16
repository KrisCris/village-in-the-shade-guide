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
});
