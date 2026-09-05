import { describe, expect, it } from 'vitest';
import type { Catalog, Entity } from '../data/types';
import { buildEntityDetailModel, buildRelationGroups } from './relations';

const entity = (id: string, kind: string, extra: Record<string, unknown> = {}): Entity => ({
  id,
  kind,
  name: { zh_hans: id, zh_hant: id, ja: '', internal: id, aliases: [id], review_status: 'test' },
  searchText: id.toLowerCase(),
  ...extra,
});

function catalog(...entities: Entity[]): Catalog {
  return { buildId: '24969282', generatedAt: '', entities, byId: Object.fromEntries(entities.map((row) => [row.id, row])), counts: {} };
}

describe('relation groups', () => {
  it('embeds processing variants without a second same-name acquisition panel or fake purchase price', () => {
    const rice = entity('rice', 'items', { sell_price: 67 });
    const vinegar = entity('vinegar', 'items', { sell_price: 107 });
    const process = entity('vinegar-process', 'processes', { buy_price: 67, inputs: [{item_id: 'rice', quantity: 1}], output: {item_id: 'vinegar', quantity: 1}, duration_minutes: 2820 });
    const data = catalog(rice, vinegar, process);
    const model = buildEntityDetailModel(vinegar, data, 'normal');
    expect(model.processingPlans).toHaveLength(1);
    expect(model.processingPlans[0].profit?.net).toBe('40');
    expect(model.groups.flatMap(group => group.rows).some(row => row.entity.id === process.id)).toBe(false);
    expect(model.processingPlans[0].facts.some(fact => fact.label === '买入价')).toBe(false);
  });
  it('separates crop acquisition, harvest output and processing uses', () => {
    const seed = entity('seed', 'items', { buy_price: 40, sell_price: 0 });
    const harvest = entity('harvest', 'items', { sell_price: 63, quality_eligible: true });
    const crop = entity('crop', 'crops', { seed_item_ids: ['seed'], harvest_item_ids: ['harvest'], seasons: ['spring'], quality_eligible: true });
    const process = entity('process', 'processes', { inputs: [{ item_id: 'harvest', quantity: 2 }], output: { item_id: 'jam', quantity: 1 }, duration_minutes: 2880 });
    const jam = entity('jam', 'items', { sell_price: 200, quality_eligible: true });

    const groups = buildRelationGroups(crop, catalog(seed, harvest, crop, process, jam), 'silver');

    expect(groups.map((group) => group.key)).toEqual(['acquisition', 'outputs', 'used-in']);
    expect(groups[0].rows[0]).toMatchObject({ entity: seed, quantity: 1, buyPrice: '40 · 固定' });
    expect(groups[1].rows[0].sellPrice).toBe('≈94.50 · 银★');
    expect(groups[2].rows[0].entity).toBe(process);
  });

  it('lists machine construction materials separately from process outputs', () => {
    const wood = entity('wood', 'items', { sell_price: 10 });
    const machine = entity('machine', 'machines', { sell_price: 52 });
    const recipe = entity('recipe', 'craft-recipes', { inputs: [{ item_id: 'wood', quantity: 4 }], output: { item_id: 'machine', quantity: 1 } });
    const product = entity('product', 'items', { sell_price: 100 });
    const process = entity('process', 'processes', { machine_ids: ['machine'], inputs: [], output: { item_id: 'product', quantity: 1 }, duration_minutes: 1440 });

    const groups = buildRelationGroups(machine, catalog(wood, machine, recipe, product, process), 'normal');

    expect(groups.find((group) => group.key === 'materials')?.rows[0]).toMatchObject({ entity: wood, quantity: 4 });
    expect(groups.find((group) => group.key === 'outputs')?.rows[0]).toMatchObject({ entity: product, quantity: 1 });
  });

  it('shows quality-adjusted process output and duration', () => {
    const input = entity('input', 'items', { sell_price: 40, quality_eligible: true });
    const output = entity('output', 'items', { sell_price: 100, quality_eligible: true });
    const process = entity('process', 'processes', { inputs: [{ item_id: 'input', quantity: 1 }], output: { item_id: 'output', quantity: 1 }, duration_minutes: 2880, quality_eligible: true });

    const row = buildRelationGroups(process, catalog(input, output, process), 'gold').find((group) => group.key === 'outputs')!.rows[0];

    expect(row.sellPrice).toBe('175 · 金★');
    expect(row.chips).toContain('2 日');
  });

  it('resolves a process machine as a machine when an item shares its id', () => {
    const item = entity('machine', 'items');
    const machine = entity('machine', 'machines');
    const output = entity('output', 'items', { sell_price: 100 });
    const process = entity('process', 'processes', { machine_ids: ['machine'], inputs: [], output: { item_id: 'output', quantity: 1 } });
    const data = catalog(item, machine, output, process);
    data.byId.machine = item;

    const usedMachine = buildRelationGroups(process, data, 'normal').find((group) => group.key === 'machines')?.rows[0].entity;

    expect(usedMachine).toBe(machine);
  });

  it('shows the silkworm box as a production source for raw silk', () => {
    const rawSilk = entity('raw-silk', 'items', { sell_price: 125 });
    const silkwormBox = entity('silkworm-box', 'machines');
    const process = entity('raw-silk-process', 'processes', {
      machine_ids: [silkwormBox.id], inputs: [], output: { item_id: rawSilk.id, quantity: 1 }, duration_minutes: 2820,
    });

    const groups = buildRelationGroups(rawSilk, catalog(rawSilk, silkwormBox, process), 'normal');

    expect(groups.find((group) => group.key === 'machines')?.rows.map((row) => row.entity)).toEqual([silkwormBox]);
    expect(groups.find((group) => group.key === 'acquisition')?.rows[0].entity).toBe(process);
  });

  it('deduplicates processing machines across output variants', () => {
    const fishSauce = entity('fish-sauce', 'items', { sell_price: 140 });
    const jar = entity('jar', 'machines');
    const jarImproved = entity('jar-improved', 'machines');
    const variants = Array.from({ length: 3 }, (_, index) => entity(`fish-sauce-${index}`, 'processes', {
      machine_ids: [jar.id, jarImproved.id], inputs: [], output: { item_id: fishSauce.id, quantity: 1 },
    }));

    const group = buildRelationGroups(fishSauce, catalog(fishSauce, jar, jarImproved, ...variants), 'normal')
      .find((candidate) => candidate.key === 'machines');

    expect(group?.label).toBe('加工机械');
    expect(group?.rows.map((row) => row.entity.id)).toEqual([jar.id, jarImproved.id]);
  });

  it('describes each reverse processing recipe with ingredients and profit', () => {
    const carp = entity('carp', 'items', { sell_price: 60 });
    const fishSauce = entity('fish-sauce', 'items', { sell_price: 140 });
    const process = entity('fish-sauce-from-carp', 'processes', {
      inputs: [{ item_id: carp.id, quantity: 1 }],
      output: { item_id: fishSauce.id, quantity: 1 },
      duration_minutes: 2880,
    });

    const row = buildRelationGroups(fishSauce, catalog(carp, fishSauce, process), 'normal')
      .find((group) => group.key === 'acquisition')!.rows[0];

    expect(row).toMatchObject({ buyLabel: '成本', sellLabel: '产值', note: '原料：carp ×1' });
    expect(row.chips).toContain('净收益 +80');
    expect(row.chips).toContain('日净收益 +40');
  });

  it('builds crop facts and profit with the selected quality', () => {
    const seed = entity('seed', 'items', { buy_price: 40, sell_price: 0 });
    const harvest = entity('harvest', 'items', { sell_price: 63, quality_eligible: true });
    const crop = entity('crop', 'crops', { seed_item_ids: ['seed'], harvest_item_ids: ['harvest'], seasons: ['spring'], growth_days: 5, quality_eligible: true });

    const model = buildEntityDetailModel(crop, catalog(seed, harvest, crop), 'silver');

    expect(model.facts).toContainEqual({ label: '卖出价', value: '≈94.50 · 银★', price: true });
    expect(model.profit).toMatchObject({ inputCost: '200', outputValue: '≈472.50', net: '≈272.50' });
  });
});
