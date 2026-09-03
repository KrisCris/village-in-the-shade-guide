import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog } from './types';
import { buildCatalog } from './catalog';

export { entityUrl, normalizeSearch, rankEntities } from './clientSearch';

const modules = import.meta.glob('../../data/generated/build-24969282/entities/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

export { buildCatalog } from './catalog';

let cached: Catalog | undefined;

export function retainAvailableIconPaths(catalog: Catalog, iconExists: (path: string) => boolean) {
  for (const entity of new Set([...catalog.entities, ...Object.values(catalog.byId)])) {
    if (entity.icon_path && !iconExists(entity.icon_path)) entity.icon_path = null;
  }
  return catalog;
}

export function getCatalog() {
  return cached ??= retainAvailableIconPaths(
    buildCatalog(modules),
    (path) => existsSync(join(process.cwd(), 'public', path.replace(/^\/+/, ''))),
  );
}
