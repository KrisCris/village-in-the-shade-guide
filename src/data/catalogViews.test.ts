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

  it('lists early and over-season products without inventing independent crop timings', () => {
    const crop = entity('edamame', 'crops', { seed_item_ids: ['seed'], harvest_item_ids: ['edamame-item', 'sprout', 'soy'], seasons: ['summer'], harvest_stages: [{ state: 1, item_id: 'sprout' }, { state: 9, item_id: 'soy' }] });
    const sprout = entity('sprout', 'items'), soy = entity('soy', 'items');
    const rows = visibleRowsForKind({ buildId: '', generatedAt: '', entities: [crop, sprout, soy], byId: {}, counts: {} }, 'crops');
    expect(rows.map(r => r.id)).toEqual(['edamame', 'sprout', 'soy']);
    expect(rows[1].cultivation_method).toContain('生长途中');
    expect(rows[2].seasons).toEqual(['autumn']);
    expect(rows[2].growth_days).toBeUndefined();
  });
  it('leaves non-crop kinds unchanged', () => {
    const item = entity('ITEM_ID_STONE', 'items');
    const catalog: Catalog = { buildId: 'test', generatedAt: '', entities: [item], byId: { [item.id]: item }, counts: { items: 1 } };

    expect(visibleRowsForKind(catalog, 'items')).toEqual([item]);
  });
});
