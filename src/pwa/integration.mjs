// Write dist/sw.js after the static build. The worker precaches the home and
// offline pages in each language (with the CSS and scripts they load) and the
// app icons, so an installed app always opens; everything else is cached as
// players open it. The version changes with the build output, so
// a deployment replaces the precache.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const locales = ['', 'zh-TW/', 'ja/'];
const icons = ['favicon.svg', 'app/favicon-32.png', 'app/icon-192.png', 'app/maskable-192.png'];

export default function pwa() {
  let base = '/';
  return {
    name: 'pwa-service-worker',
    hooks: {
      'astro:config:done': ({ config }) => { base = config.base.replace(/\/?$/, '/'); },
      'astro:build:done': async ({ dir }) => {
        const out = fileURLToPath(dir);
        const assets = (await readdir(join(out, '_astro'))).sort();
        const pages = locales.flatMap((locale) => [locale, `${locale}offline/`]);
        const linked = new Set();
        const html = [];
        for (const page of pages) {
          html.push(await readFile(join(out, page, 'index.html'), 'utf8'));
          for (const [, file] of html.at(-1).matchAll(/["'(]\/?(?:[^"'()]*\/)?(_astro\/[^"'()?#\s]+)/g)) linked.add(file);
        }
        const precache = [...pages, ...icons, ...[...linked].sort()].map((path) => `${base}${path}`);
        // Pages and icons keep their names when they change, so hash their contents too.
        const hash = createHash('sha256').update(assets.join('\n')).update(precache.join('\n'));
        for (const page of html) hash.update(page);
        for (const icon of icons) hash.update(await readFile(join(out, icon)));
        const version = hash.digest('hex').slice(0, 12);
        const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
        const worker = template
          .replace("'__BASE__'", JSON.stringify(base))
          .replace("'__VERSION__'", JSON.stringify(version))
          .replace('[/* __PRECACHE__ */]', JSON.stringify(precache));
        await writeFile(join(out, 'sw.js'), worker);
      },
    },
  };
}
