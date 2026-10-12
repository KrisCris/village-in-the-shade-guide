import ja from './catalogs/ja.json';
import zhTW from './catalogs/zh-TW.json';
import { withBase } from '../lib/sitePath';
import { defaultLocale, htmlLang, localeDataPath, localeFromPath, localizePath, locales, stripLocale, type Locale } from './locales';
import { createTranslate, createTranslateHtml, type Messages } from './translate';

/** Build-time catalogs; pages render every locale, so all are loaded here. */
export const serverMessages: Record<Locale, Messages> = { 'zh-CN': {}, 'zh-TW': zhTW, ja };

export function translatorFor(locale: Locale) {
  return createTranslate(locale, serverMessages[locale]);
}

/** Per-page language helpers for Astro components; derive from Astro.url, never a module global. */
export function getI18n(url: URL) {
  const locale = localeFromPath(url.pathname);
  const t = translatorFor(locale);
  return {
    locale,
    lang: htmlLang[locale],
    t,
    tHtml: createTranslateHtml(locale, t),
    /** Localized, base-prefixed page link. */
    href: (path: string) => withBase(localizePath(path, locale)),
    /** Localized, base-prefixed generated data file. */
    data: (path: string) => withBase(localeDataPath(path, locale)),
    /** The same page in every language, for the language menu and hreflang. */
    alternates: () => {
      const path = stripLocale(url.pathname);
      return locales.map((target) => ({ locale: target, href: withBase(localizePath(path, target)) }));
    },
    isDefault: locale === defaultLocale,
  };
}
export type PageI18n = ReturnType<typeof getI18n>;
