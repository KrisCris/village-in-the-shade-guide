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
console.log(`site-data entities=${catalog.entities.length} search-index=${searchRows.length}`);
