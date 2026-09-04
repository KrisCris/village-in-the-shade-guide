import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../data/types';
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
});
