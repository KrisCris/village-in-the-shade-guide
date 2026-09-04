import type { Catalog, Entity } from './types';

export function isPlantableCrop(entity: Entity) {
  return entity.kind === 'crops'
    && ((entity.seed_item_ids as string[] | undefined)?.length ?? 0) > 0
    && ((entity.harvest_item_ids as string[] | undefined)?.length ?? 0) > 0;
}

export function visibleRowsForKind(catalog: Catalog, kind: string) {
  const rows = catalog.entities.filter((entity) => entity.kind === kind);
  return kind === 'crops' ? rows.filter(isPlantableCrop) : rows;
}
