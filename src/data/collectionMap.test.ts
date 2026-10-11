import { describe, expect, it } from 'vitest';
import mapData from '../../data/sources/game-map-markers.json';
import { isVillageMap } from './collectionMap';

describe('collection map markers', () => {
  it('recognizes the village map head before and after the ver120 rename', () => {
    expect(isVillageMap('data/map/map_0000_spr.ymwr.head')).toBe(true);
    expect(isVillageMap('data/map/map_0000_ver120_spr.ymwr.head')).toBe(true);
    expect(isVillageMap('data/map/map_2160_spr.ymwr.head')).toBe(false);
    expect(isVillageMap('data/map/map_10000_spr.ymwr.head')).toBe(false);
  });

  it('draws 51 books and all 4 shrines on the village map and lists 4 books elsewhere', () => {
    const village = mapData.markers.filter((m) => isVillageMap(m.map));
    const elsewhere = mapData.markers.filter((m) => !isVillageMap(m.map));
    expect(village.filter((m) => m.kind === 'book')).toHaveLength(51);
    expect(village.filter((m) => m.kind === 'shrine')).toHaveLength(4);
    expect(elsewhere.map((m) => m.kind)).toEqual(['book', 'book', 'book', 'book']);
  });
});
