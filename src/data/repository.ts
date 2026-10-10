import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog, Entity } from './types';
import { buildCatalog } from './catalog';
import { defaultLocale, type Locale } from '../i18n/locales';

export { entityUrl, normalizeSearch, rankEntities } from './clientSearch';

const modules = import.meta.glob('../../data/generated/build-25311578/entities/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

export { buildCatalog } from './catalog';

const cached = new Map<Locale, Catalog>();

export function retainAvailableIconPaths(catalog: Catalog, iconExists: (path: string) => boolean) {
  for (const entity of new Set([...catalog.entities, ...Object.values(catalog.byId)])) {
    if (entity.icon_path && !iconExists(entity.icon_path)) entity.icon_path = null;
  }
  return catalog;
}

const rowIndex = new WeakMap<Catalog, Map<string, Entity>>();

/**
 * The same row in another language's catalog. Logic that matches authored
 * Chinese text runs on the default catalog; display reads the page language.
 */
export function inCatalog(catalog: Catalog, entity: Pick<Entity, 'kind' | 'id'>): Entity {
  let index = rowIndex.get(catalog);
  if (!index) {
    index = new Map(catalog.entities.map((row) => [`${row.kind}\0${row.id}`, row]));
    rowIndex.set(catalog, index);
  }
  return index.get(`${entity.kind}\0${entity.id}`) ?? (entity as Entity);
}

/** Catalog with names and authored text in the page language. */
export function getCatalog(locale: Locale = defaultLocale) {
  let catalog = cached.get(locale);
  if (!catalog) {
    catalog = retainAvailableIconPaths(
      buildCatalog(modules, undefined, locale),
      (path) => existsSync(join(process.cwd(), 'public', path.replace(/^\/+/, ''))),
    );
    cached.set(locale, catalog);
  }
  return catalog;
}
