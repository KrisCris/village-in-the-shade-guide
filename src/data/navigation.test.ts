import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allGuides, currentLink, currentSection, guideGroupOf, guideIcon, guideGroups, patchGuide } from './navigation';

describe('guide navigation', () => {
  it('lists every written guide page exactly once', () => {
    const pages = readdirSync('src/pages/guides')
      .filter(file => /^[a-z0-9-]+\.astro$/.test(file) && file !== 'index.astro')
      // Merged guides only redirect to their replacement.
      .filter(file => !/Astro\.redirect\(/.test(readFileSync(`src/pages/guides/${file}`, 'utf8')))
      .map(file => `/guides/${file.replace(/\.astro$/, '')}/`);
    const listed = allGuides.map(guide => guide.href).filter(href => href.startsWith('/guides/'));
    expect([...listed].sort()).toEqual(pages.sort());
  });

  it('highlights the most specific link for the page', () => {
    expect(currentLink('/planner/today/', ['/planner/', '/planner/today/'])).toBe('/planner/today/');
    expect(currentLink('/data/crops/ITEM_ID_CROPS_WHEAT/', ['/data/crops/', '/guides/'])).toBe('/data/crops/');
    expect(currentLink('/guides/some-outline/', ['/guides/', '/guides/anomalies/'])).toBe('/guides/');
    expect(currentLink('/search/', ['/guides/'])).toBeUndefined();
  });

  it('puts each page in the section its tab and sidebar show', () => {
    expect(currentSection('/data/crops/ITEM_ID_CROPS_WHEAT/')).toBe('database');
    expect(currentSection('/categories/')).toBe('database');
    expect(currentSection('/planner/workflow/')).toBe('planner');
    expect(currentSection('/guides/anomalies/')).toBe('guides');
    expect(currentSection('/save-editor/')).toBeUndefined();
    expect(currentSection('/search/')).toBeUndefined();
  });

  it('finds the topic group for related guides', () => {
    expect(guideGroupOf('/guides/anomalies/')?.id).toBe('night');
    expect(guideGroupOf(patchGuide.href)).toBeUndefined();
    expect(guideGroups.every(group => group.guides.length > 1)).toBe(true);
  });

  it('gives every guide a description', () => {
    for (const guide of allGuides) expect(guide.description, guide.href).toMatch(/\S/);
  });

  it('picks a guide icon by item ID or by category', () => {
    const entities = [
      { id: 'ITEM_ID_A', kind: 'items', category_id: 'ITEM_CATEGORY_FISH', icon_path: null },
      { id: 'ITEM_ID_B', kind: 'items', category_id: 'ITEM_CATEGORY_FISH', icon_path: '/icons/b.png' },
      { id: 'ITEM_ID_C', kind: 'crops', category_id: 'ITEM_CATEGORY_FISH', icon_path: '/icons/c.png' },
    ];
    expect(guideIcon(entities, 'FISH')).toBe('/icons/b.png');
    expect(guideIcon(entities, 'ITEM_ID_A')).toBeUndefined();
    expect(guideIcon(entities, 'ORE')).toBeUndefined();
  });
});
