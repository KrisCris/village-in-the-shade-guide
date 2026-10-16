import { describe, expect, it } from 'vitest';
import data from '../../data/sources/game-night-monsters.json';
import items from '../../data/generated/build-25311578/entities/items.json';
import { heartText, monsterName, monsters, seconds, tiles } from './nightMonsters';

const itemIds = new Set(items.map((item) => item.id));

describe('night monster names', () => {
  it('uses creature.dat names and converts the Traditional ones to Simplified', () => {
    const name = (id: keyof typeof monsters, locale: 'ja' | 'zh-TW' | 'zh-CN') => monsterName(monsters[id], locale);
    expect(name('CREATURE_ID_HORROR_MOYAMOYASAN_LV3', 'ja')).toBe('たたずむ霊');
    expect(name('CREATURE_ID_HORROR_MOYAMOYASAN_LV3', 'zh-TW')).toBe('佇立靈');
    expect(name('CREATURE_ID_HORROR_MOYAMOYASAN_LV3', 'zh-CN')).toBe('伫立灵');
    expect(name('CREATURE_ID_HORROR_OBO', 'zh-CN')).toBe('欧柏妖');
    expect(name('CREATURE_ID_HORROR_BLOCKAGE_PLANE', 'zh-CN')).toBe('挡路妖');
    expect(name('CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE', 'zh-CN')).toBe('涂壁（脸）');
    expect(name('CREATURE_ID_HORROR_WHELK', 'zh-CN')).toBe('小颗粒');
    expect(name('CREATURE_ID_HORROR_WALKING_STONE', 'zh-CN')).toBe('行走的石头');
  });

  it('strips editor suffixes from the display names', () => {
    for (const monster of Object.values(monsters)) expect(monster.ja).not.toMatch(/プレーン|平面|_/);
  });
});

describe('night monster helpers', () => {
  it('writes hearts as quarter fractions', () => {
    expect([0.25, 0.5, 0.75, 1, 1.25, 2].map(heartText)).toEqual(['¼', '½', '¾', '1', '1¼', '2']);
    expect(heartText(0)).toBe('0');
  });

  it('converts frames and map units', () => {
    expect(seconds(300)).toBe('5');
    expect(seconds(100)).toBe('1.7');
    expect(tiles(data.grid * 7)).toBe(7);
  });
});

describe('night monster data', () => {
  it('derives hit damage from creature power and attack.dat', () => {
    const hearts = Object.fromEntries(Object.entries(monsters).map(([id, monster]) => [id.replace('CREATURE_ID_HORROR_', ''), monster.hit?.hearts ?? null]));
    expect(hearts).toMatchObject({ MOYAMOYASAN_LV3: 1, KUNEKUNE: 0.25, WANDERING_GHOST: 0.25, WARP_GHOST: 0.75, OBO: 0.5, TWO_MOUTHS_WOMAN: 1, BLOCKAGE_PLANE: 0.25, PLASTERED_WALL_FACE_PLANE: 0.25, PLASTERED_WALL_ONE: null });
    expect(monsters.CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE.hit?.stun_frames).toBe(100);
    for (const monster of Object.values(monsters)) if (monster.hit) expect(monster.hit.hp / data.hp_per_heart).toBe(monster.hit.hearts);
  });

  it('gives every area spawn blocks, an entrance and a count range', () => {
    for (const [key, area] of Object.entries(data.areas)) {
      expect(area.blocks.length, key).toBeGreaterThan(0);
      expect(area.gates.length, key).toBeGreaterThan(0);
      expect(area.count[0], key).toBeLessThanOrEqual(area.count[1]);
      for (const [x, y] of area.blocks) expect(x % area.block === 0 && y % area.block === 0, key).toBe(true);
    }
    expect(Object.fromEntries(Object.entries(data.areas).map(([key, area]) => [key, area.count]))).toEqual({ pass_road: [3, 6], mountain: [10, 15], farm: [25, 30], added_farm: [25, 30] });
  });

  it('keeps the fixed spawn points the guide maps', () => {
    const counts = Object.fromEntries(Object.entries(data.map_points).map(([key, points]) => [key, points.length]));
    expect(counts).toEqual({ two_mouths_woman: 4, two_mouths_route: 9, blockage: 6, wall_face: 2, wall_one_always: 10, wall_one_sometimes: 9, whelk: 15 });
  });

  it('only names items that exist in the catalog', () => {
    const drops = data.walking_stone_drops;
    expect(drops).toHaveLength(11);
    for (const drop of drops) {
      expect(itemIds.has(drop.item), drop.item).toBe(true);
      expect(drop.min).toBeLessThanOrEqual(drop.max);
    }
    expect(itemIds.has(data.whelk_item)).toBe(true);
  });

  it('lists the story bosses separately from the area spawns', () => {
    const spawned = new Set(Object.values(data.tables).flatMap((table) => table.members));
    expect(data.story_bosses.map((boss) => boss.chapter)).toEqual(expect.arrayContaining([5, 6]));
    for (const boss of data.story_bosses) expect(spawned.has(boss.id), boss.id).toBe(false);
  });
});
