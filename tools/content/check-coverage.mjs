import { readFile } from 'node:fs/promises';
import { checkCoverage } from './coverage.mjs';

const catalog = JSON.parse(await readFile('data/sources/appmedia-honogurashi.json', 'utf8'));
const coverage = JSON.parse(await readFile('data/sources/coverage.json', 'utf8'));
const outlines = JSON.parse(await readFile('data/sources/appmedia-outlines.json', 'utf8'));
const translations = JSON.parse(await readFile('data/sources/guide-translations.json', 'utf8'));
const report = checkCoverage(catalog.sources, coverage.mappings);
const guideStrings = [...new Set([...catalog.sources.map((source) => source.title), ...outlines.outlines.flatMap((outline) => outline.headings)])];
const allowedLatin = /Steam|Switch|Windows|PlayStation|PS\d|Nippon|Nintendo|Xbox|No\.|Ver\.|TOP|DLC|PC|URL|SNS|jp/gi;
const translationReport = {
  missingGuideTranslations: guideStrings.filter((text) => !translations[text]),
  guideKanaResiduals: guideStrings.filter((text) => /[ぁ-ゖァ-ヺ]/.test(translations[text] ?? '')),
  guideTokenResiduals: guideStrings.filter((text) => /VITS\d+/.test(translations[text] ?? '')),
  guideLatinResiduals: guideStrings.filter((text) => /[A-Za-z]{2,}/.test((translations[text] ?? '').replace(allowedLatin, ''))),
};
const result = { sources: catalog.sources.length, mappings: coverage.mappings.length, guideStrings: guideStrings.length, ...report, ...translationReport };
console.log(JSON.stringify(result, null, 2));
if (Object.values({ ...report, ...translationReport }).some((rows) => rows.length)) process.exitCode = 1;
