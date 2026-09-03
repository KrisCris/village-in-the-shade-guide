import type { Catalog, Entity } from './types';

export function resolveCatalogEntity(catalog: Catalog, requested: Entity): Entity {
  return catalog.entities.find((entity) => entity.id === requested.id && entity.kind === requested.kind)
    ?? catalog.byId[requested.id]
    ?? requested;
}
