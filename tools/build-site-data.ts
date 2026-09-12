import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCatalog } from '../src/data/catalog';
import {plannerPayload} from '../src/data/plannerPayload';

const source = 'data/generated/build-24969282/entities';
const input: Record<string, unknown> = {};
for (const file of (await readdir(source)).filter((name) => name.endsWith('.json')).sort()) {
  input[`/entities/${file}`] = JSON.parse(await readFile(join(source, file), 'utf8'));
}

const catalog = buildCatalog(input);
const { byId, ...publicCatalog } = catalog;
await mkdir('public', { recursive: true });
await writeFile('public/game-data.json', JSON.stringify(publicCatalog));
await writeFile('public/planner-data.json',JSON.stringify(plannerPayload(catalog)));
const searchRows = catalog.entities.map((entity) => {
  const { name } = entity;
  const baseNames = new Set([entity.id, name.zh_hans, name.zh_hant, name.ja, name.internal]);
  const extraAliases = name.aliases.filter((alias) => alias && !baseNames.has(alias));
  return [entity.id, entity.kind, name.zh_hans, name.zh_hant || '', name.ja || '', extraAliases];
});
await writeFile('public/search-index.json', JSON.stringify({ buildId: catalog.buildId, rows: searchRows }));

// Numeric-id lookup for the save editor: saves store these IDs, and the full
// catalog is far too large to download just to label a few of them.
const saveEditorKinds = ['items', 'characters', 'livestock', 'crops', 'weather', 'facilities'];
// Almost every icon sits under the same folder with the same extension, so the
// table stores bare stems and the reader puts the path back together. Anything
// that lives elsewhere (character portraits) is stored as a full path, told
// apart by its leading slash.
const iconBase = '/icons/generated/items/';
const iconExt = '.webp';
const saveEditorNames: Record<string, Record<string, string>> = {};
const saveEditorIcons: Record<string, Record<string, string>> = {};
const categories: Record<string, string> = {};
const itemCategories: Record<string, string> = {};
for (const entity of catalog.entities) {
  const numericId = entity.numeric_id;
  if (!saveEditorKinds.includes(entity.kind) || typeof numericId !== 'number') continue;
  const key = String(numericId);
  (saveEditorNames[entity.kind] ??= {})[key] = entity.name.zh_hans || entity.name.ja || entity.id;
  if (entity.kind === 'items' && typeof entity.category_id === 'string') {
    itemCategories[key] = entity.category_id;
    const categoryName = entity.category_name as { zh_hans?: string; ja?: string } | undefined;
    categories[entity.category_id] = categoryName?.zh_hans || categoryName?.ja || entity.category_id;
  }
  const icon = entity.icon_path;
  if (typeof icon !== 'string' || !icon) continue;
  (saveEditorIcons[entity.kind] ??= {})[key] = icon.startsWith(iconBase) && icon.endsWith(iconExt)
    ? icon.slice(iconBase.length, -iconExt.length)
    : icon;
}
await writeFile(
  'public/save-editor-names.json',
  JSON.stringify({ iconBase, iconExt, names: saveEditorNames, icons: saveEditorIcons, categories, itemCategories }),
);

const count = (tables: Record<string, Record<string, string>>) =>
  Object.values(tables).reduce((sum, bucket) => sum + Object.keys(bucket).length, 0);
console.log(
  `site-data entities=${catalog.entities.length} search-index=${searchRows.length}`
  + ` save-editor-names=${count(saveEditorNames)} save-editor-icons=${count(saveEditorIcons)}`,
);
