import { describe, expect, it } from 'vitest';
import { buildCatalog, rankEntities, retainAvailableIconPaths } from './repository';
import { expandSearchRows } from './clientSearch';

describe('data repository', () => {
  const row = { id: 'CROPS_ID_ONION', name: { zh_hans: '洋葱', zh_hant: '洋蔥', ja: 'タマネギ', internal: 'CROPS_ID_ONION', aliases: ['洋葱', '洋蔥', 'タマネギ', 'CROPS_ID_ONION'], review_status: 'override' } };
  const catalog = buildCatalog({
    '/entities/items.json': [
      { id: 'ITEM_ID_ONION_SEED', name: { ...row.name, zh_hans: '洋葱种子', zh_hant: '洋蔥種子', aliases: ['洋葱种子'] } },
      { id: 'ITEM_ID_ONION', name: { ...row.name, zh_hans: '洋葱收获物', zh_hant: '洋蔥收穫物', aliases: ['洋葱收获物'] } },
      { id: 'ITEM_ID_PICKLE', name: { ...row.name, zh_hans: '洋葱泡菜', zh_hant: '洋蔥泡菜', aliases: ['洋葱泡菜'] } },
    ],
    '/entities/crops.json': [{ ...row, seed_item_ids: ['ITEM_ID_ONION_SEED'], harvest_item_ids: ['ITEM_ID_ONION'] }],
    '/entities/processes.json': [{ id: 'PROCESS_ID_ONION_PICKLE', name: { ...row.name, zh_hans: '洋葱泡菜', aliases: ['洋葱泡菜'] }, inputs: [{ item_id: 'ITEM_ID_ONION', quantity: 1 }], output: { item_id: 'ITEM_ID_PICKLE', quantity: 1 } }],
    '/entities/store-offers.json': [{ id: 'STORE_OFFER_ONION', item_id: 'ITEM_ID_ONION' }],
    '/entities/hunt-rewards.json': [{ id: 'HUNT_REWARD_ONION', item_id: 'ITEM_ID_ONION' }],
  });

  it.each(['洋葱', '洋蔥', 'タマネギ', 'CROPS_ID_ONION', 'yangcong', 'yang cong', 'yc'])('finds aliases: %s', (query) => {
    expect(rankEntities(query, catalog.entities)[0]?.id).toBe(row.id);
  });

  it('propagates quality from crops and harvests but not seeds', () => {
    expect(catalog.byId.CROPS_ID_ONION.quality_eligible).toBe(true);
    expect(catalog.byId.ITEM_ID_ONION.quality_eligible).toBe(true);
    expect(catalog.byId.ITEM_ID_ONION_SEED.quality_eligible).toBe(false);
    expect(catalog.byId.PROCESS_ID_ONION_PICKLE.quality_eligible).toBe(true);
    expect(catalog.byId.ITEM_ID_PICKLE.quality_eligible).toBe(true);
  });

  it('derives deterministic item icon paths without source icon IDs', () => {
    expect(catalog.byId.ITEM_ID_ONION.icon_path).toBe('/icons/generated/items/ITEM_ID_ONION.webp');
    expect(catalog.byId.CROPS_ID_ONION.icon_path).toBe('/icons/generated/items/ITEM_ID_ONION.webp');
    expect(catalog.byId.PROCESS_ID_ONION_PICKLE.icon_path).toBe('/icons/generated/items/ITEM_ID_PICKLE.webp');
  });

  it('removes icon paths that are unavailable before entities reach the page', () => {
    const copy = structuredClone(catalog);

    retainAvailableIconPaths(copy, (path) => path.endsWith('ITEM_ID_ONION.webp'));

    expect(copy.byId.ITEM_ID_ONION.icon_path).toBe('/icons/generated/items/ITEM_ID_ONION.webp');
    expect(copy.byId.ITEM_ID_PICKLE.icon_path).toBeNull();
    expect(copy.byId.PROCESS_ID_ONION_PICKLE.icon_path).toBeNull();
  });

  it('keeps synthesized store and hunt display prefixes after alias normalization', () => {
    expect(catalog.byId.STORE_OFFER_ONION.name.zh_hans).toBe('商店出售：洋葱收获物');
    expect(catalog.byId.HUNT_REWARD_ONION.name.zh_hans).toBe('狩猎报酬：洋葱收获物');
  });

  it('skips relation rows that do not own a display name', () => {
    expect(() => rankEntities('洋葱', [{ id: 'STORE_ROW', kind: 'store-offers' } as never, ...catalog.entities])).not.toThrow();
  });

  it('expands the compact multilingual search index', () => {
    const [entity] = expandSearchRows([['CROPS_ID_ONION', 'crops', '洋葱', '洋蔥', 'タマネギ', []]]);
    expect(rankEntities('タマネギ', [entity])[0]?.id).toBe('CROPS_ID_ONION');
    expect(rankEntities('CROPS_ID_ONION', [entity])[0]?.name.zh_hans).toBe('洋葱');
  });
});
