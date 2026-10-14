/* Service worker. src/pwa/integration.mjs fills in the placeholders at build time. */
const BASE = '__BASE__';
const VERSION = '__VERSION__';
const PRECACHE = [/* __PRECACHE__ */];

const SHELL = `shell-${VERSION}`;
// Runtime caches outlive deployments; each keeps its newest entries only.
const RUNTIME = {
  pages: { name: 'pages-v1', limit: 80 },
  assets: { name: 'assets-v1', limit: 400 },
  data: { name: 'data-v1', limit: 150 },
  media: { name: 'media-v1', limit: 800 },
  maps: { name: 'maps-v1', limit: 30 },
};
const LOCALES = ['zh-TW', 'ja'];
// The offline download (src/lib/offlineStore.ts) stores the whole wiki in
// caches named offline-*, marks its requests with this header and keeps those
// caches up to date itself.
const OFFLINE_PREFIX = 'offline-';
const OFFLINE_HEADER = 'x-offline-download';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ...Object.values(RUNTIME).map((cache) => cache.name)]);
    for (const key of await caches.keys()) if (!keep.has(key) && !key.startsWith(OFFLINE_PREFIX)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function trim(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(request);
}

async function put({ name, limit }, request, response) {
  if (!response.ok || response.type === 'opaque') return;
  const cache = await caches.open(name);
  await cache.put(request, response);
  await trim(name, limit);
}

function offlinePage(pathname) {
  const local = pathname.slice(BASE.length);
  const locale = LOCALES.find((prefix) => local === prefix || local.startsWith(`${prefix}/`));
  return `${BASE}${locale ? `${locale}/` : ''}offline/`;
}

async function networkFirst(event, store, fallback) {
  try {
    const response = await fetch(event.request);
    event.waitUntil(put(store, event.request, response.clone()));
    return response;
  } catch (error) {
    // Prefer this cache's copy: it is newer than the precached one. Queries
    // are cache-busting stamps (Pagefind adds ?ts=), so stored copies match.
    const options = { ignoreSearch: true, ignoreVary: true };
    const cached = await (await caches.open(store.name)).match(event.request, options) ?? await caches.match(event.request, options);
    if (cached) return cached;
    if (fallback) {
      const page = await caches.match(fallback, { ignoreVary: true });
      if (page) return page;
    }
    throw error;
  }
}

async function cacheFirst(event, store) {
  const cached = await caches.match(event.request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(event.request);
  event.waitUntil(put(store, event.request, response.clone()));
  return response;
}

/** Pick the cache and strategy for a same-origin request, or null to leave it to the browser. */
function route(url, mode) {
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return null;
  const path = url.pathname.slice(BASE.length);
  // Pages: full loads, and the HTML Astro's view transitions fetch between pages.
  if (mode === 'navigate' || path === '' || path.endsWith('/') || path.endsWith('.html')) {
    return { store: RUNTIME.pages, strategy: 'network', fallback: offlinePage(url.pathname) };
  }
  // Content-hashed build output never changes under the same name.
  if (path.startsWith('_astro/')) return { store: RUNTIME.assets, strategy: 'cache' };
  // App icons keep their names when redrawn: check the network first.
  if (path.startsWith('app/') || path === 'favicon.svg') return { store: RUNTIME.data, strategy: 'network' };
  if (path.startsWith('maps/')) return { store: RUNTIME.maps, strategy: 'cache' };
  if (/\.(?:png|webp|jpe?g|gif|svg|ico|woff2?|mp3|ogg|m4a)$/i.test(path)) return { store: RUNTIME.media, strategy: 'cache' };
  // Data changes with each deployment: prefer the network, fall back offline.
  if (path.startsWith('pagefind/') || /\.(?:json|webmanifest)$/i.test(path)) return { store: RUNTIME.data, strategy: 'network' };
  return null;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range') || request.headers.has(OFFLINE_HEADER)) return;
  const target = route(new URL(request.url), request.mode);
  if (!target) return;
  event.respondWith(target.strategy === 'cache'
    ? cacheFirst(event, target.store)
    : networkFirst(event, target.store, target.fallback));
});

// The first page a player opens loads before the worker controls it, so the
// page sends its own URL and resources here to be stored as well.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls' || !Array.isArray(event.data.urls)) return;
  event.waitUntil(Promise.all(event.data.urls.map(async (href) => {
    const url = new URL(href, self.location.origin);
    const target = route(url, url.pathname.endsWith('/') ? 'navigate' : 'no-cors');
    if (!target || await caches.match(url.href)) return;
    try {
      await put(target.store, url.href, await fetch(url.href));
    } catch {
      // Offline or gone: nothing to store.
    }
  })));
});
