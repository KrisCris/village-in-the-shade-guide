import type { Catalog } from './types';
import { buildCatalog } from './catalog';

export { entityUrl, normalizeSearch, rankEntities } from './clientSearch';

const modules = import.meta.glob('../../data/generated/build-24969282/entities/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

export { buildCatalog } from './catalog';

let cached: Catalog | undefined;
export function getCatalog() {
  return cached ??= buildCatalog(modules);
}
