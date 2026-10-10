import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { withBase } from '../lib/sitePath';
import { clientMessages } from './clientMessages';
import { setActiveI18n } from './active';
import { defaultLocale, htmlLang, localeDataPath, localizePath, type Locale } from './locales';
import { createTranslate, type Translate } from './translate';

export type I18n = {
  locale: Locale;
  lang: string;
  t: Translate;
  /** Localized, base-prefixed page link. */
  href: (path: string) => string;
  /** Localized, base-prefixed generated data file. */
  data: (path: string) => string;
};

export function createI18n(locale: Locale): I18n {
  return {
    locale,
    lang: htmlLang[locale],
    t: createTranslate(locale, clientMessages(locale)),
    href: (path) => withBase(localizePath(path, locale)),
    data: (path) => withBase(localeDataPath(path, locale)),
  };
}

const Context = createContext<I18n>(createI18n(defaultLocale));

/**
 * Wrap each island root. Astro passes `locale` as a prop so server rendering
 * and hydration use the same language; it is never inferred from a global.
 */
export function I18nProvider({ locale = defaultLocale, children }: { locale?: Locale; children: ReactNode }) {
  const value = useMemo(() => createI18n(locale), [locale]);
  // Browser-only modules (save editor, planner engine) read the page language.
  if (!import.meta.env.SSR) setActiveI18n(value);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
