import { readdir, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

// Check emitted URLs, not source spelling: catches missed base paths and missing assets.
const root = 'dist';
const base = '/' + (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '');
const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('.html'));
const links = new Set();
for (const file of files) {
  const html = await readFile(join(root, file), 'utf8');
  for (const match of html.matchAll(/\b(?:href|src)=["'](\/[^"']*)["']/g)) {
    if (!match[1].startsWith('//')) links.add(match[1].split(/[?#]/)[0]);
  }
}
const errors = [];
for (const url of links) {
  if (base !== '/' && url !== base && !url.startsWith(base + '/')) {
    errors.push(`Missing base ${base}: ${url}`);
    continue;
  }
  const relative = decodeURIComponent(base === '/' ? url.slice(1) : url.slice(base.length + 1));
  const target = join(root, relative || '.', url.endsWith('/') ? 'index.html' : '');
  try { await access(target); } catch { errors.push(`Missing target: ${url}`); }
}
console.log(`Built link check: ${files.length} pages, ${links.size} unique paths, ${errors.length} errors`);
if (errors.length) {
  console.error(errors.slice(0, 40).join('\n'));
  process.exitCode = 1;
}
