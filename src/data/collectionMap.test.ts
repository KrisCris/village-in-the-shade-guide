import { describe, expect, it } from 'vitest';
import mapData from '../../data/sources/game-map-markers.json';
import exploration from '../../data/sources/game-exploration-markers.json';
import night from '../../data/sources/game-night-pickups.json';
import { MAP_HOME } from '../lib/mapViewport';
import { isVillageMap, mapArea, markerId, MINIMAP_PIXELS, minimapWorldBounds, parseCollected, projectMinimap, type MapKind } from './collectionMap';

describe('collection map markers', () => {
  it('recognizes the village map head before and after the ver120 rename', () => {
    expect(isVillageMap('data/map/map_0000_spr.ymwr.head')).toBe(true);
    expect(isVillageMap('data/map/map_0000_ver120_spr.ymwr.head')).toBe(true);
    expect(isVillageMap('data/map/map_2160_spr.ymwr.head')).toBe(false);
    expect(isVillageMap('data/map/map_10000_spr.ymwr.head')).toBe(false);
  });

  it('names each side area and rejects unknown heads', () => {
    expect(mapArea('data/map/map_2140.ymwr.head')).toBe('subway');
    expect(mapArea('data/map/map_2150_spr.ymwr.head')).toBe('lost-forest');
    expect(mapArea('data/map/map_2160_spr.ymwr.head')).toBe('bush');
    expect(mapArea('data/map/map_2170_spr.ymwr.head')).toBe('pass');
    expect(() => mapArea('data/map/map_9999.ymwr.head')).toThrow();
  });

  it('draws 51 books and all 4 shrines on the village map and lists 4 books elsewhere', () => {
    const village = mapData.markers.filter((m) => isVillageMap(m.map));
    const elsewhere = mapData.markers.filter((m) => !isVillageMap(m.map));
    expect(village.filter((m) => m.kind === 'book')).toHaveLength(51);
    expect(village.filter((m) => m.kind === 'shrine')).toHaveLength(4);
    expect(elsewhere.map((m) => m.kind)).toEqual(['book', 'book', 'book', 'book']);
  });

  it('places every machine part and rat coin source once, matching the game totals', () => {
    const count = (kind: string, area?: string) => night.markers.filter((m) => m.kind === kind && (!area || m.area === area)).length;
    expect(count('machine_part')).toBe(night.machine_parts_max);
    expect(count('ghost_rat')).toBe(night.rat_coin_max);
    expect(count('machine_part', 'village')).toBe(21);
    expect(count('ghost_rat', 'village')).toBe(26);
    expect(count('red_phone')).toBe(5);
    expect(night.markers.filter((m) => m.kind === 'turn_in').map((m) => m.anchor)).toEqual(['chirping_machine', 'rat_well']);
    const numbers = (kind: string) => night.markers.filter((m) => m.kind === kind).map((m) => m.number).sort((a, b) => a! - b!);
    expect(numbers('machine_part')).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(numbers('ghost_rat')).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('gives every marker a unique id and keeps village markers inside the home view', () => {
    const all = [
      ...mapData.markers.map((m) => ({ ...m, kind: m.kind as MapKind })),
      ...exploration.markers.map((m) => ({ ...m, kind: m.kind as MapKind })),
      ...night.markers.map((m) => ({ ...m, kind: m.kind as MapKind })),
    ];
    const ids = all.map((m) => markerId(m.kind, mapArea(m.map), m.anchor));
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of all.filter((m) => isVillageMap(m.map))) {
      const p = projectMinimap(m, mapData.projection);
      expect(p.x).toBeGreaterThan(MAP_HOME.x);
      expect(p.x).toBeLessThan(MAP_HOME.x + MAP_HOME.width);
      expect(p.y).toBeGreaterThan(MAP_HOME.y);
      expect(p.y).toBeLessThan(MAP_HOME.y + MAP_HOME.height);
    }
  });

  it('keeps entity-page book links working as marker ids', () => {
    expect(markerId('book', 'pass', 'pop_lost_book10')).toBe('pop_lost_book10');
    expect(markerId('ghost_rat', 'bush', 'pop_ghostRat00')).toBe('bush-pop_ghostRat00');
    expect(markerId('ghost_rat', 'village', 'pop_ghostRat00')).toBe('pop_ghostRat00');
  });
});

describe('minimap world bounds', () => {
  it('cover the whole minimap image', () => {
    const [left, top, right, bottom] = minimapWorldBounds(mapData.projection);
    const corner = (x: number, y: number) => projectMinimap({ x, y }, mapData.projection);
    expect(corner(left, top).x).toBeCloseTo(0);
    expect(corner(left, top).y).toBeCloseTo(0);
    expect(corner(right, bottom).x).toBeCloseTo(MINIMAP_PIXELS);
    expect(corner(right, bottom).y).toBeCloseTo(MINIMAP_PIXELS);
  });
});

describe('collected checklist', () => {
  const ids = new Set(['a', 'b']);
  it('keeps known ids and drops stale or malformed entries', () => {
    expect([...parseCollected('["a","gone",3]', ids)]).toEqual(['a']);
    expect(parseCollected('{oops', ids).size).toBe(0);
    expect(parseCollected('{"a":1}', ids).size).toBe(0);
    expect(parseCollected(null, ids).size).toBe(0);
  });
});
