import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { explorerData, floorRocks, floors, layoutArt, layoutName, rewards, rooms, roomSetup, specialChances } from './quarry';

describe('quarry data', () => {
  it('has art and rock cells for every layout a floor or room can load', () => {
    const used = new Set([...floors, ...rooms].flatMap(source => source.layouts));
    for (const key of used) {
      expect(layoutArt[key], key).toBeDefined();
      expect(existsSync(`public/${layoutArt[key].file}`), key).toBe(true);
      expect(existsSync(`public/${layoutArt[key].large.file}`), key).toBe(true);
      expect(layoutArt[key].large.width, key).toBeGreaterThan(layoutArt[key].width);
      expect(() => layoutName(key)).not.toThrow();
    }
    expect(Object.keys(layoutArt).sort()).toEqual([...used].sort());
  });

  it('uses the rest map on every tenth floor and the bottom map on floor 120', () => {
    for (const floor of floors) {
      if (floor.kind === 'rest') expect(floor.layouts.map(key => key.slice(0, 4))).toEqual(['3102']);
      else if (floor.kind === 'bottom') expect(floor.layouts).toEqual(['3200']);
      else expect(floor.floor % 10).not.toBe(0);
    }
    expect(floors.filter(floor => floor.kind === 'rest').map(floor => floor.floor)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
    expect(floors.at(-1)).toMatchObject({ floor: 120, kind: 'bottom' });
  });

  it('places no rocks on rest floors or floor 120', () => {
    expect(layoutArt['3200'].cells).toBe(0);
    for (const floor of floors) expect(floorRocks(floor).length > 0, String(floor.floor)).toBe(floor.kind === 'normal');
  });

  it('gives a first-arrival reward on each rest floor', () => {
    const rest = floors.filter(floor => floor.kind === 'rest').map(floor => floor.floor);
    expect(rewards.map(reward => reward.floor)).toEqual(rest);
    expect(rewards.find(reward => reward.floor === 40)).toEqual({ floor: 40, item: 'ITEM_ID_OBJECT_AMETHYST', count: 1 });
  });

  it('loads the two abandoned-mine ore maps for ore rooms and the floor setup otherwise', () => {
    const floor = floors.find(row => row.floor === 37)!;
    for (const room of rooms) {
      const setup = roomSetup(room.id, floor);
      if (room.rocks.length) expect(setup).toMatchObject({ layouts: ['3301_dg01', '3302_dg01'], density: 30 });
      else expect(setup).toMatchObject({ layouts: floor.layouts, rocks: floor.rocks, density: floor.rock_percent });
    }
  });

  it('splits the special-room chance by weight', () => {
    for (const floor of floors) {
      const total = specialChances(floor).reduce((sum, row) => sum + row.chance, 0);
      expect(total).toBeCloseTo(floor.special_rooms.length ? floor.special_chance / 100 : 0);
    }
  });
});

describe('explorerData', () => {
  const data = explorerData('en');

  const on = (n: number) => data.floors.find(row => row.from <= n && n <= row.to)!;

  it('describes floor 37 with its 19 abandoned-mine layouts', () => {
    const floor = on(37);
    expect(floor).toMatchObject({ kind: 'normal', tileset: 1 });
    expect(data.pools[floor.pool]).toHaveLength(19);
    expect(floor.totals).toHaveLength(19);
    expect(data.mixes[floor.mix].length).toBeGreaterThan(0);
    expect(data.tilesets[floor.tileset]).toBeTruthy();
  });

  it('shows rest floors with their reward and no rocks', () => {
    const floor = on(40);
    expect(floor).toMatchObject({ from: 40, to: 40, kind: 'rest' });
    expect(data.mixes[floor.mix]).toEqual([]);
    expect(data.rewards[40]).toMatchObject({ count: 1 });
    expect(data.rewards[40].href).toContain('/en/');
  });

  it('stores repeated pools once and points every floor at a layout it can draw', () => {
    expect(new Set(data.pools.map(pool => JSON.stringify(pool))).size).toBe(data.pools.length);
    for (const floor of data.floors) for (const key of data.pools[floor.pool]) {
      expect(data.layouts[key]?.src, key).toMatch(/\.webp$/);
      expect(data.layouts[key].large.src, key).toMatch(/\/maps\/quarry\/large\/.+\.webp$/);
    }
  });

  it('merges runs of floors that share the same setup and keeps every floor reachable', () => {
    expect(data.floors[0].from).toBe(1);
    expect(data.floors.at(-1)!.to).toBe(120);
    for (const [i, group] of data.floors.entries()) {
      expect(group.to).toBeGreaterThanOrEqual(group.from);
      if (i) expect(group.from).toBe(data.floors[i - 1].to + 1);
      const first = floors.find(floor => floor.floor === group.from)!;
      for (const floor of floors.filter(row => row.floor > group.from && row.floor <= group.to)) {
        expect({ kind: floor.kind, layouts: floor.layouts, rocks: floor.rocks, density: floor.rock_percent, chance: floor.special_chance, rooms: floor.special_rooms }, String(floor.floor))
          .toEqual({ kind: first.kind, layouts: first.layouts, rocks: first.rocks, density: first.rock_percent, chance: first.special_chance, rooms: first.special_rooms });
      }
    }
    for (const reward of rewards) expect(on(reward.floor)).toMatchObject({ from: reward.floor, to: reward.floor });
    expect(data.floors.length).toBeLessThan(floors.length / 2);
  });

  it('translates layout and room names', () => {
    const labels = Object.values(data.layouts).map(layout => layout.label);
    expect(labels.every(label => !/[一-鿿]/.test(label))).toBe(true);
    const names = data.specials.flatMap(special => special.rooms.map(room => room.name));
    expect(names.every(name => !/[一-鿿]/.test(name))).toBe(true);
  });
});
