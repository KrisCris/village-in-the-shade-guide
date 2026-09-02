import { readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const catalog = JSON.parse(await readFile('data/sources/appmedia-honogurashi.json', 'utf8'));
const outlines = [];
const clean = (text) => text.replace(/\s+/g, ' ').trim();
for (const [index, source] of catalog.sources.entries()) {
  if (source.sourceId === 'home') continue;
  const response = await fetch(source.url, { headers: { 'user-agent': 'VillageInTheShadeGuide/1.0 (personal reference catalog)' } });
  if (!response.ok) { outlines.push({ sourceId: source.sourceId, error: response.status }); continue; }
  const $ = load(await response.text());
  const headings = [];
  $('main h2, main h3, main h4, article h2, article h3, article h4, .entry-content h2, .entry-content h3, .entry-content h4').each((_, node) => {
    const text = clean($(node).text()).replace(/〖ほの暮しの庭〗/g, '');
    if (text && !headings.includes(text) && text.length < 100) headings.push(text);
  });
  outlines.push({ sourceId: source.sourceId, title: source.title, url: source.url, headings: headings.slice(0, 40) });
  if ((index + 1) % 20 === 0) console.log(`fetched ${index + 1}/${catalog.sources.length}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await writeFile('data/sources/appmedia-outlines.json', JSON.stringify({ catalogedAt: new Date().toISOString(), count: outlines.length, outlines }, null, 2) + '\n');
console.log(`outlined sources=${outlines.length}`);
