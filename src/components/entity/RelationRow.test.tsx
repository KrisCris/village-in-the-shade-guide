import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../data/types';
import { I18nProvider } from '../../i18n/react';
import RelationRow from './RelationRow';

const entity = (icon_path?: string): Entity => ({
  id: 'recipe', kind: 'cooking-recipes', icon_path,
  name: { zh_hans: '料理', zh_hant: '料理', ja: '料理', internal: 'recipe', aliases: [], review_status: 'test' },
  searchText: '料理',
});

describe('RelationRow', () => {
  it('does not render a fake fallback image when no real icon exists', () => {
    const html = renderToStaticMarkup(<RelationRow row={{ key: 'recipe', entity: entity(), fixedPrice: true, chips: [] }} />);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('/icons/fallback/');
    expect(html).toContain('no-icon');
  });

  it('renders the resolved game icon when present', () => {
    const html = renderToStaticMarkup(<RelationRow row={{ key: 'recipe', entity: entity('/icons/recipe.webp'), fixedPrice: true, chips: [] }} />);

    expect(html).toContain('src="/icons/recipe.webp"');
  });

  it('shows the Japanese name under Chinese names but no subtitle on Japanese pages', () => {
    const row = { key: 'recipe', entity: { ...entity(), name: { ...entity().name, zh_hans: '料理', ja: 'りょうり' } }, fixedPrice: true, chips: [] };
    expect(renderToStaticMarkup(<RelationRow row={row} />)).toContain('<small>りょうり</small>');
    const ja = renderToStaticMarkup(<I18nProvider locale="ja"><RelationRow row={row} /></I18nProvider>);
    expect(ja).not.toContain('りょうり');
    expect(ja).not.toContain('<small>recipe</small>');
  });
});
