import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../data/types';
import EntityExplorer from './EntityExplorer';

const name = {
  zh_hans: '林',
  zh_hant: '林',
  ja: 'リン',
  internal: 'CHARA_ID_VILLAGE_HEAD',
  aliases: [],
  review_status: 'override',
};

describe('EntityExplorer icons', () => {
  it('does not show a fake error icon for entities without a real image', () => {
    const character = {
      id: name.internal,
      kind: 'characters',
      name,
      searchText: '林 リン',
      icon_path: null,
    } satisfies Entity;

    const html = renderToStaticMarkup(<EntityExplorer rows={[character]} kind="characters" />);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('/icons/fallback/default.svg');
    expect(html).toContain('林');
  });

  it('renders one grouped product row with its recipe count', () => {
    const product = {
      id: 'ITEM_ID_FISH_SAUCE',
      kind: 'items',
      source_kind: 'processes',
      name: { ...name, zh_hans: '鱼露', ja: '魚醤', internal: 'ITEM_ID_FISH_SAUCE' },
      searchText: '鱼露 魚醤',
      icon_path: '/icons/generated/items/ITEM_ID_FISH_SAUCE.webp',
      variant_count: 22,
      variant_ids: [],
      variants: [],
      machine_ids: [],
      sell_price: 140,
      net_profit: 80,
      profit_per_day: 40,
    } satisfies Entity;

    const html = renderToStaticMarkup(<EntityExplorer rows={[product]} kind="processes" />);

    expect(html.match(/<tr/g)).toHaveLength(2);
    expect(html).toContain('22 种配方');
    expect(html).toContain('鱼露');
  });
});
