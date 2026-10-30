/**
 * Keep the translation catalogs in step with the source.
 *
 *   tsx tools/i18n/sync-catalogs.ts          prune ja.json and en.json, regenerate zh-TW and client catalogs
 *   tsx tools/i18n/sync-catalogs.ts --check  fail on missing or stale translations and unwrapped text
 *
 * Keys come from t()/tHtml()/msg()/tr() literals in src and from the
 * authored data strings buildCatalog translates. Japanese and English are
 * written by hand in src/i18n/catalogs/ja.json and en.json, using the game's
 * own terms for each language. Traditional Chinese is converted with OpenCC
 * (Taiwan phrasing); official game names and zh-TW.vocabulary.json are
 * protected from conversion (written to zh-TW.terms.json), and whole keys can
 * be corrected in zh-TW.overrides.json.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { buildCatalog } from '../../src/data/catalog';
import { createTraditional, opencc, quotes } from '../../src/i18n/traditional';
import { extraDataKeys } from './dataKeys';
import { extractKeys, findUnwrapped, placeholders } from './sourceKeys';

const check = process.argv.includes('--check');
const catalogDir = 'src/i18n/catalogs';
const sourceExtensions = /\.(astro|ts|tsx|mjs)$/;
/** Modules that only run while rendering pages; their keys stay out of the browser catalogs. */
const serverOnly = [/\.astro$/, /^src\/data\/(catalog|guideContent|navigation)\.ts$/];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path.split(sep).includes('i18n') && dir === 'src' ? [] : sourceFiles(path);
    return sourceExtensions.test(entry.name) && !/\.test\.|test-helpers/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

const readJson = async (path: string): Promise<Record<string, string>> => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return {};
  }
};

const sorted = (entries: Array<[string, string]>) => Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const files = (await sourceFiles('src')).map((path) => relative('.', path).split(sep).join('/')).sort();
const codeKeys = new Map<string, Set<string>>();
const clientKeys = new Set<string>();
const unwrapped: string[] = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const client = !serverOnly.some((pattern) => pattern.test(file));
  for (const key of extractKeys(source)) {
    if (!codeKeys.has(key)) codeKeys.set(key, new Set());
    codeKeys.get(key)!.add(file);
    if (client) clientKeys.add(key);
  }
  for (const { line, text } of findUnwrapped(source)) unwrapped.push(`${file}:${line}  ${text.slice(0, 120)}`);
}

// Data strings: record what buildCatalog asks to translate.
const entities = 'data/generated/build-25640656/entities';
const input: Record<string, unknown> = {};
const officialTerms: Array<[string, string]> = [];
for (const file of (await readdir(entities)).filter((name) => name.endsWith('.json')).sort()) {
  const data = JSON.parse(await readFile(join(entities, file), 'utf8'));
  input[`/entities/${file}`] = data;
  for (const entity of (Array.isArray(data) ? data : data.entities ?? []) as Array<{ name?: { zh_hans?: string; zh_hant?: string; translations?: Record<string, string> } }>) {
    const simplified = entity.name?.translations?.['zh-CN'] ?? entity.name?.zh_hans;
    const traditional = entity.name?.translations?.['zh-TW'] ?? entity.name?.zh_hant;
    // Whole names only; prefixed composites (交付候选：…) and control tags are skipped. // i18n-ignore
    if (!simplified || !traditional || simplified.length < 2 || /[<：]/.test(simplified)) continue; // i18n-ignore
    if (quotes(opencc(simplified)) !== traditional) officialTerms.push([simplified, traditional]);
  }
}
const dataKeys = new Set<string>();
// Each language falls back to the catalog for names the game leaves blank in
// that language only (zh-TW item categories, English fishing spots), so record
// which language asked for each.
const localeDataKeys = { ja: new Set<string>(), 'zh-TW': new Set<string>(), en: new Set<string>() };
for (const locale of ['ja', 'zh-TW', 'en'] as const) buildCatalog(input, '', locale, (source) => {
  dataKeys.add(source);
  localeDataKeys[locale].add(source);
  return source;
});
for (const key of extraDataKeys()) {
  dataKeys.add(key);
  clientKeys.add(key);
  for (const keys of Object.values(localeDataKeys)) keys.add(key);
}

const allKeys = [...new Set([...codeKeys.keys(), ...dataKeys])].filter((key) => key.trim());
const ja = await readJson(join(catalogDir, 'ja.json'));
const en = await readJson(join(catalogDir, 'en.json'));
const overrides = await readJson(join(catalogDir, 'zh-TW.overrides.json'));
const vocabulary = await readJson(join(catalogDir, 'zh-TW.vocabulary.json'));
const terms = sorted([...officialTerms, ...Object.entries(vocabulary)].filter(([source], i, all) => all.findLastIndex(([other]) => other === source) === i));
const toTaiwan = createTraditional(terms);

const problems: string[] = [];
/** Keys a hand-written catalog must cover: every code key and the data labels its own pages translate. */
const needed = (locale: 'ja' | 'en') => allKeys.filter((key) => codeKeys.has(key) || localeDataKeys[locale].has(key));
const missing = needed('ja').filter((key) => !(key in ja));
const missingEn = needed('en').filter((key) => !(key in en));
for (const key of missing) problems.push(`missing ja: ${JSON.stringify(key)}  (${[...(codeKeys.get(key) ?? ['data'])].join(', ')})`);
for (const key of missingEn) problems.push(`missing en: ${JSON.stringify(key)}  (${[...(codeKeys.get(key) ?? ['data'])].join(', ')})`);
for (const key of allKeys) {
  for (const [name, value] of [['ja', ja[key]], ['en', en[key]], ['zh-TW override', overrides[key]]] as const) {
    if (value !== undefined && placeholders(value) !== placeholders(key)) problems.push(`${name} placeholders differ: ${JSON.stringify(key)} → ${JSON.stringify(value)}`);
  }
}
for (const key of Object.keys(overrides)) if (!allKeys.includes(key)) problems.push(`unused zh-TW override: ${JSON.stringify(key)}`);
for (const line of unwrapped) problems.push(`unwrapped text: ${line}`);

const jaOut = sorted(allKeys.filter((key) => key in ja).map((key) => [key, ja[key]]));
const enOut = sorted(allKeys.filter((key) => key in en).map((key) => [key, en[key]]));
const zhTW = sorted(allKeys.map((key) => [key, overrides[key] ?? toTaiwan(key)]));
const pick = (messages: Record<string, string>) => sorted(Object.entries(messages).filter(([key]) => clientKeys.has(key)));
const outputs: Record<string, unknown> = {
  'zh-TW.terms.json': terms,
  'ja.json': jaOut,
  'en.json': enOut,
  'zh-TW.json': zhTW,
  'client/ja.json': pick(jaOut),
  'client/en.json': pick(enOut),
  'client/zh-TW.json': pick(zhTW),
};

let stale = 0;
for (const [name, value] of Object.entries(outputs)) {
  const path = join(catalogDir, name);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  let current = '';
  try {
    current = await readFile(path, 'utf8');
  } catch {}
  if (current.replace(/\r\n/g, '\n') === text) continue;
  stale += 1;
  if (check) problems.push(`stale catalog: ${path} (run npm run i18n:sync)`);
  else await writeFile(path, text);
}

console.log(`i18n keys=${allKeys.length} code=${codeKeys.size} data=${dataKeys.size} client=${clientKeys.size} ja=${Object.keys(jaOut).length} en=${Object.keys(enOut).length} missing=${missing.length} missingEn=${missingEn.length} unwrapped=${unwrapped.length}${check ? '' : ` updated=${stale}`}`);
if (problems.length) {
  console.error(problems.slice(0, Number(process.env.I18N_LIMIT ?? 200)).join('\n'));
  if (problems.length > Number(process.env.I18N_LIMIT ?? 200)) console.error(`… ${problems.length - Number(process.env.I18N_LIMIT ?? 200)} more`);
  if (check) process.exit(1);
}
