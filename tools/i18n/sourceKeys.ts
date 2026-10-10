/**
 * Static analysis for authored text. Keys are the Simplified Chinese source
 * strings passed as literals to t(), tHtml(), msg() or tr(); anything else
 * containing Chinese or Japanese in code is reported as unwrapped text.
 */

/** Han ideographs and kana; CJK punctuation alone (separators, ×, 　) is not prose. */
export const cjk = /[぀-ヿ㐀-䶿一-鿿]/;

const literal = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\x60(?:[^\x60\\$]|\\.|\$(?!\{))*\x60`;
const call = new RegExp(String.raw`(?<![\w$.])(?:t|tHtml|msg|tr)\(\s*(${literal})`, 'g');

/** Evaluate a JS string literal from our own sources. */
function unquote(source: string): string {
  const quote = source[0];
  const body = source.slice(1, -1);
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, escape: string) => {
    if (escape.startsWith('u{')) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16));
    if (escape[0] === 'u' && escape.length === 5) return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (escape[0] === 'x' && escape.length === 3) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r', '0': '\0' } as Record<string, string>)[escape] ?? (escape === quote ? quote : escape);
  });
}

/** Every translation key used as a literal argument. */
export function extractKeys(source: string): string[] {
  return [...stripComments(source).matchAll(call)].map((match) => unquote(match[1]));
}

/**
 * Blank out comments (JS line/block and HTML) while keeping strings and line
 * numbers. Template text in .astro files is treated as code; a lone
 * apostrophe there is rare in this codebase and only affects the lint.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const rest = source.slice(i, i + 4);
    if (rest.startsWith('<!--')) {
      const end = source.indexOf('-->', i + 4);
      const stop = end < 0 ? source.length : end + 3;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (rest.startsWith('//') && source[i - 1] !== ':') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (source[i] === "'" || source[i] === '"' || source[i] === '`') {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length && source[j] !== quote && !(quote !== '`' && source[j] === '\n')) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

export type Unwrapped = { line: number; text: string };

/**
 * Lines still containing Chinese or Japanese after comments and translated
 * literals are removed. Mark intentional game-text matching with
 * `i18n-ignore` (same line), `i18n-ignore-next-line`, an
 * `i18n-ignore-start` / `i18n-ignore-end` block, or `i18n-ignore-file`.
 */
export function findUnwrapped(source: string): Unwrapped[] {
  if (source.includes('i18n-ignore-file')) return [];
  const raw = source.split('\n');
  const code = stripComments(source).replace(call, (match) => match.replace(/[^\n]/g, ' ')).split('\n');
  const found: Unwrapped[] = [];
  let ignoring = false;
  code.forEach((line, index) => {
    const original = raw[index];
    if (original.includes('i18n-ignore-start')) ignoring = true;
    if (original.includes('i18n-ignore-end')) ignoring = false;
    if (ignoring || original.includes('i18n-ignore') || raw[index - 1]?.includes('i18n-ignore-next-line')) return;
    if (cjk.test(line)) found.push({ line: index + 1, text: original.trim() });
  });
  return found;
}

/** `{name}` placeholders, sorted, for comparing a key with its translation. */
export function placeholders(text: string): string {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
}
