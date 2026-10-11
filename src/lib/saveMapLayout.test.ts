import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { decodeSave } from './saveEditor';
import { parseSaveModel } from './saveModel';
import { applyMapEdits, exportMapLayout, importMapLayout, mapEditCount, parseMapLayout, type MapLayout } from './saveMap';
import { SerDocument } from './ser';

const load = (name: string) => parseSaveModel(decodeSave(new Uint8Array(readFileSync(`tests/gamesave/${name}`)), name)).doc;
const sorted = (layout: MapLayout) => ({
  cells: layout.cells.map(c => JSON.stringify(c)).sort(),
  objects: layout.objects.map(o => JSON.stringify(o)).sort()
});

describe('map layout files', () => {
  it('rejects malformed layouts', () => {
    expect(() => parseMapLayout('{"version":1}')).toThrow();
    expect(() => parseMapLayout(JSON.stringify({ version: 2, game: 'honogurashi', cells: [{ scene: 1, cell: 1, soil: 9, crop: null, watered: false }], objects: [] }))).toThrow();
    expect(() => parseMapLayout(JSON.stringify({ version: 2, game: 'honogurashi', cells: [], objects: [{ scene: 1, cell: 1, template: -5, angle: 45 }] }))).toThrow();
  });
});

describe.skipIf(!hasPrivateSaveFixtures)('map layout transfer', () => {
  let source: SerDocument, layout: MapLayout;
  beforeAll(() => { source = load('save.001'); layout = parseMapLayout(JSON.stringify(exportMapLayout(source, {}))); });

  it('exports every tilled cell and movable object', () => {
    expect(layout.cells.length).toBeGreaterThan(10);
    expect(layout.objects.length).toBeGreaterThan(10);
  });

  it('reproduces the same layout when imported back into its own save', () => {
    const result = importMapLayout(source, layout);
    expect(result.skipped).toBe(0);
    expect(mapEditCount(result.edits)).toBe(0);
    const rebuilt = new SerDocument(applyMapEdits(source, result.edits));
    expect(sorted(exportMapLayout(rebuilt, {}))).toEqual(sorted(layout));
  });

  it('rebuilds another save from the layout and saves cleanly', { timeout: 60000 }, () => {
    const target = load('save.004');
    const result = importMapLayout(target, layout);
    const rebuilt = exportMapLayout(new SerDocument(applyMapEdits(target, result.edits)), {});
    const placed = new Set(rebuilt.objects.map(o => `${o.cell}:${o.template}`));
    expect(layout.objects.filter(o => !placed.has(`${o.cell}:${o.template}`)).length).toBeLessThanOrEqual(result.skipped);
    const cells = new Set(rebuilt.cells.map(c => JSON.stringify(c)));
    expect(layout.cells.filter(c => !cells.has(JSON.stringify(c))).length).toBeLessThanOrEqual(result.skipped);
  });
});
