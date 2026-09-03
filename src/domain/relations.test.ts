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

  it('builds crop facts and profit with the selected quality', () => {
    const seed = entity('seed', 'items', { buy_price: 40, sell_price: 0 });
    const harvest = entity('harvest', 'items', { sell_price: 63, quality_eligible: true });
    const crop = entity('crop', 'crops', { seed_item_ids: ['seed'], harvest_item_ids: ['harvest'], seasons: ['spring'], growth_days: 5, quality_eligible: true });

    const model = buildEntityDetailModel(crop, catalog(seed, harvest, crop), 'silver');

    expect(model.facts).toContainEqual({ label: '卖出价', value: '≈94.50 · 银★', price: true });
    expect(model.profit).toMatchObject({ inputCost: '200', outputValue: '≈472.50', net: '≈272.50' });
  });
});
