import { normalizeSearch as normalizeCatalogSearch } from '../data/clientSearch';
import { buildPinyinAliases } from '../data/serverSearchAliases';
import { simplifySaveText } from './saveText';

export const normalizeSearch = (value: string) => normalizeCatalogSearch(simplifySaveText(value));

// Reuse the catalog's phonetic rules; index labels once rather than on each keypress.
const aliases = new Map<string, string>();
function indexLabel(value: string): string {
  if (!/[\u3400-\u9fff]/u.test(value)) return normalizeSearch(value);
  const cached = aliases.get(value);
  if (cached !== undefined) return cached;
  const indexed = normalizeSearch([value, ...buildPinyinAliases(value)].join(' '));
  if (aliases.size >= 4096) aliases.delete(aliases.keys().next().value!);
  aliases.set(value, indexed);
  return indexed;
}

export function buildSaveSearchText(...values: string[]): string {
  return values.map(indexLabel).join(' ');
}
