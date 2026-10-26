import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import crops from '../../data/generated/build-25311578/entities/crops.json';
import { DAILY_CROPS, farmableCells, gameDate, readDailySave, type DailySnapshot } from './saveDaily';
import { buildDailyDigest, landSummary } from '../domain/dailyDigest';
import { emptyFarmArea, learnFarmArea } from './farmArea';
import type { SerDocument } from './ser';

const cropId = (code: string) => crops.find((crop) => crop.id === code)!.numeric_id;

describe('game date', () => {
  it('turns the calendar day over at 07:00', () => {
    expect(gameDate(0)).toEqual({ year: 1, season: 0, day: 1, hour: 7, minute: 0 });
    expect(gameDate(17 * 3600)).toEqual({ year: 1, season: 0, day: 1, hour: 0, minute: 0 });
    expect(gameDate(86_400)).toEqual({ year: 1, season: 0, day: 2, hour: 7, minute: 0 });
    expect(gameDate(112 * 86_400 + 3 * 28 * 86_400 + 90 * 60)).toEqual({ year: 2, season: 3, day: 1, hour: 8, minute: 30 });
  });
});

// The five fixtures are one slot in order: autumn 28 07:00 (save.005), autumn 28 00:00
// (save.001), winter 1 07:00 (save.002), winter 1 00:00 (save.003), winter 2 07:00 (save.004).
describe.skipIf(!hasPrivateSaveFixtures)('daily view on the fixture saves', () => {
  const order = ['save.005', 'save.001', 'save.002', 'save.003', 'save.004'];
  const saves: Record<string, { doc: SerDocument; snapshot: DailySnapshot }> = {};
  beforeAll(() => {
    for (const name of order) saves[name] = readDailySave(new Uint8Array(readFileSync(`tests/gamesave/${name}`)), name);
  });
  const cellsOf = (name: string) => new Map(saves[name].snapshot.cells.map((cell) => [cell.id, cell]));

  it('reads the clock, weather and slot state', () => {
    expect(order.map((name) => saves[name].snapshot.date)).toEqual([
      { year: 1, season: 2, day: 28, hour: 7, minute: 0 }, { year: 1, season: 2, day: 28, hour: 0, minute: 0 },
      { year: 1, season: 3, day: 1, hour: 7, minute: 0 }, { year: 1, season: 3, day: 1, hour: 0, minute: 0 },
      { year: 1, season: 3, day: 2, hour: 7, minute: 0 },
    ]);
    const { snapshot } = saves['save.004'];
    expect(snapshot).toMatchObject({ weather: 3, money: 60083, deliveriesOpen: true, animals: { total: 10, fed: 0 } });
    expect(snapshot.cells.filter((cell) => cell.crop)).toHaveLength(424);
    expect(snapshot.deliveries).toHaveLength(100);
  });

  it('leaves wild grass and trees out of the crops', () => {
    const silverGrass = cropId('CROPS_ID_OBJECT_CUTTING_SILVER_GRASS');
    expect(saves['save.004'].snapshot.cells.some((cell) => cell.crop === silverGrass)).toBe(false);
    expect(saves['save.003'].snapshot.cells.filter((cell) => cell.wild)).toHaveLength(11);
  });

  it('grows watered field crops by exactly 100 points overnight, and logs and trees without water', () => {
    const night = cellsOf('save.003'), morning = cellsOf('save.004');
    const watered: number[] = [], unwateredLogsAndTrees: number[] = [];
    for (const [id, before] of night) {
      const after = morning.get(id);
      if (!before.crop || after?.crop !== before.crop || after.form !== before.form || before.growth >= before.maximum) continue;
      if (before.soil && before.wet) watered.push(after.growth - before.growth);
      if (!before.soil && !before.wet) unwateredLogsAndTrees.push(after.growth - before.growth);
    }
    // These saves have no growing field crop left dry overnight, so that case stays unverified.
    expect(watered).toHaveLength(380);
    expect(new Set(watered)).toEqual(new Set([100]));
    expect(unwateredLogsAndTrees.length).toBeGreaterThan(0);
    expect(new Set(unwateredLogsAndTrees)).toEqual(new Set([100]));
  });

  it('predicts which crops wither at the season change', () => {
    const lastNight = buildDailyDigest(saves['save.001'].snapshot, DAILY_CROPS);
    const nextMorning = buildDailyDigest(saves['save.002'].snapshot, DAILY_CROPS);
    const taro = cropId('CROPS_ID_TARO'), sesame = cropId('CROPS_ID_SESAME');
    expect(lastNight.daysLeft).toBe(0);
    expect(lastNight.hoursToTurnover).toBe(7);
    const warned = [...lastNight.seasonEnd.witherAtChange, ...lastNight.seasonEnd.lost];
    expect(warned.map((group) => [group.crop, group.cells.length])).toEqual([[taro, 50], [sesame, 2]]);
    const witheredCells = (crop: number) => nextMorning.chores.withered.find((group) => group.crop === crop)?.cells.sort();
    expect(witheredCells(taro)).toEqual(lastNight.seasonEnd.witherAtChange[0].cells.sort());
    expect(witheredCells(sesame)).toEqual(lastNight.seasonEnd.lost[0].cells.sort());
  });

  it('builds the winter 2 morning summary', () => {
    const digest = buildDailyDigest(saves['save.004'].snapshot, DAILY_CROPS);
    expect(digest.harvest.map(({ crop, kind, cells }) => [crop, kind, cells.length])).toEqual([
      [cropId('CROPS_ID_SHIMEJI'), 'ripe', 5], [cropId('CROPS_ID_SHIITAKE_MUSHROOM'), 'ripe', 1], [cropId('CROPS_ID_MANDARIN_ORANGE_TREE'), 'shake', 1],
    ]);
    expect(digest.forecast.map((day) => day.days)).toEqual([2, 3, 5, 6]);
    expect(digest.chores.water).toHaveLength(391);
    expect(digest.chores.hungry).toBe(10);
    expect(digest.seasonEnd).toEqual({ lost: [], witherAtChange: [] });
    expect(digest.machines.done.reduce((sum, row) => sum + row.slots, 0)).toBe(3);
    expect(digest.deliveries.ready).toHaveLength(21);
  });

  it('remembers farmland that turned back into plain ground overnight', () => {
    let area = emptyFarmArea();
    for (const name of order) area = learnFarmArea(area, saves[name].snapshot.cells);
    expect(area.include).toHaveLength(586);
    expect(landSummary(saves['save.004'].snapshot.cells, new Set(area.include))).toEqual({ area: 586, planted: 394, tilled: 96, plain: 96, wild: 0 });
    // Learned cells are all ground that could be farmed again.
    expect(farmableCells(saves['save.004'].doc, area.include)).toHaveLength(586);
  });
});
