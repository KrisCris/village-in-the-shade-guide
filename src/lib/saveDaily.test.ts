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
    expect(snapshot).toMatchObject({ weather: 3, money: 60083, catalogOpen: true, quarryReached: 120, animals: { total: 10, fed: 0 } });
    expect(snapshot.cells.filter((cell) => cell.crop)).toHaveLength(424);
    expect([snapshot.bundles.length, snapshot.bundles.filter((bundle) => bundle.items.every((item) => item.remain === 0)).length]).toEqual([61, 17]);
    expect([snapshot.trees.length, snapshot.trees.filter((tree) => tree.grown).length]).toEqual([65, 31]);
    expect(snapshot.houses.map(({ type, slots, residents }) => [type, slots, residents.length])).toEqual([[0, 4, 4], [1, 8, 4]]);
  });

  it('leaves wild grass and trees out of the crops', () => {
    const silverGrass = cropId('CROPS_ID_OBJECT_CUTTING_SILVER_GRASS');
    expect(saves['save.004'].snapshot.cells.some((cell) => cell.crop === silverGrass)).toBe(false);
    expect(saves['save.003'].snapshot.cells.filter((cell) => cell.wild)).toHaveLength(11);
  });

  it('grows watered field crops by exactly 100 points overnight, and kits and trees without water', () => {
    const night = cellsOf('save.003'), morning = cellsOf('save.004');
    const autumnScarecrow = new Set(saves['save.003'].snapshot.scarecrows.find((scarecrow) => scarecrow.season === 2)!.cells);
    const watered: number[] = [], unwatered: number[] = [], kits: number[] = [];
    for (const [id, before] of night) {
      const after = morning.get(id);
      if (!before.crop || after?.crop !== before.crop || after.form !== before.form || before.growth >= before.maximum) continue;
      if (before.soil && before.wet) watered.push(after.growth - before.growth);
      if (!before.soil && !before.wet) unwatered.push(after.growth - before.growth);
      if (!before.soil && !DAILY_CROPS.get(before.crop)!.perennial) kits.push(id);
    }
    // These saves have no growing field crop left dry overnight, so that case stays unverified.
    expect(watered).toHaveLength(380);
    expect(new Set(watered)).toEqual(new Set([100]));
    expect(unwatered.length).toBeGreaterThan(0);
    expect(new Set(unwatered)).toEqual(new Set([100]));
    // The autumn kits grew in winter only because they all stand in an autumn scarecrow's range.
    expect(kits.length).toBeGreaterThan(0);
    expect(kits.every((id) => autumnScarecrow.has(id))).toBe(true);
  });

  it('reads scarecrows, and finds the summer crops withered where spent summer scarecrows stand', () => {
    const summary = (name: string) => saves[name].snapshot.scarecrows.map(({ season, days, spent, cells }) => [season, days, spent, cells.length]);
    expect(summary('save.005')).toEqual([[1, 28, true, 25], [1, 28, true, 25]]);
    expect(summary('save.001')).toEqual([[2, 0, false, 25]]);
    expect(summary('save.004')).toEqual([[2, 2, false, 25]]);
    const { cells, scarecrows } = saves['save.005'].snapshot;
    const covered = new Set(scarecrows.flatMap((scarecrow) => scarecrow.cells));
    const withered = cells.filter((cell) => cell.form === 2);
    expect(withered).toHaveLength(40);
    expect(withered.every((cell) => covered.has(cell.id) && DAILY_CROPS.get(cell.crop)!.seasons.includes('summer'))).toBe(true);
    expect(buildDailyDigest(saves['save.005'].snapshot, DAILY_CROPS).chores.spentScarecrows).toHaveLength(2);
  });

  it('keeps kits under the autumn scarecrow out of the season-change warnings', () => {
    const kitCrops = new Set([cropId('CROPS_ID_SHIITAKE_MUSHROOM'), cropId('CROPS_ID_SHIMEJI'), cropId('CROPS_ID_KIKURAGE')]);
    const { snapshot } = saves['save.001'];
    const warnedKits = (digest: ReturnType<typeof buildDailyDigest>) => digest.seasonEnd.lost.filter((group) => kitCrops.has(group.crop)).length;
    const digest = buildDailyDigest(snapshot, DAILY_CROPS);
    expect(warnedKits(digest)).toBe(0);
    expect(digest.scarecrows).toEqual([expect.objectContaining({ season: 2, daysLeft: 27, crops: 24 })]);
    // Without it, the unripe kits would stop growing at the change.
    expect(warnedKits(buildDailyDigest({ ...snapshot, scarecrows: [] }, DAILY_CROPS))).toBeGreaterThan(0);
  });

  it('predicts which crops wither at the season change', () => {
    const lastNight = buildDailyDigest(saves['save.001'].snapshot, DAILY_CROPS);
    const nextMorning = buildDailyDigest(saves['save.002'].snapshot, DAILY_CROPS);
    const taro = cropId('CROPS_ID_TARO'), sesame = cropId('CROPS_ID_SESAME');
    expect(lastNight.daysLeft).toBe(0);
    expect(lastNight.hoursToTurnover).toBe(7);
    const warned = [...lastNight.seasonEnd.witherTomorrow, ...lastNight.seasonEnd.lost];
    expect(warned.map((group) => [group.crop, group.cause, group.cells.length])).toEqual([[taro, 'season', 50], [sesame, 'season', 2]]);
    const witheredCells = (crop: number) => nextMorning.chores.withered.find((group) => group.crop === crop)?.cells.sort();
    expect(witheredCells(taro)).toEqual(lastNight.seasonEnd.witherTomorrow[0].cells.sort());
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
    expect(digest.seasonEnd).toEqual({ lost: [], witherTomorrow: [] });
    expect(digest.scarecrows.map(({ season, daysLeft }) => [season, daysLeft])).toEqual([[2, 25]]);
    expect(digest.machines.done.reduce((sum, row) => sum + row.slots, 0)).toBe(3);
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
