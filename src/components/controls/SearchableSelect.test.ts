import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sources(path);
  return /\.(tsx|astro)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
});

describe('dropdowns', () => {
  it('uses the themed SearchableSelect instead of native select elements', () => {
    const offenders = sources('src').filter(path => /<select\b/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
