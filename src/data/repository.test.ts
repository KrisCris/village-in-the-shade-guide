import { describe, expect, it } from 'vitest';
import { buildCatalog, rankEntities } from './repository';
import { expandSearchRows } from './clientSearch';

describe('data repository', () => {
  const row = { id: 'CROPS_ID_ONION', name: { zh_hans: '洋葱', zh_hant: '洋蔥', ja: 'タマネギ', internal: 'CROPS_ID_ONION', aliases: ['洋葱', '洋蔥', 'タマネギ', 'CROPS_ID_ONION'], review_status: 'override' } };
  const catalog = buildCatalog({ '/entities/crops.json': [row] });

  it.each(['洋葱', '洋蔥', 'タマネギ', 'CROPS_ID_ONION'])('finds aliases: %s', (query) => {
    expect(rankEntities(query, catalog.entities)[0]?.id).toBe(row.id);
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
