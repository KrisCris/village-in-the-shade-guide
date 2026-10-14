import { describe, expect, it } from 'vitest';
import { offlineGroup, offlinePath } from './offlineFiles.mjs';

describe('offline file groups', () => {
  it('puts pages and page data in their language', () => {
    expect(offlineGroup('index.html')).toBe('zh-CN');
    expect(offlineGroup('data/crops/index.html')).toBe('zh-CN');
    expect(offlineGroup('list-data/kind-crops.json')).toBe('zh-CN');
    expect(offlineGroup('game-data.json')).toBe('zh-CN');
    expect(offlineGroup('zh-TW/data/crops/index.html')).toBe('zh-TW');
    expect(offlineGroup('ja/list-data/kind-crops.json')).toBe('ja');
    expect(offlineGroup('locales/ja/game-data.json')).toBe('ja');
    expect(offlineGroup('locales/zh-TW/search-index.json')).toBe('zh-TW');
  });

  it('splits the search index by language and shares its scripts', () => {
    expect(offlineGroup('pagefind/index/zh-cn_12f00cf.pf_index')).toBe('zh-CN');
    expect(offlineGroup('pagefind/fragment/zh-tw_03c727b.pf_fragment')).toBe('zh-TW');
    expect(offlineGroup('pagefind/fragment/ja_0164fbd.pf_fragment')).toBe('ja');
    expect(offlineGroup('pagefind/pagefind-ui.js')).toBe('shared');
  });

  it('shares assets every language uses', () => {
    for (const file of ['_astro/BaseLayout.css', 'icons/generated/items/ITEM_ID_FLOUR.webp', 'maps/farm/0/0.webp', 'art/clouds.webp', 'favicon.svg', 'app/icon-192.png']) {
      expect(offlineGroup(file)).toBe('shared');
    }
  });

  it('never stores the worker, manifests or the file lists themselves', () => {
    for (const file of ['sw.js', 'robots.txt', 'manifest.webmanifest', 'ja/manifest.webmanifest', 'app/offline-shared.json']) {
      expect(offlineGroup(file)).toBeNull();
    }
  });

  it('requests pages by their folder', () => {
    expect(offlinePath('index.html')).toBe('');
    expect(offlinePath('ja/index.html')).toBe('ja/');
    expect(offlinePath('data/crops/index.html')).toBe('data/crops/');
    expect(offlinePath('404.html')).toBe('404.html');
    expect(offlinePath('maps/farm/0/0.webp')).toBe('maps/farm/0/0.webp');
  });
});
