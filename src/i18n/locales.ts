/** Website display languages. Game data keeps every native slot regardless. */
export const locales = ['zh-CN', 'zh-TW', 'ja', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh-CN';

/** Language names shown in the language menu, each in its own language. */
export const localeNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  en: 'English',
};

/** The default language keeps the original unprefixed URLs. */
const prefixes: Record<Locale, string> = { 'zh-CN': '', 'zh-TW': '/zh-TW', ja: '/ja', en: '/en' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

function basePrefix(base: string) {
  const trimmed = (base || '/').replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

/** Split a site path into pathname and its query/hash suffix. */
function splitSuffix(path: string): [string, string] {
  const index = path.search(/[?#]/);
  return index < 0 ? [path, ''] : [path.slice(0, index), path.slice(index)];
}

/** Remove the deployment base and any locale prefix; always returns a path starting with '/'. */
export function stripLocale(pathname: string, base = import.meta.env.BASE_URL): string {
  const prefix = basePrefix(base);
  let path = pathname;
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) path = path.slice(prefix.length) || '/';
  for (const locale of locales) {
    const localePrefix = prefixes[locale];
    if (localePrefix && (path === localePrefix || path.startsWith(`${localePrefix}/`))) return path.slice(localePrefix.length) || '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

/** Read the page language from a URL pathname, with or without the deployment base. */
export function localeFromPath(pathname: string, base = import.meta.env.BASE_URL): Locale {
  const prefix = basePrefix(base);
  const path = prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`)) ? pathname.slice(prefix.length) : pathname;
  return locales.find((locale) => prefixes[locale] && (path === prefixes[locale] || path.startsWith(`${prefixes[locale]}/`))) ?? defaultLocale;
}

/**
 * Point a site page or page-data URL at a language. Accepts paths with or
 * without an existing locale prefix and keeps query and hash. Shared assets
 * (icons, maps, art) must not go through this; external URLs pass unchanged.
 * The deployment base is added separately by withBase.
 */
export function localizePath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const [pathname, suffix] = splitSuffix(path);
  const bare = stripLocale(pathname, '/');
  const prefix = prefixes[locale];
  return `${prefix && bare === '/' ? `${prefix}/` : `${prefix}${bare}`}${suffix}`;
}

/** Locale-specific copies of generated public data (search index, payloads). */
export function localeDataPath(path: string, locale: Locale): string {
  return locale === defaultLocale ? path : `/locales/${locale}${path}`;
}

/** BCP 47 tags for <html lang>, hreflang and Intl. */
export const htmlLang: Record<Locale, string> = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', ja: 'ja', en: 'en' };
