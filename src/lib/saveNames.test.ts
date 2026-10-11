import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookupIcon, lookupName, type SaveNameTables } from './saveNames';

const tables: SaveNameTables = JSON.parse(readFileSync('public/save-editor-names.json', 'utf8'));

describe('save editor name tables', () => {
  it('shows names exactly as the page language table has them', () => {
    // Japanese kanji share Traditional forms; converting them broke 漬物樽 into 渍物樽.
    const ja: SaveNameTables = JSON.parse(readFileSync('public/locales/ja/save-editor-names.json', 'utf8'));
    expect(lookupName(ja, 'items', '400000')).toBe('漬物樽');
    expect(lookupName({ names: { items: { '42': '樹液採集器' } } }, 'items', '42')).toBe('樹液採集器');
  });
  it('labels the IDs the save actually stores', () => {
    expect(lookupName(tables, 'items', '230000')).toBe('木材');
    expect(lookupName(tables, 'characters', '1010')).toBe('帷');
    expect(lookupName(tables, 'weather', '3')).toBe('阴天');
    expect(lookupName(tables, 'items', '999999999')).toBeNull();
    expect(lookupName(tables, undefined, '230000')).toBeNull();
  });

  it('rebuilds icon URLs from the stems it ships', () => {
    expect(lookupIcon(tables, 'items', '230000')).toBe('/icons/generated/items/ITEM_ID_OBJECT_WOOD.webp');
    // Portraits live outside the icon folder and are stored as full paths.
    expect(lookupIcon(tables, 'characters', '1010')).toBe('/portraits/official/CHARA_ID_ORPHAN.png');
    // Kinds the catalog has no artwork for resolve to nothing rather than a broken URL.
    expect(lookupIcon(tables, 'weather', '3')).toBeNull();
    expect(lookupIcon(tables, 'items', '999999999')).toBeNull();
  });

  it('covers every item, which is what the grid renders', () => {
    const items = Object.keys(tables.names?.items ?? {});
    expect(items.length).toBeGreaterThan(2800);
    expect(items.filter((id) => !lookupIcon(tables, 'items', id))).toEqual([]);
  });
});
