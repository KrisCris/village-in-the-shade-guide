import { describe, expect, it } from 'vitest';
import data from '../../data/sources/game-night-monsters.json';
import art from '../../data/sources/game-night-monster-art.json';
import items from '../../data/generated/build-25640656/entities/items.json';
import { heartText, monsterName, monsters, seconds, tiles } from './nightMonsters';

const itemIds = new Set(items.map((item) => item.id));

describe('night monster names', () => {
  it('uses creature.dat names and converts the Traditional ones to Simplified', () => {
    const name = (id: keyof typeof monsters, locale: 'ja' | 'zh-TW' | 'zh-CN' | 'en') => monsterName(monsters[id], locale);
    expect(name('CREATURE_ID_HORROR_MOYAMOYASAN_LV3', 'ja')).toBe('たたずむ霊');
    expect(name('CREATURE_ID_HORROR_MOYAMOYASAN_LV3', 'zh-TW')).toBe('佇立靈');
    expect(name('CREATURE_ID_HORROR_MOYAMOYASAN_LV3', 'zh-CN')).toBe('伫立灵');
    expect(name('CREATURE_ID_HORROR_OBO', 'zh-CN')).toBe('欧柏妖');
    expect(name('CREATURE_ID_HORROR_BLOCKAGE_PLANE', 'zh-CN')).toBe('挡路妖');
    expect(name('CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE', 'zh-CN')).toBe('涂壁（脸）');
    expect(name('CREATURE_ID_HORROR_WHELK', 'zh-CN')).toBe('小颗粒');
    expect(name('CREATURE_ID_HORROR_WALKING_STONE', 'zh-CN')).toBe('行走的石头');
    expect(name('CREATURE_ID_HORROR_MOYAMOYASAN_LV3', 'en')).toBe('Lingering Ghost');
    expect(name('CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE', 'en')).toBe('Nurikabe (Face)');
    expect(name('CREATURE_ID_HORROR_CICADA_FINAL_PT1', 'ja')).toBe('セミファイナル');
    expect(name('CREATURE_ID_HORROR_CICADA_FINAL_PT1', 'en')).toBe('Final Cicada');
    expect(name('CREATURE_ID_HORROR_CICADA_FINAL_PT1', 'zh-CN')).toBe('临终蝉');
    expect(name('CREATURE_ID_HORROR_GROUND_SPIRIT', 'zh-CN')).toBe('幽灵从地面冒出来吵闹');
    expect(name('CREATURE_ID_HORROR_FAKE_ITEM', 'en')).toBe('False Item');
  });

  it('strips editor suffixes from the display names', () => {
    for (const monster of Object.values(monsters)) {
      expect([monster.ja, monster.en, monster.zh_hant].join(' ')).not.toMatch(/プレーン|平面|Plane|パターン|Pattern|樣式|_/);
    }
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
    expect(counts).toEqual({
      two_mouths_woman: 4, two_mouths_route: 9, blockage: 6, wall_face: 2, wall_one_always: 10, wall_one_sometimes: 9, whelk: 15,
      scare_ground_spirit: 15, scare_house_spirit: 15, scare_cicada_final: 15, scare_fake_item: 15,
    });
  });

  it('places 3 village scares and 3 false items per late night, cicadas only in summer and autumn', () => {
    const scares = data.village_scares;
    expect([scares.picks, scares.false_item_picks]).toEqual([3, 3]);
    expect(scares.seasons).toEqual({
      CREATURE_ID_HORROR_GROUND_SPIRIT: [0, 1, 2, 3],
      CREATURE_ID_HORROR_HOUSE_SPIRIT: [0, 1, 2, 3],
      CREATURE_ID_HORROR_CICADA_FINAL_PT1: [1, 2],
      CREATURE_ID_HORROR_FAKE_ITEM: [0, 1, 2, 3],
    });
    expect(scares.patterns.CREATURE_ID_HORROR_CICADA_FINAL_PT1).toEqual(['CREATURE_ID_HORROR_CICADA_FINAL_PT2', 'CREATURE_ID_HORROR_CICADA_FINAL_PT1']);
    expect(seconds(data.behaviour.cicada_rampage_frames)).toBe('7.4');
    expect(data.behaviour.false_item_hand_game_seconds / 60).toBe(10);
  });

  it('gives every village scare a harmless monster entry, map points and a picture', () => {
    const slugs = { GROUND_SPIRIT: ['ground_spirit', 'ground-spirit'], HOUSE_SPIRIT: ['house_spirit', 'house-spirit'], CICADA_FINAL_PT1: ['cicada_final', 'final-cicada'], FAKE_ITEM: ['fake_item', 'false-item'] };
    const points = data.map_points as Record<string, Array<{ x: number; y: number }>>;
    const images = art.images as Record<string, { model: string }>;
    for (const id of Object.keys(data.village_scares.seasons)) {
      const [pointKey, slug] = slugs[id.replace('CREATURE_ID_HORROR_', '') as keyof typeof slugs];
      const monster = monsters[id as keyof typeof monsters];
      expect(monster.hit, id).toBeNull();
      expect([monster.hp, monster.power, monster.on_flags], id).toEqual([0, 0, []]);
      expect(points[`scare_${pointKey}`], id).toHaveLength(15);
      expect(images[slug]?.model, id).toMatch(/^ene_/);
    }
    expect(images['false-item-hands'].model).toBe(images['false-item'].model);
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
