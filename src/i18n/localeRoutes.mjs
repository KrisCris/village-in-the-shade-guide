// Mirror every page and endpoint under each non-default locale prefix.
// The same entrypoint renders all languages; pages read the locale from
// Astro.url, so getStaticPaths params and props are shared unchanged.
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const prefixes = ['zh-TW', 'ja', 'en'];
const pageExtensions = /\.(astro|ts|js)$/;

function pageFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return pageExtensions.test(entry.name) && !entry.name.startsWith('_') && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

export function routePattern(file) {
  const route = file.split(sep).join('/').replace(pageExtensions, '').replace(/(^|\/)index$/, '');
  return route ? `/${route}` : '';
}

export default function localeRoutes() {
  return {
    name: 'locale-routes',
    hooks: {
      'astro:config:setup': ({ config, injectRoute }) => {
        const pages = fileURLToPath(new URL('./src/pages/', config.root));
        for (const file of pageFiles(pages)) {
          const local = relative(pages, file);
          for (const prefix of prefixes) {
            injectRoute({
              pattern: `/${prefix}${routePattern(local)}`,
              entrypoint: `./src/pages/${local.split(sep).join('/')}`,
              prerender: true,
            });
          }
        }
      },
    },
  };
}
