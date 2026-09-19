import { expect, it } from 'vitest';
import { compactDetailModel } from './detailPayload';
import { buildEntityDetailModel } from '../domain/relations';
import type { Catalog, Entity } from './types';

it('keeps full-catalog recipe relationships separate from the static first batch', () => {
  const item = (id: string, kind = 'items'): Entity => ({ id, kind, name: { zh_hans: id, zh_hant: id, ja: '', internal: id, aliases: [], review_status: '' }, searchText: id, sell_price: 1, raw_evidence: 'x'.repeat(1000) });
  const product = item('product'), material = item('material');
  const recipes = Array.from({ length: 30 }, (_, i) => ({ ...item(`process-${i}`, 'processes'), output: { item_id: product.id, quantity: 1 }, inputs: [{ item_id: material.id, quantity: 1 }], duration_minutes: i + 1 }));
  const entities = [product, material, ...recipes];
  const catalog: Catalog = { entities, byId: Object.fromEntries(entities.map(e => [e.id, e])), counts: {}, buildId: 'test', generatedAt: '' };
  const full = buildEntityDetailModel(product, catalog, 'normal');
  const compact = compactDetailModel(full);
  expect(full.processingPlans).toHaveLength(30);
  expect(compact.processingPlans).toHaveLength(12);
  expect(compact.totalProcessingPlans).toBe(30);
  expect(compact.processingPlans[0].groups.find(g => g.key === 'materials')?.rows[0].entity).toMatchObject({ id: 'material', kind: 'items' });
  expect(compact.processingPlans[0].entity.raw_evidence).toBeUndefined();
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length / 2);
  expect(compact.entity).toBe(full.entity);
});
