import { readFile, writeFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile('data/sources/appmedia-honogurashi.json', 'utf8'));
const dataMatchers = [
  [/キャラ/, '/data/characters/'], [/作物|種・苗|花|果実/, '/data/crops/'], [/魚/, '/data/fish/'], [/機械/, '/data/machines/'],
  [/加工品/, '/data/processes/'], [/料理|調味料/, '/data/cooking-recipes/'], [/家畜|畜産品/, '/data/livestock/'], [/依頼/, '/data/quests/'], [/一覧/, '/data/items/'],
];
const mappings = catalog.sources.map((source) => {
  const data = dataMatchers.find(([pattern]) => pattern.test(source.title))?.[1];
  return { sourceId: source.sourceId, sourceUrl: source.url, status: data ? 'data-covered' : 'reviewed', targets: [`/guides/${source.sourceId}/`, ...(data ? [data] : [])] };
});
await writeFile('data/sources/coverage.json', JSON.stringify({ reviewedAt: new Date().toISOString().slice(0, 10), sourceCount: catalog.sources.length, mappedCount: mappings.length, mappings }, null, 2) + '\n');
console.log(`coverage mappings=${mappings.length}`);
