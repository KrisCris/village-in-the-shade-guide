/**
 * Saves the whole wiki for offline use: every page in one language plus the
 * files all languages share (icons, art, maps, scripts). The build lists the
 * files with content hashes (src/pwa/offlineFiles.mjs). A run fetches only
 * files that are missing or changed, so it resumes after an interruption and
 * stays small after a deployment. The service worker serves these caches when
 * the network is gone.
 */
import { localeFromPath, type Locale } from '../i18n/locales';

export type OfflineEntry = [path: string, bytes: number, hash: string];
export type OfflineStatus = 'idle' | 'checking' | 'running' | 'paused' | 'done' | 'no-space' | 'unsupported';
export interface OfflineProgress {
  status: OfflineStatus;
  done: number;
  total: number;
  locale: Locale;
}

const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
/** The service worker leaves requests with this header alone. */
const HEADER = 'x-offline-download';
const CACHE_PREFIX = 'offline-';
/** Per cache: path → hash of every stored file. Never a real site URL. */
const INDEX_KEY = `${base}__offline-index__`;
const CONCURRENCY = 6;
const SAVE_EVERY = 200;

let progress: OfflineProgress = { status: 'idle', done: 0, total: 0, locale: 'zh-CN' };
let controller: AbortController | null = null;
let run: Promise<void> | null = null;
let lastEmit = 0;

function emit(next: Partial<OfflineProgress>, throttle = false) {
  progress = { ...progress, ...next };
  const now = performance.now();
  if (throttle && now - lastEmit < 150) return;
  lastEmit = now;
  window.dispatchEvent(new CustomEvent<OfflineProgress>('offline-progress', { detail: progress }));
}

export function offlineProgress() {
  return progress;
}

export function supportsOffline() {
  return import.meta.env.PROD && typeof caches !== 'undefined' && 'serviceWorker' in navigator;
}

export function currentLocale(): Locale {
  return localeFromPath(location.pathname);
}

/** Files whose stored copy is missing or older than the build's. */
export function pendingEntries(entries: OfflineEntry[], stored: Record<string, string>) {
  return entries.filter(([path, , hash]) => stored[path] !== hash);
}

/** Bytes already stored and current. */
export function storedBytes(entries: OfflineEntry[], stored: Record<string, string>) {
  return entries.reduce((sum, [path, bytes, hash]) => (stored[path] === hash ? sum + bytes : sum), 0);
}

/** Stored files the build no longer has. */
export function staleEntries(entries: OfflineEntry[], stored: Record<string, string>) {
  const current = new Set(entries.map(([path]) => path));
  return Object.keys(stored).filter((path) => !current.has(path));
}

export function totalBytes(entries: OfflineEntry[]) {
  return entries.reduce((sum, [, bytes]) => sum + bytes, 0);
}

interface OfflineSet {
  cache: Cache;
  entries: OfflineEntry[];
  index: Record<string, string>;
}

/** The build's file list, or the copy kept from the last run when offline. */
async function readList(cache: Cache, group: string): Promise<OfflineEntry[]> {
  const url = `${base}app/offline-${group}.json`;
  try {
    const response = await fetch(url, { headers: { [HEADER]: '1' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    await cache.put(url, response.clone());
    return await response.json();
  } catch (error) {
    const kept = await cache.match(url);
    if (!kept) throw error;
    return kept.json();
  }
}

async function readIndex(cache: Cache): Promise<Record<string, string>> {
  const response = await cache.match(INDEX_KEY);
  return response ? response.json() : {};
}

function writeIndex(cache: Cache, index: Record<string, string>) {
  return cache.put(INDEX_KEY, new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } }));
}

function openSets(locale: Locale): Promise<OfflineSet[]> {
  return Promise.all(['shared', locale].map(async (group) => {
    const cache = await caches.open(`${CACHE_PREFIX}${group}`);
    const [entries, index] = await Promise.all([readList(cache, group), readIndex(cache)]);
    return { cache, entries, index };
  }));
}

function measure(sets: OfflineSet[]) {
  return {
    done: sets.reduce((sum, set) => sum + storedBytes(set.entries, set.index), 0),
    total: sets.reduce((sum, set) => sum + totalBytes(set.entries), 0),
  };
}

/** Read how much of the wiki in this language is stored, without downloading. */
export async function checkOffline(locale = currentLocale()): Promise<OfflineProgress> {
  if (!supportsOffline()) {
    emit({ status: 'unsupported', locale });
    return progress;
  }
  if (progress.status === 'running' && progress.locale === locale) return progress;
  emit({ status: 'checking', locale });
  try {
    const { done, total } = measure(await openSets(locale));
    emit({ status: done >= total ? 'done' : done > 0 ? 'paused' : 'idle', done, total });
  } catch {
    emit({ status: 'idle', done: 0, total: 0 });
  }
  return progress;
}

async function download(locale: Locale) {
  controller = new AbortController();
  const { signal } = controller;
  emit({ status: 'running', locale });
  try {
    void navigator.storage?.persist?.();
    const sets = await openSets(locale);
    let { done, total } = measure(sets);
    emit({ done, total });
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < total - done) {
      emit({ status: 'no-space' });
      return;
    }
    for (const set of sets) {
      for (const path of staleEntries(set.entries, set.index)) {
        await set.cache.delete(`${base}${path}`);
        delete set.index[path];
      }
      const queue = pendingEntries(set.entries, set.index);
      let unsaved = 0;
      const worker = async () => {
        while (queue.length && !signal.aborted) {
          const [path, bytes, hash] = queue.shift()!;
          try {
            const response = await fetch(`${base}${path}`, { headers: { [HEADER]: '1' }, cache: 'no-cache', signal });
            // A file removed by a deployment during the run is skipped, not retried.
            if (response.ok) await set.cache.put(`${base}${path}`, response);
          } catch (error) {
            controller?.abort();
            throw error;
          }
          set.index[path] = hash;
          done += bytes;
          if (++unsaved >= SAVE_EVERY) {
            unsaved = 0;
            await writeIndex(set.cache, set.index);
          }
          emit({ done }, true);
        }
      };
      try {
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      } finally {
        await writeIndex(set.cache, set.index);
      }
    }
    emit({ status: 'done', done, total });
  } catch {
    // Offline, paused, or the list could not be read: keep what is stored.
    emit({ status: 'paused' });
  } finally {
    controller = null;
  }
}

/** Download everything not yet stored. Only one run at a time across tabs. */
export async function startOffline(locale = currentLocale()) {
  if (!supportsOffline() || progress.status === 'running') return;
  run = navigator.locks
    ? navigator.locks.request('offline-download', { ifAvailable: true }, async (lock) => {
      if (lock) await download(locale);
    })
    : download(locale);
  try {
    await run;
  } finally {
    run = null;
  }
}

export function pauseOffline() {
  controller?.abort();
}

/** Delete every stored copy; pages opened later are cached as usual. */
export async function removeOffline() {
  controller?.abort();
  await run?.catch(() => {});
  for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
  emit({ status: 'idle', done: 0 });
}

/** The installed app keeps itself complete, except on mobile data or data saver. */
export function shouldDownloadAutomatically() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
  return !connection?.saveData && connection?.type !== 'cellular';
}
