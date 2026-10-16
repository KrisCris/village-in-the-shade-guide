import { describe, expect, it } from 'vitest';
import farmland from '../../data/sources/game-farmland.json';
import construction from '../../data/sources/game-construction.json';
import { packSquares, sprinklerCoverage } from './farmLayout';

const square = (size: number) => ({ width: size, height: size, cells: Array.from({ length: size * size }, (_, i) => [i % size, Math.floor(i / size)]) });
const shape = (id: string) => farmland.shapes.find((s) => s.id === id)!;

describe('packSquares', () => {
  it('fills a solid plot and skips squares that would leave the farmland', () => {
    expect(packSquares(square(10), 5)).toEqual([[0, 0], [5, 0], [0, 5], [5, 5]]);
    expect(packSquares(square(4), 5)).toEqual([]);
    const notched = square(3);
    notched.cells = notched.cells.filter(([x, y]) => !(x === 1 && y === 1));
    expect(packSquares(notched, 3)).toEqual([]);
  });
  it('counts the cells a centre sprinkler waters', () => {
    expect(sprinklerCoverage(square(7), 7)).toEqual({ squares: 1, watered: 48, share: 48 / 49 });
    expect(sprinklerCoverage({ width: 0, height: 0, cells: [] }, 3).share).toBe(0);
  });
});

describe('greenhouse terrain', () => {
  const ring = shape('map_1140.ymwr.head-0'), centre = shape('map_1140.ymwr.head-1');
  it('is a ring three cells wide around a 10×10 bed', () => {
    expect(ring.cells).toHaveLength(162);
    expect(centre.cells).toHaveLength(100);
    expect(packSquares(ring, 5)).toEqual([]);
    expect(sprinklerCoverage(ring, 3)).toMatchObject({ squares: 18, watered: 144 });
    expect(sprinklerCoverage(centre, 5)).toMatchObject({ squares: 4, watered: 96 });
  });
});

describe('farm areas', () => {
  it('assign every outdoor plot to exactly one purchase stage', () => {
    const areas = construction.farmland_expansion.farm_areas;
    const outdoor = farmland.shapes.filter((s) => s.map_ids.includes('MAP_ID_OPENWORLD'));
    expect(areas.flatMap((a) => a.farmland_shapes).sort()).toEqual(outdoor.map((s) => s.id).sort());
    for (const area of areas)
      expect(area.farmland_shapes.reduce((n, id) => n + shape(id).cells.length, 0), area.stage).toBe(area.cells);
  });
});
