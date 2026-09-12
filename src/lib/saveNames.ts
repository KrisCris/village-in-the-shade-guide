import { withBase } from './sitePath';
import type { LookupKind } from './saveModel';

/**
 * Numeric-id → display name and icon for the IDs stored in a save. Built by
 * `tools/build-site-data.ts` into `public/save-editor-names.json` so the editor
 * does not have to download the whole catalog.
 *
 * Icons are stored as bare stems relative to `iconBase`/`iconExt`, which is
 * where all but a handful of them live; a value that starts with `/` is a full
 * path instead (character portraits).
 */
export interface SaveNameTables {
  categories?: Record<string, string>;
  itemCategories?: Record<string, string>;
  iconBase?: string;
  iconExt?: string;
  names?: Partial<Record<LookupKind, Record<string, string>>>;
  icons?: Partial<Record<LookupKind, Record<string, string>>>;
}

let pending: Promise<SaveNameTables> | null = null;

export function loadSaveNames(): Promise<SaveNameTables> {
  pending ??= fetch(withBase('/save-editor-names.json'))
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));
  return pending;
}

export function lookupName(tables: SaveNameTables, kind: LookupKind | undefined, value: string): string | null {
  if (!kind) return null;
  return tables.names?.[kind]?.[value.trim()] ?? null;
}

/** Site-root-relative icon URL for an ID, or null when the catalog has none. */
export function lookupIcon(tables: SaveNameTables, kind: LookupKind | undefined, value: string): string | null {
  if (!kind) return null;
  const stem = tables.icons?.[kind]?.[value.trim()];
  if (!stem) return null;
  return withBase(stem.startsWith('/') ? stem : `${tables.iconBase ?? ''}${stem}${tables.iconExt ?? ''}`);
}
