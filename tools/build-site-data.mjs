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
    const name = row.name ? { ...row.name, zh_hans: toSimplified(row.name.zh_hant || row.name.zh_hans) } : undefined;
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
console.log(`site-data entities=${entities.length}`);
