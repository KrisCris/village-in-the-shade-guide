import { describe, expect, it } from 'vitest';
import { withBase } from './sitePath';

describe('deployment paths', () => {
  it('keeps navigation, data and icons inside a project Pages base', () => {
    expect(withBase('/', '/wiki/')).toBe('/wiki/');
    expect(withBase('/data/items/?q=醋#details', '/wiki/')).toBe('/wiki/data/items/?q=醋#details');
    expect(withBase('/item-list.json', '/wiki/')).toBe('/wiki/item-list.json');
    expect(withBase('/icons/generated/items/test.webp', '/wiki/')).toBe('/wiki/icons/generated/items/test.webp');
  });
  it('does not prefix root deployments, external links, anchors or already based paths', () => {
    for (const path of ['/data/items/', '/']) expect(withBase(path, '/')).toBe(path);
    for (const path of ['https://example.com/', '//example.com/x', '#spring', 'data:image/png;base64,x', 'relative.webp', '/wiki/data/items/']) {
      expect(withBase(path, '/wiki/')).toBe(path);
    }
    expect(withBase('/wiki-other/', '/wiki')).toBe('/wiki/wiki-other/');
  });
});
