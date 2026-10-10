import { defaultLocale, isLocale, locales, type Locale } from './locales';
import type { Messages } from './translate';

/**
 * Interactive components read the client catalog (keys used by React and
 * browser modules only). Each locale is its own chunk; the browser fetches
 * only the page language before islands hydrate, so SSR text and hydrated
 * text agree. Server rendering loads every locale.
 */
// Plain Node tooling (tsx) has no import.meta.env or glob; it needs no client catalogs.
const loaders: Record<string, () => Promise<Messages>> = import.meta.env
  ? import.meta.glob<Messages>('./catalogs/client/*.json', { import: 'default' })
  : {};
const loaded: Partial<Record<Locale, Messages>> = { [defaultLocale]: {} };

async function load(locale: Locale) {
  if (!loaded[locale]) loaded[locale] = (await loaders[`./catalogs/client/${locale}.json`]?.()) ?? {};
}

if (!import.meta.env || import.meta.env.SSR || typeof document === 'undefined') {
  await Promise.all(locales.map(load));
} else {
  const lang = document.documentElement.lang;
  await load(isLocale(lang) ? lang : defaultLocale);
}

export function clientMessages(locale: Locale): Messages {
  return loaded[locale] ?? {};
}

/** Load another language on demand (e.g. after client-side navigation). */
export async function ensureClientMessages(locale: Locale) {
  await load(locale);
  return clientMessages(locale);
}
