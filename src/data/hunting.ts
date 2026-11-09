import type { Locale } from '../i18n/locales';
import type { Translate } from '../i18n/translate';
import data from '../../data/sources/game-hunting.json';
import { tableOdds } from '../domain/huntingSpawns';
import { monsterName } from './nightMonsters';

export const hunting = data;
export type AnimalKey = keyof typeof data.animals;
export type TableKey = keyof typeof data.tables;
type Point = { x: number; y: number };

/** Official creature name (Simplified converted from the game's Traditional Chinese). */
export const animalName = (key: AnimalKey, locale: Locale) => monsterName(data.animals[key], locale);

/** Map-unit distance as whole tiles (MAP_GLID_SIZE). */
export const tiles = (units: number) => Math.round(units / data.grid);

/** Spawn tables in map-legend order; each is named after the animals its game label names. */
export const ZONES: Array<{ table: TableKey; animals: AnimalKey[]; color: string }> = [
  { table: '4', animals: ['SQUIRREL', 'RABBIT'], color: '#4cbf75' },
  { table: '5', animals: ['PHEASANT'], color: '#f2b632' },
  { table: '6', animals: ['WEASEL'], color: '#3fc8d0' },
  { table: '7', animals: ['RACCOON_DOG'], color: '#f08a3c' },
  { table: '8', animals: ['FOX'], color: '#e2553f' },
  { table: '9', animals: ['BOAR'], color: '#f07fb5' },
  { table: '10', animals: ['DEER'], color: '#4a86e8' },
  { table: '11', animals: ['BEAR'], color: '#a46be6' },
];
export const zoneOf = (table: string) => ZONES.find((zone) => zone.table === table)!;
export const zoneName = (zone: (typeof ZONES)[number], locale: Locale, t: Translate) => zone.animals.length > 1
  ? t('{a}·{b}区', { a: animalName(zone.animals[0], locale), b: animalName(zone.animals[1], locale) })
  : t('{animal}区', { animal: animalName(zone.animals[0], locale) });

export interface ZoneAnimal {
  animal: AnimalKey;
  /** Seasons (0 = spring … 3 = winter) in which the table can place it. */
  seasons: number[];
  /** Lowest and highest chance over those seasons that at least one is placed that day. */
  chance: [number, number];
  /** Highest average count per day over those seasons. */
  expected: number;
}

/** What a table places per day, season by season, in row order. */
export function zoneAnimals(table: TableKey): ZoneAnimal[] {
  const t = data.tables[table];
  const result = new Map<string, ZoneAnimal>();
  for (const season of [0, 1, 2, 3]) {
    for (const odds of tableOdds(t.rows, t.spots.length, season)) {
      if (!odds.atLeastOne) continue;
      const entry = result.get(odds.animal) ?? { animal: odds.animal as AnimalKey, seasons: [], chance: [1, 0] as [number, number], expected: 0 };
      entry.seasons.push(season);
      entry.chance = [Math.min(entry.chance[0], odds.atLeastOne), Math.max(entry.chance[1], odds.atLeastOne)];
      entry.expected = Math.max(entry.expected, odds.expected);
      result.set(odds.animal, entry);
    }
  }
  return [...result.values()];
}

/** Every zone that can place the animal (or any of its variants), with its odds there. */
export const animalZones = (keys: AnimalKey[]) => ZONES.flatMap((zone) => zoneAnimals(zone.table)
  .filter((entry) => keys.includes(entry.animal)).map((entry) => ({ zone, ...entry })));

/** Chance as a percentage: whole numbers from 10%, one decimal below; a range when seasons differ. */
export function chanceText([low, high]: [number, number]) {
  const one = (value: number) => {
    const shown = value >= 0.1 ? Math.round(value * 100) : Math.round(value * 1000) / 10;
    return value < 1 && shown >= 100 ? '>99' : String(shown);
  };
  return one(low) === one(high) ? `${one(low)}%` : `${one(low)}–${one(high)}%`;
}

export const exitNumber = (name: string) => Number(name.slice(-3));
const inSearch = (a: Point, b: Point) => Math.abs(a.x - b.x) <= data.escape.search && Math.abs(a.y - b.y) <= data.escape.search;
const nearestZone = (point: Point) => {
  let best = { table: '', distance: Infinity };
  for (const [table, t] of Object.entries(data.tables)) {
    for (const spot of t.spots) {
      const distance = Math.hypot(spot.x - point.x, spot.y - point.y);
      if (distance < best.distance) best = { table, distance };
    }
  }
  return zoneOf(best.table);
};

/**
 * Escape exits with the holes that lead to them and the zones whose spots have one of those holes
 * inside the ±search square a fleeing animal looks through first.
 */
export function escapeExits() {
  return Object.entries(data.escape.exits).map(([name, point]) => {
    const holes = data.escape.holes.filter((hole) => hole.exit === name);
    const from = ZONES.filter((zone) => data.tables[zone.table].spots.some((spot) => holes.some((hole) => inSearch(spot, hole))));
    return { number: exitNumber(name), point, holes, from, zone: nearestZone(point), onward: data.escape.holes.some((hole) => inSearch(point, hole)) };
  });
}

/** Spawn spots with no escape hole inside the search square: animals there just run from the player first. */
export const spotsWithoutHole = () => Object.entries(data.tables).flatMap(([table, t]) =>
  t.spots.filter((spot) => !data.escape.holes.some((hole) => inSearch(spot, hole))).map((spot) => ({ table, ...spot })));
