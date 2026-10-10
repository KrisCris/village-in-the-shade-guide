import { clientMessages } from './clientMessages';
import { withBase } from '../lib/sitePath';
import { defaultLocale, htmlLang, isLocale, localeDataPath, localizePath, type Locale } from './locales';
import { createTranslate, format, type Params } from './translate';

/**
 * The page language for browser-only modules (save parsing, planner engine)
 * that produce display text outside React render, including module-level
 * labels. In the browser it starts from <html lang> (the client catalog is
 * loaded before any importer runs) and islands confirm it while hydrating.
 * Server rendering stays on the default language, so components rendered on
 * the server must take an explicit translator instead.
 */
function initial(): { locale: Locale; t: (source: string, params?: Params) => string } {
  const lang = typeof document === 'undefined' || !import.meta.env || import.meta.env.SSR ? '' : document.documentElement.lang;
  const locale = isLocale(lang) ? lang : defaultLocale;
  return { locale, t: locale === defaultLocale ? format : createTranslate(locale, clientMessages(locale)) };
}

let active = initial();

export function setActiveI18n(value: typeof active) {
  active = value;
}

export const activeLocale = () => active.locale;

/** Translate with the page language; keys are extracted like t(). */
export const tr = (source: string, params?: Params) => active.t(source, params);

/** BCP 47 tag of the page language, for Intl collation and number formats. */
export const activeLang = () => htmlLang[active.locale];

/** Localized, base-prefixed page link for browser-only modules. */
export const pageHref = (path: string) => withBase(localizePath(path, active.locale));

/** Localized, base-prefixed generated data file for browser-only modules. */
export const dataHref = (path: string) => withBase(localeDataPath(path, active.locale));
