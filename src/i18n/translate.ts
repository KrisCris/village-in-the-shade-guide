import { defaultLocale, localizePath, type Locale } from './locales';
import { withBase } from '../lib/sitePath';

/**
 * Authored text is keyed by its Simplified Chinese source, with `{name}`
 * placeholders. tools/i18n/sync-catalogs.ts extracts every t()/tHtml()/msg()
 * literal; a key missing from a catalog fails the coverage check.
 */
export type Messages = Record<string, string>;
/** Values are formatted with String(), like a template literal. */
export type Params = Record<string, unknown>;
export type Translate = (source: string, params?: Params) => string;

/** Mark a source string for extraction where it is stored before display. */
export const msg = (source: string) => source;

export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Point site-relative links inside translated HTML at the page language. */
export function localizeLinks(html: string, locale: Locale): string {
  return html.replace(/href="(\/[^"]*)"/g, (_, href: string) => `href="${withBase(localizePath(href, locale))}"`);
}

export function createTranslate(locale: Locale, messages: Messages): Translate {
  return (source, params) => format(locale === defaultLocale ? source : messages[source] ?? source, params);
}

/** Translate an HTML snippet; parameters are escaped and internal links localized. */
export function createTranslateHtml(locale: Locale, translate: Translate) {
  return (source: string, params?: Params) =>
    localizeLinks(
      translate(source, params && Object.fromEntries(Object.entries(params).map(([key, value]) => [key, escapeHtml(String(value))]))),
      locale,
    );
}

/**
 * Split a translated template around `{name}` placeholders so components can
 * place elements (links, <code>) inside a sentence. Pass the template from
 * t(key) without params.
 */
export function interpolate<T>(template: string, values: Record<string, T>): Array<string | T> {
  return template.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    return key && key in values ? values[key] : part;
  });
}
