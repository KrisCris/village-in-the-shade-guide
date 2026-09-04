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
});
