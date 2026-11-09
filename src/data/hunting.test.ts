import { describe, expect, it } from 'vitest';
import { ZONES, animalName, animalZones, chanceText, escapeExits, hunting, spotsWithoutHole, tiles, zoneAnimals } from './hunting';

describe('hunting zones', () => {
  it('covers every spawn table once', () => {
    expect(ZONES.map((zone) => zone.table).sort()).toEqual(Object.keys(hunting.tables).sort());
  });

  it('names animals from the game text', () => {
    expect(animalName('RACCOON_DOG', 'zh-CN')).toBe('狸猫');
    expect(animalName('BOAR_BIG', 'zh-CN')).toBe('大野猪');
    expect(animalName('PHEASANT', 'zh-TW')).toBe('綠雉');
    expect(animalName('BEAR_BIG', 'en')).toBe('Large Bear');
  });

  it('lists the season-only rows with their season', () => {
    const tanuki = Object.fromEntries(zoneAnimals('7').map((entry) => [entry.animal, entry]));
    expect(tanuki.SQUIRREL.seasons).toEqual([0]);
    expect(tanuki.RACCOON_DOG.seasons).toEqual([0, 1, 2, 3]);
    expect(tanuki.RACCOON_DOG.chance[0]).toBeLessThan(tanuki.RACCOON_DOG.chance[1]);
    const fox = animalZones(['FOX']);
    expect(fox.map((entry) => [entry.zone.table, entry.seasons])).toEqual([['8', [0, 1, 2, 3]], ['10', [1]]]);
  });

  it('finds every zone a large animal can stand in, variants included', () => {
    expect(animalZones(['BOAR', 'BOAR_BIG']).map((entry) => `${entry.zone.table}:${entry.animal}`)).toEqual(['9:BOAR', '9:BOAR_BIG', '10:BOAR', '11:BOAR']);
    expect(animalZones(['BEAR', 'BEAR_BIG']).map((entry) => entry.zone.table)).toEqual(['11', '11']);
  });

  it('formats chances', () => {
    expect(chanceText([1, 1])).toBe('100%');
    expect(chanceText([0.007, 0.007])).toBe('0.7%');
    expect(chanceText([0.124, 0.133])).toBe('12–13%');
    expect(chanceText([0.9996, 0.9996])).toBe('>99%');
  });
});

describe('escape holes', () => {
  const exits = Object.fromEntries(escapeExits().map((exit) => [exit.number, exit]));

  it('sends each hole to one fixed exit', () => {
    expect(Object.keys(exits)).toEqual(['1', '2', '3', '4', '5']);
    expect(Object.values(exits).reduce((sum, exit) => sum + exit.holes.length, 0)).toBe(hunting.escape.holes.length);
  });

  it('carries big game from the north to the tanuki area', () => {
    expect(exits[3].zone.table).toBe('7');
    expect(exits[3].holes).toHaveLength(3);
    expect(exits[3].from.map((zone) => zone.table)).toEqual(['5', '9', '10', '11']);
  });

  it('crosses the hunting grounds', () => {
    expect(exits[1].from.map((zone) => zone.table)).toEqual(['6']);
    expect(exits[1].zone.table).toBe('8');
    expect(exits[2].from.map((zone) => zone.table)).toEqual(['7', '8']);
    expect(exits[2].zone.table).toBe('4');
    expect(exits[5].from.map((zone) => zone.table)).toEqual(['4']);
    expect(exits[5].zone.table).toBe('5');
    expect(exits[4].from.map((zone) => zone.table)).toEqual(['5']);
    expect(exits[4].zone.table).toBe('4');
    expect(Object.values(exits).filter((exit) => !exit.onward).map((exit) => exit.number)).toEqual([4]);
  });

  it('leaves a few spots out of reach of every hole', () => {
    expect(spotsWithoutHole().map((spot) => spot.table)).toEqual(['4', '4', '4', '5']);
    expect(tiles(hunting.escape.search)).toBe(23);
  });
});
