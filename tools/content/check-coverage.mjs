import { readFile } from 'node:fs/promises';
import { checkCoverage } from './coverage.mjs';

const catalog = JSON.parse(await readFile('data/sources/appmedia-honogurashi.json', 'utf8'));
const coverage = JSON.parse(await readFile('data/sources/coverage.json', 'utf8'));
const report = checkCoverage(catalog.sources, coverage.mappings);
console.log(JSON.stringify({ sources: catalog.sources.length, mappings: coverage.mappings.length, ...report }, null, 2));
if (Object.values(report).some((rows) => rows.length)) process.exitCode = 1;
