import { expect, it } from 'vitest';
import type { Catalog, Entity } from './types';
import { resolveCatalogEntity } from './entityLookup';

function entity(id: string, kind: string): Entity {
  return {
    id,
    kind,
    name: { zh_hans: kind, zh_hant: kind, ja: '', internal: id, aliases: [id], review_status: 'test' },
    searchText: id.toLowerCase(),
  };
}

it('keeps the requested kind when item and machine share an id', () => {
  const item = entity('ITEM_ID_GIMMICK_BARREL', 'items');
  const machine = entity('ITEM_ID_GIMMICK_BARREL', 'machines');
  const catalog: Catalog = {
    buildId: 'test', generatedAt: '', entities: [item, machine], byId: { [item.id]: item }, counts: {},
  };

  expect(resolveCatalogEntity(catalog, machine)).toBe(machine);
});
