import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Converter } from 'opencc-js';

const toSimplified = Converter({ from: 'tw', to: 'cn' });

const source = 'data/generated/build-24969282/entities';
const entities = [];
const counts = {};
for (const file of (await readdir(source)).filter((name) => name.endsWith('.json')).sort()) {
  const kind = basename(file, '.json');
  const rows = JSON.parse(await readFile(join(source, file), 'utf8'));
  counts[kind] = rows.length;
  for (const row of rows) {
    const simplified = row.name ? toSimplified(row.name.zh_hant || row.name.zh_hans) : '';
    const name = row.name ? { ...row.name, zh_hans: simplified, aliases: [...new Set([simplified, ...row.name.aliases])] } : undefined;
    entities.push({ ...row, ...(name ? { name } : {}), kind });
  }
}
const byId = {};
for (const entity of entities) if (entity.name) byId[entity.id] ??= entity;
for (const entity of entities) {
  if (!entity.name && (entity.kind === 'store-offers' || entity.kind === 'hunt-rewards')) {
    const target = byId[entity.item_id || entity.certificate_item_id];
    if (target?.name) {
      const prefix = entity.kind === 'store-offers' ? '商店出售' : '狩猎报酬';
      entity.name = { ...target.name, zh_hans: `${prefix}：${target.name.zh_hans}`, internal: entity.id, aliases: [...target.name.aliases, entity.id] };
    }
  }
}
await mkdir('public', { recursive: true });
await writeFile('public/game-data.json', JSON.stringify({ buildId: '24969282', counts, entities }));
const searchRows = entities.filter((entity) => entity.name).map((entity) => {
  const { name } = entity;
  const baseNames = new Set([entity.id, name.zh_hans, name.zh_hant, name.ja, name.internal]);
  const extraAliases = name.aliases.filter((alias) => alias && !baseNames.has(alias));
  return [entity.id, entity.kind, name.zh_hans, name.zh_hant || '', name.ja || '', extraAliases];
});
await writeFile('public/search-index.json', JSON.stringify({ buildId: '24969282', rows: searchRows }));
console.log(`site-data entities=${entities.length} search-index=${searchRows.length}`);
