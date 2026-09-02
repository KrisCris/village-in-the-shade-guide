import type { Entity } from './types';

export type CompactSearchRow = [id: string, kind: string, zhHans: string, zhHant: string, ja: string, aliases: string[]];

export function expandSearchRows(rows: CompactSearchRow[]): Entity[] {
  return rows.map(([id, kind, zh_hans, zh_hant, ja, extraAliases]) => ({
    id,
    kind,
    name: {
      zh_hans,
      zh_hant,
      ja,
      internal: id,
      aliases: [...new Set([zh_hans, zh_hant, ja, id, ...extraAliases].filter(Boolean))],
      review_status: 'search-index',
    },
    searchText: '',
  }));
}

export function normalizeSearch(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function rankEntities(query: string, rows: Entity[]) {
  const q = normalizeSearch(query);
  if (!q) return rows;
  return rows
    .filter((entity) => entity.name && Array.isArray(entity.name.aliases))
    .map((entity) => {
      const names = [entity.name.zh_hans, ...entity.name.aliases].map(normalizeSearch);
      const haystack = entity.searchText || normalizeSearch([entity.name.zh_hans, entity.name.zh_hant, entity.name.ja, entity.id, ...entity.name.aliases].join(' '));
      const score = names.includes(q) ? 0 : names.some((name) => name.startsWith(q)) ? 1 : haystack.includes(q) ? 2 : 99;
      return { entity, score };
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || a.entity.name.zh_hans.localeCompare(b.entity.name.zh_hans, 'zh-CN'))
    .map(({ entity }) => entity);
}

export function entityUrl(entity: Pick<Entity, 'kind' | 'id'>) {
  return `/data/${encodeURIComponent(entity.kind)}/${encodeURIComponent(entity.id)}/`;
}
