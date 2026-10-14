// Lists every built file a player needs to use the wiki offline, split into
// files every language shares and files for one language, so a download only
// fetches the pages in the language being read. Each entry carries a content
// hash; after a deployment only changed files are fetched again.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const offlineGroups = ['shared', 'zh-CN', 'zh-TW', 'ja'];
const pagefindLanguages = { 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', ja: 'ja' };

/** Which offline set a built file belongs to, or null when it is never stored. */
export function offlineGroup(file) {
  if (file === 'sw.js' || file === 'robots.txt' || file.endsWith('.webmanifest') || file.startsWith('app/offline-')) return null;
  const [top, second] = file.split('/');
  if (top === 'zh-TW' || top === 'ja') return top;
  if (top === 'locales') return second === 'zh-TW' || second === 'ja' ? second : null;
  if (top === 'pagefind') {
    const language = /^pagefind\/(?:index|fragment|filter)\/([a-z-]+)_/.exec(file)?.[1];
    return language ? pagefindLanguages[language] ?? null : 'shared';
  }
  if (file.endsWith('.html') || top === 'list-data' || /^[^/]+\.json$/.test(file)) return 'zh-CN';
  return 'shared';
}

/** The URL path a file is requested by: pages are fetched as their folder. */
export function offlinePath(file) {
  if (file === 'index.html') return '';
  return file.endsWith('/index.html') ? file.slice(0, -'index.html'.length) : file;
}

async function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(dir, file));
    else files.push(file);
  }
  return files;
}

/** Write dist/app/offline-<group>.json: [[path, bytes, hash], ...] per group. */
export async function writeOfflineManifests(out) {
  const groups = Object.fromEntries(offlineGroups.map((group) => [group, []]));
  const files = (await listFiles(out)).sort();
  for (let i = 0; i < files.length; i += 64) {
    await Promise.all(files.slice(i, i + 64).map(async (file) => {
      const group = offlineGroup(file);
      if (!group) return;
      const body = await readFile(join(out, file));
      groups[group].push([offlinePath(file), body.length, createHash('sha1').update(body).digest('hex').slice(0, 12)]);
    }));
  }
  await mkdir(join(out, 'app'), { recursive: true });
  for (const [group, entries] of Object.entries(groups)) {
    entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    await writeFile(join(out, 'app', `offline-${group}.json`), JSON.stringify(entries));
  }
  return Object.fromEntries(Object.entries(groups).map(([group, entries]) => [group, entries.length]));
}
