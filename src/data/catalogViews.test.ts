import { describe, expect, it } from 'vitest';
import type { Catalog, Entity } from './types';
import { visibleRowsForKind } from './catalogViews';

const entity = (id: string, kind: string, extra: Record<string, unknown> = {}): Entity => ({
  id,
  kind,
  name: { zh_hans: id, zh_hant: id, ja: '', internal: id, aliases: [], review_status: 'test' },
  searchText: id.toLowerCase(),
  ...extra,
});

describe('catalog views', () => {
  it('shows only crops that have both a seed and a harvest', () => {
    const onion = entity('CROPS_ID_ONION', 'crops', {
      seed_item_ids: ['ITEM_ID_ONION_SEED'],
      harvest_item_ids: ['ITEM_ID_ONION'],
    });
    const butterbur = entity('CROPS_ID_OBJECT_BUTTERBUR_SCAPE', 'crops', {
      seed_item_ids: [],
      harvest_item_ids: [],
    });
    const catalog: Catalog = {
      buildId: 'test', generatedAt: '', entities: [onion, butterbur],
      byId: { [onion.id]: onion, [butterbur.id]: butterbur }, counts: { crops: 2 },
    };

    expect(visibleRowsForKind(catalog, 'crops').map((row) => row.id)).toEqual(['CROPS_ID_ONION']);
  });

  it('leaves non-crop kinds unchanged', () => {
    const item = entity('ITEM_ID_STONE', 'items');
    const catalog: Catalog = { buildId: 'test', generatedAt: '', entities: [item], byId: { [item.id]: item }, counts: { items: 1 } };

    expect(visibleRowsForKind(catalog, 'items')).toEqual([item]);
  });
});
