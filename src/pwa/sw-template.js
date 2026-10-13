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

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ...Object.values(RUNTIME).map((cache) => cache.name)]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
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
    const cached = await caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
    if (cached) return cached;
    if (fallback) {
      const page = await caches.match(fallback);
      if (page) return page;
    }
    throw error;
  }
}

async function cacheFirst(event, store) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  event.waitUntil(put(store, event.request, response.clone()));
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, RUNTIME.pages, offlinePage(url.pathname)));
  } else if (path.startsWith('_astro/')) {
    // Content-hashed build output never changes under the same name.
    event.respondWith(cacheFirst(event, RUNTIME.assets));
  } else if (path.startsWith('app/') || path === 'favicon.svg') {
    // App icons keep their names when redrawn: check the network first.
    event.respondWith(networkFirst(event, RUNTIME.data));
  } else if (path.startsWith('maps/')) {
    event.respondWith(cacheFirst(event, RUNTIME.maps));
  } else if (/\.(?:png|webp|jpe?g|gif|svg|ico|woff2?|mp3|ogg|m4a)$/i.test(path)) {
    event.respondWith(cacheFirst(event, RUNTIME.media));
  } else if (path.startsWith('pagefind/') || /\.(?:json|webmanifest)$/i.test(path)) {
    // Data changes with each deployment: prefer the network, fall back offline.
    event.respondWith(networkFirst(event, RUNTIME.data));
  }
});
