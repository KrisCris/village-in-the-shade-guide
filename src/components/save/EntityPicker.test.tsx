import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import EntityPicker from './EntityPicker';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import { APPEARANCE } from '../../lib/saveAppearance';

describe('inventory item selection', () => {
  it('excludes every appearance variant and its category without removing lookup data', () => {
    const tables: SaveNameTables = JSON.parse(readFileSync('public/save-editor-names.json', 'utf8'));
    const variants = Object.values(APPEARANCE).flatMap(rows => rows.flatMap(row => row.variants.map(variant => String(variant.itemId))));
    expect(variants.length).toBeGreaterThan(300);
    const appearanceNames = Object.fromEntries(variants.map(id => [id, tables.names!.items![id]]));
    const html = renderToStaticMarkup(<EntityPicker names={{ ...tables, names: { items: { ...appearanceNames, '230000': '木材' } } }} kind="items" value="" onChange={() => {}} />);
    expect(html).toContain('共 1 个结果');
    expect(html).toContain('木材');
    for (const category of new Set(variants.map(id => tables.itemCategories![id]))) {
      expect(html).not.toContain(`value="${category}"`);
    }
    expect(variants.every(id => lookupName(tables, 'items', id))).toBe(true);
  });
});
