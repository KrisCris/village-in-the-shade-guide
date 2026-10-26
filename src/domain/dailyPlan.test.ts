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

// save.004 is winter 2 of year 1: 446 farm cells learned, 129 of them empty.
describe.skipIf(!hasPrivateSaveFixtures)('daily plan on the winter 2 fixture save', () => {
  let plan: ReturnType<typeof dailyPlan>;
  beforeAll(() => {
    const { doc, snapshot } = readDailySave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004');
    const catalog = getCatalog(), payload = dailyPayload(catalog);
    const entities = plannerPayload(catalog);
    const crops: Catalog = { buildId: '', generatedAt: '', entities, byId: Object.fromEntries(entities.map((entity) => [entity.id, entity])), counts: {} };
    const categories = new Map(catalog.entities.filter((entity) => entity.kind === 'items').map((entity) => [entity.numeric_id as number, entity.category_id as string]));
    plan = dailyPlan({
      snapshot, digest: buildDailyDigest(snapshot, DAILY_CROPS), payload, crops, unlocked: enabledFlags(doc, planFlags(payload)),
      itemCategory: (itemId) => categories.get(itemId), settings: { horizon: 0, reserve: 0.2, choices: {} }, vacant: 129,
    });
  });

  it('finds the deliveries that can be handed in today', () => {
    expect([plan.deliveries.done, plan.deliveries.total]).toEqual([17, 61]);
    expect(plan.deliveries.ready.map((entry) => entry.spec.name)).toEqual(['石材', '小动物的材料', '稀有宝石', '供奉夏季渔产', '供奉秋季渔产']);
    // The winter fish offering only lacks a salmon, which bites in winter.
    expect(plan.deliveries.pending.find((entry) => entry.spec.name === '供奉冬季渔产')?.eta).toBe(0);
  });

  it('asks for more brewing barrels and beehives by the end of the season', () => {
    expect(plan.horizon).toBe(26);
    expect(plan.processing.families.filter((family) => family.build.length).map((family) => [family.family, family.build])).toEqual([
      ['gimmick_brewing_barrel', [{ machine: 400030, count: 11, upgrade: false }]],
      ['gimmick_beehive', [{ machine: 402040, count: 11, upgrade: false }]],
    ]);
  });

  it('sends the player to quarry floors 71–79 for the iron bars and to the trees for wood', () => {
    const short = Object.fromEntries(plan.materials.filter((line) => line.short).map((line) => [line.itemId, line.short]));
    expect(short).toMatchObject({ 210020: 22, 240020: 108, 230000: 578 });
    const gather = plan.actions.flatMap((action) => action.kind === 'gather' ? action.lines.map((line) => [line.material.itemId, line.source.kind]) : []);
    expect(gather).toEqual([[240020, 'quarry'], [230000, 'trees'], [140300, 'sap'], [140370, 'sap']]);
    expect(plan.materials.find((line) => line.itemId === 240020)?.sources).toContainEqual({ kind: 'quarry', from: 71, to: 79, perHundred: 26.5, reached: true });
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
    expect(plan.actions.map((action) => action.kind)).toEqual(['deliver', 'fetch', 'fetch', 'machines', 'build', 'gather', 'gather', 'gather', 'plant', 'animal', 'routine']);
  });
});
