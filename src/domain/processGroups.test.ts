import { describe, expect, it } from 'vitest';
import type { Catalog, Entity } from '../data/types';
import { groupProcessesByOutput } from './processGroups';

const entity = (id: string, kind: string, extra: Record<string, unknown> = {}): Entity => ({
  id,
  kind,
  name: { zh_hans: id, zh_hant: id, ja: '', internal: id, aliases: [], review_status: 'test' },
  searchText: id.toLowerCase(),
  ...extra,
});

function catalog(...entities: Entity[]): Catalog {
  return { buildId: 'test', generatedAt: '', entities, byId: Object.fromEntries(entities.map((row) => [row.id, row])), counts: {} };
}

describe('process product groups', () => {
  it('groups variants by output ID and retains their recipes and machines', () => {
    const fishSauce = entity('ITEM_ID_FISH_SAUCE', 'items', { sell_price: 140, icon_path: '/fish-sauce.webp' });
    const carp = entity('ITEM_ID_CARP', 'items', { sell_price: 60 });
    const eel = entity('ITEM_ID_EEL', 'items', { sell_price: 100 });
    const fromCarp = entity('PROCESS_CARP', 'processes', {
      inputs: [{ item_id: carp.id, quantity: 1 }], output: { item_id: fishSauce.id, quantity: 1 },
      machine_ids: ['JAR'], duration_minutes: 2880,
    });
    const fromEel = entity('PROCESS_EEL', 'processes', {
      inputs: [{ item_id: eel.id, quantity: 1 }], output: { item_id: fishSauce.id, quantity: 1 },
      machine_ids: ['JAR', 'JAR_02'], duration_minutes: 1440,
    });

    const rows = groupProcessesByOutput([fromCarp, fromEel], catalog(fishSauce, carp, eel, fromCarp, fromEel));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: fishSauce.id,
      kind: 'items',
      source_kind: 'processes',
      variant_count: 2,
      variant_ids: ['PROCESS_CARP', 'PROCESS_EEL'],
      machine_ids: ['JAR', 'JAR_02'],
      buy_price: 60,
      sell_price: 140,
      net_profit: 80,
      profit_per_day: 40,
    });
    expect(rows[0].variants).toEqual([fromCarp, fromEel]);
  });

  it('groups by output ID rather than translated display name', () => {
    const outputA = entity('OUTPUT_A', 'items', { name: { zh_hans: '白色染料', zh_hant: '', ja: '', internal: 'OUTPUT_A', aliases: [], review_status: 'test' }, sell_price: 50 });
    const outputB = entity('OUTPUT_B', 'items', { name: { zh_hans: '白色染料', zh_hant: '', ja: '', internal: 'OUTPUT_B', aliases: [], review_status: 'test' }, sell_price: 70 });
    const processA = entity('PROCESS_A', 'processes', { inputs: [], output: { item_id: outputA.id, quantity: 1 }, machine_ids: [] });
    const processB = entity('PROCESS_B', 'processes', { inputs: [], output: { item_id: outputB.id, quantity: 1 }, machine_ids: [] });

    expect(groupProcessesByOutput([processA, processB], catalog(outputA, outputB, processA, processB))).toHaveLength(2);
  });
});
