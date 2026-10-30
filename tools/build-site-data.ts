import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCatalog } from '../src/data/catalog';
import {plannerPayload} from '../src/data/plannerPayload';
import {workflowPayload} from '../src/data/workflowPayload';
import { dailyPayload } from '../src/data/dailyPayload';
import { defaultLocale, locales } from '../src/i18n/locales';

const source = 'data/generated/build-25640656/entities';
const input: Record<string, unknown> = {};
for (const file of (await readdir(source)).filter((name) => name.endsWith('.json')).sort()) {
  input[`/entities/${file}`] = JSON.parse(await readFile(join(source, file), 'utf8'));
}

// Each language gets its own payloads; pages fetch only their language's files.
for (const locale of locales) {
  const dir = locale === defaultLocale ? 'public' : join('public', 'locales', locale);
  const catalog = buildCatalog(input, undefined, locale);
  const { byId, ...publicCatalog } = catalog;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'game-data.json'), JSON.stringify(publicCatalog));
  await writeFile(join(dir, 'planner-data.json'),JSON.stringify(plannerPayload(catalog)));
  await writeFile(join(dir, 'workflow-data.json'),JSON.stringify(workflowPayload(catalog)));
  await writeFile(join(dir, 'daily-data.json'), JSON.stringify(dailyPayload(catalog)));
  const searchRows = catalog.entities.map((entity) => {
    const { name } = entity;
    const baseNames = new Set([entity.id, name.zh_hans, name.zh_hant, name.ja, name.internal]);
    const extraAliases = name.aliases.filter((alias) => alias && !baseNames.has(alias));
    return [entity.id, entity.kind, name.zh_hans, name.zh_hant || '', name.ja || '', extraAliases];
  });
  await writeFile(join(dir, 'search-index.json'), JSON.stringify({ buildId: catalog.buildId, rows: searchRows }));

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
  // Items with ITEM_FEATURE_NOT_PUBLISH_ENCYCLOPEDIA (itemfeature.dat id 8): the
  // game may still record them, but its encyclopedia never lists them.
  const encyclopediaHidden: string[] = [];
  for (const entity of catalog.entities) {
    const numericId = entity.numeric_id;
    if (!saveEditorKinds.includes(entity.kind) || typeof numericId !== 'number') continue;
    const key = String(numericId);
    (saveEditorNames[entity.kind] ??= {})[key] = entity.name.zh_hans || entity.name.ja || entity.id;
    if (entity.kind === 'items' && typeof entity.category_id === 'string') {
      itemCategories[key] = entity.category_id;
      if (Array.isArray(entity.feature_ids) && entity.feature_ids.includes(8)) encyclopediaHidden.push(key);
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
    join(dir, 'save-editor-names.json'),
    JSON.stringify({ iconBase, iconExt, names: saveEditorNames, icons: saveEditorIcons, categories, itemCategories, encyclopediaHidden }),
  );

  const count = (tables: Record<string, Record<string, string>>) =>
    Object.values(tables).reduce((sum, bucket) => sum + Object.keys(bucket).length, 0);
  console.log(
    `site-data ${locale} entities=${catalog.entities.length} search-index=${searchRows.length}`
    + ` save-editor-names=${count(saveEditorNames)} save-editor-icons=${count(saveEditorIcons)}`,
  );
}
