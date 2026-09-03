import type { Catalog, Entity } from './types';

export function findCatalogEntity(catalog: Catalog, id: string, kind?: string): Entity | undefined {
  return kind ? catalog.entities.find((entity) => entity.id === id && entity.kind === kind) : catalog.byId[id];
}

export function resolveCatalogEntity(catalog: Catalog, requested: Entity): Entity {
  return findCatalogEntity(catalog, requested.id, requested.kind)
    ?? findCatalogEntity(catalog, requested.id)
    ?? requested;
}
