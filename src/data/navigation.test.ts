import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { currentLink, guideGroups, patchGuide } from './navigation';

describe('guide navigation', () => {
  it('lists every written guide page exactly once', () => {
    const pages = readdirSync('src/pages/guides')
      .filter(file => /^[a-z0-9-]+\.astro$/.test(file) && file !== 'index.astro')
      // Merged guides only redirect to their replacement.
      .filter(file => !/Astro\.redirect\(/.test(readFileSync(`src/pages/guides/${file}`, 'utf8')))
      .map(file => `/guides/${file.replace(/\.astro$/, '')}/`);
    const listed = [patchGuide, ...guideGroups.flatMap(group => group.guides)].map(guide => guide.href).filter(href => href.startsWith('/guides/'));
    expect([...listed].sort()).toEqual(pages.sort());
  });

  it('highlights the most specific link for the page', () => {
    expect(currentLink('/planner/today/', ['/planner/', '/planner/today/'])).toBe('/planner/today/');
    expect(currentLink('/data/crops/ITEM_ID_CROPS_WHEAT/', ['/data/crops/', '/guides/'])).toBe('/data/crops/');
    expect(currentLink('/guides/some-outline/', ['/guides/', '/guides/anomalies/'])).toBe('/guides/');
    expect(currentLink('/search/', ['/guides/'])).toBeUndefined();
  });
});
