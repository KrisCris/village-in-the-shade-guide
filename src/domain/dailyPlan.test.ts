import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { dailyPayload } from '../data/dailyPayload';
import { plannerPayload } from '../data/plannerPayload';
import { getCatalog } from '../data/repository';
import type { Catalog } from '../data/types';
import { DAILY_CROPS, enabledFlags, readDailySave } from '../lib/saveDaily';
import { buildDailyDigest } from './dailyDigest';
import { dailyPlan, planFlags } from './dailyPlan';
import { BUILD_DAYS } from './dailyProcessing';

function planFor(name: string, vacant: number) {
  const { doc, snapshot } = readDailySave(new Uint8Array(readFileSync(`tests/gamesave/${name}`)), name);
  const catalog = getCatalog(), payload = dailyPayload(catalog);
  const entities = plannerPayload(catalog);
  const crops: Catalog = { buildId: '', generatedAt: '', entities, byId: Object.fromEntries(entities.map((entity) => [entity.id, entity])), counts: {} };
  const items = catalog.entities.filter((entity) => entity.kind === 'items');
  const categories = new Map(items.map((entity) => [entity.numeric_id as number, entity.category_id as string]));
  // ITEM_FEATURE_NOT_PUBLISH_ENCYCLOPEDIA, as the save editor's name tables mark it.
  const hidden = new Set(items.filter((entity) => (entity.feature_ids as number[] | undefined)?.includes(8)).map((entity) => entity.numeric_id as number));
  return dailyPlan({
    snapshot, digest: buildDailyDigest(snapshot, DAILY_CROPS), payload, crops, unlocked: enabledFlags(doc, planFlags(payload)),
    itemCategory: (itemId) => categories.get(itemId), hidden, settings: { choices: {} }, vacant,
  });
}
const ORDER = ['wither', 'deliver', 'fetch', 'machines', 'build', 'gather', 'plant', 'animal', 'collect', 'routine'];

// save.004 is winter 2 of year 1: 446 farm cells learned, 129 of them empty.
describe.skipIf(!hasPrivateSaveFixtures)('daily plan on the winter 2 fixture save', () => {
  let plan: ReturnType<typeof dailyPlan>;
  beforeAll(() => { plan = planFor('save.004', 129); });

  it('finds the deliveries that can be handed in today', () => {
    expect([plan.deliveries.done, plan.deliveries.total]).toEqual([17, 61]);
    expect(plan.deliveries.ready.map((entry) => entry.spec.name)).toEqual(['石材', '小动物的材料', '稀有宝石', '供奉夏季渔产', '供奉秋季渔产']);
    // The winter fish offering only lacks a salmon, which bites in winter.
    expect(plan.deliveries.pending.find((entry) => entry.spec.name === '供奉冬季渔产')?.eta).toBe(0);
  });

  it('loads no more than each machine has open today, from produce held after deliveries', () => {
    for (const machine of plan.processing.machines) {
      const open = machine.free + machine.later.reduce((sum, entry) => sum + entry.slots, 0);
      expect(machine.fill.reduce((sum, entry) => sum + entry.batches, 0)).toBeLessThanOrEqual(open);
      for (const entry of machine.fill) expect(entry.option.family).toBe(machine.family);
    }
    for (const line of plan.processing.produce) expect(line.today).toBeLessThanOrEqual(line.held);
  });

  it('suggests more only of machines with over a week of work, with what the stock pays for', () => {
    for (const line of plan.processing.build) {
      expect(line.days).toBeGreaterThan(BUILD_DAYS);
      for (const option of line.options) {
        const covered = Math.min(...option.inputs.map((input) => Math.floor(input.held / input.count)));
        expect(option.afford).toBe(option.upgrade ? Math.min(covered, option.basics!) : covered);
      }
    }
  });

  it('suggests winter crops the deliveries still need for the empty land', () => {
    expect(plan.planting.slice(0, 3).map((idea) => [idea.crop.id, idea.needed])).toEqual([['CROPS_ID_CHINESE_CABBAGE', 8], ['CROPS_ID_SPINACH', 8], ['CROPS_ID_DAIKON', 3]]);
    expect(plan.planting.every((idea) => (idea.crop.seasons as string[]).includes('winter'))).toBe(true);
  });

  it('points at the turkey for the coop and a bigger barn for the rest', () => {
    const turkey = plan.livestock.ideas.find((idea) => idea.house === 1);
    expect(turkey).toMatchObject({ room: 4, housed: true });
    expect(plan.livestock.ideas.find((idea) => idea.house === 0)?.order).toMatchObject({ slots: 8, from: 4, locked: false });
    expect(plan.livestock.ideas.find((idea) => idea.house === 2)).toMatchObject({ housed: false, order: { slots: 3 } });
  });

  it('orders the day from deliveries to routine care', () => {
    const now = plan.actions.filter((action) => !('later' in action && action.later)).map((action) => ORDER.indexOf(action.kind));
    expect(now).toEqual([...now].sort((x, y) => x - y));
  });
});

// The fixture set was replaced with a year 2 slot: save.004 is spring 26 at 07:00. CI still unpacks the
// older winter set, so these run only where save.004 is the spring snapshot.
const springSave = hasPrivateSaveFixtures && (() => {
  const { date } = readDailySave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004').snapshot;
  return date.year === 2 && date.season === 0 && date.day === 26;
})();
describe.skipIf(!springSave)('machines on the spring 26 fixture save', () => {
  const PICKLING = 400000, BREWING = 400030, BREWING_2 = 400031, BEEHIVE = 402040, MILK = 130000, PEA = 100020, PLUM = 122020, PANSY = 111210, ONION = 100010;
  const IRON_BAR = 210020, SWEET_SAP = 140300;
  let plan: ReturnType<typeof dailyPlan>;
  beforeAll(() => { plan = planFor('save.004', 0); });
  const machine = (itemId: number) => plan.processing.machines.find((entry) => entry.machine === itemId)!;

  it('counts today’s ripe crops and the fruit to shake, less what deliveries still lack', () => {
    const line = (itemId: number) => plan.processing.produce.find((entry) => entry.itemId === itemId);
    // Three plum trees drop one plum each; 205 onions ripen and a delivery still lacks 3.
    expect(line(PLUM)).toMatchObject({ held: 18, harvest: 3 });
    expect(line(ONION)).toMatchObject({ held: 202, harvest: 202 });
  });

  it('refills the pickling barrels at 10:48 and the beehives at 19:08 with what pays most', () => {
    // All 201 pickling slots finish 3 h 48 min after the 07:00 save; the plums shaken today go in too.
    expect(machine(PICKLING)).toMatchObject({ free: 0, later: [{ after: 13_680, slots: 201 }] });
    expect(machine(PICKLING).fill.map(({ itemId, count, gain }) => [itemId, count, gain])).toEqual([[PEA, 183, 5490], [PLUM, 18, 1800]]);
    // Peas pay most as soup in a brewing barrel, but those are full: the pickling barrel is the recommendation.
    const peas = plan.processing.produce.find((line) => line.itemId === PEA)!;
    expect([peas.options[0].machine, peas.options.find((option) => option.process === peas.best)?.machine]).toEqual([BREWING, PICKLING]);
    expect(machine(BEEHIVE).fill.map(({ itemId, count }) => [itemId, count])).toEqual([[PANSY, 32]]);
    // Milk adds more as yoghurt in a pickling barrel, but those slots earn more with peas; the milk processor takes it.
    expect(machine(400010).fill.map(({ itemId, count }) => [itemId, count])).toEqual([[MILK, 7]]);
    // The brewing barrels are full until tomorrow.
    expect(machine(BREWING)).toMatchObject({ free: 0, later: [], fill: [] });
    expect(machine(BREWING).next).toBeGreaterThan(24 * 3600);
  });

  it('asks for brewing barrels and beehives, priced per machine', () => {
    expect(plan.processing.build.map((line) => line.machine)).toEqual([BREWING, BEEHIVE]);
    const [brewing, beehive] = plan.processing.build;
    // A new upgraded barrel takes 2 iron bars for the barrel and 5 for the upgrade.
    expect(brewing.options.map(({ machine, upgrade, via, slots, afford, limit }) => ({ machine, upgrade, via, slots, afford, limit }))).toEqual([
      { machine: BREWING_2, upgrade: true, via: undefined, slots: 2, afford: 9, limit: IRON_BAR },
      { machine: BREWING_2, upgrade: false, via: BREWING, slots: 3, afford: 6, limit: IRON_BAR },
      { machine: BREWING, upgrade: false, via: undefined, slots: 1, afford: 23, limit: IRON_BAR },
    ]);
    expect(brewing.options[1].inputs.find((entry) => entry.itemId === IRON_BAR)?.count).toBe(7);
    expect(brewing.options[0].basics).toBe(23);
    expect(beehive.options).toMatchObject([{ machine: BEEHIVE, afford: 3, limit: SWEET_SAP }]);
  });

  it('counts the sap extractors already on the chestnut trees', () => {
    expect(plan.sources.get(SWEET_SAP)).toEqual([expect.objectContaining({ kind: 'sap', tree: 1000, collectors: 9 })]);
    expect((plan.sources.get(SWEET_SAP)![0] as { trees: number[] }).trees).toHaveLength(10);
  });

  it('lists the fish and products still missing from the encyclopedia or short for deliveries', () => {
    const LOACH = 160210, WHITE_CATFISH = 161020, CURSED_FROG = 162050, DRIED_FLOWER = 206500, PICKLED_EGGPLANT = 200110;
    const { collect } = plan;
    // The loach a delivery lacks leads the quarry spot; the white catfish is both unregistered and owed.
    expect(collect.spots[0]).toMatchObject({ id: 'FISHING_ID_06', catches: [
      { itemId: LOACH, missing: false, short: 3 }, { itemId: WHITE_CATFISH, missing: true, short: 1 }, { itemId: CURSED_FROG, missing: true, short: 0, odds: [0, 0, 0, .04] },
    ] });
    expect(collect.spots.every((spot) => spot.catches.every((entry) => entry.missing || entry.short > 0))).toBe(true);
    // Every spring wild plant is registered already; the dryer and pickling barrels can make what is left.
    expect(collect.lines.some((line) => line.source.kind === 'wild')).toBe(false);
    expect(collect.lines.find((line) => line.itemId === DRIED_FLOWER)).toMatchObject({ missing: false, short: 10, source: { kind: 'machine' } });
    expect(collect.lines.find((line) => line.itemId === PICKLED_EGGPLANT)).toMatchObject({ missing: true, source: { kind: 'machine', machine: PICKLING } });
  });
});
