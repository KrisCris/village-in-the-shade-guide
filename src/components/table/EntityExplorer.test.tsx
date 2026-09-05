import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../data/types';
import EntityExplorer from './EntityExplorer';
import * as explorerModule from './EntityExplorer';

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

  it('renders fish time guidance and availability filters', () => {
    const html = renderToStaticMarkup(<EntityExplorer rows={[]} kind="fish" fishingLocationOptions={[{ id: 'FISHING_ID_01', name: '下游（流水）' }]} />);

    expect(html).toContain('早晨 07:00–12:00');
    expect(html).toContain('白天 12:00–18:00');
    expect(html).toContain('夜晚 18:00–00:00');
    expect(html).toContain('深夜 00:00–06:00');
    expect(html).toContain('钓鱼点');
    expect(html).toContain('下游（流水）');
  });

  it('renders the actual game category filter for all items', () => {
    const html = renderToStaticMarkup(<EntityExplorer rows={[]} kind="items" itemCategoryOptions={[{ id: 'ITEM_CATEGORY_CURSE', name: '咒物' }]} />);

    expect(html).toContain('类别');
    expect(html).toContain('咒物');
  });

  it('requires one fish appearance to match season, period, and location together', () => {
    const applyEntityFilters = (explorerModule as unknown as {
      applyEntityFilters?: (rows: Entity[], filters: Record<string, string>) => Entity[];
    }).applyEntityFilters;
    expect(applyEntityFilters).toBeTypeOf('function');
    if (!applyEntityFilters) return;
    const fish = (id: string, appearances: NonNullable<Entity['appearances']>) => ({
      id,
      kind: 'fish',
      name: { ...name, internal: id, zh_hans: id },
      searchText: id,
      appearances,
    }) satisfies Entity;
    const crossMatched = fish('cross-matched', [
      { season: 'spring', time_period: 'morning', location_id: 'A' },
      { season: 'summer', time_period: 'evening', location_id: 'B' },
    ]);
    const exact = fish('exact', [
      { season: 'spring', time_period: 'evening', location_id: 'A' },
    ]);

    expect(applyEntityFilters([crossMatched, exact], {
      query: '', season: 'spring', machine: '', timePeriod: 'evening', fishingLocation: 'A', itemCategory: '',
    }).map((row) => row.id)).toEqual(['exact']);
  });

  it('filters all items by the game category id', () => {
    const applyEntityFilters = (explorerModule as unknown as {
      applyEntityFilters?: (rows: Entity[], filters: Record<string, string>) => Entity[];
    }).applyEntityFilters;
    expect(applyEntityFilters).toBeTypeOf('function');
    if (!applyEntityFilters) return;
    const item = (id: string, categoryId: string) => ({
      id,
      kind: 'items',
      name: { ...name, internal: id, zh_hans: id },
      searchText: id,
      category_id: categoryId,
    }) satisfies Entity;

    expect(applyEntityFilters([item('curse', 'ITEM_CATEGORY_CURSE'), item('night', 'ITEM_CATEGORY_NIGHT')], {
      query: '', season: '', machine: '', timePeriod: '', fishingLocation: '', itemCategory: 'ITEM_CATEGORY_CURSE',
    }).map((row) => row.id)).toEqual(['curse']);
  });
});
