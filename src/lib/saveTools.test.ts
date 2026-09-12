import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';
import { linkedToolDrafts, TOOLS, undoToolDraft } from './saveTools';
import { readSigned } from './ser';
import { transformHairPixel } from './saveAppearance';

let model: ReturnType<typeof parseSaveModel>;
beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
const currentHoe = () => model.containers.find(c => c.kind === 'tool')!.slots.find(s => TOOLS.find(t => String(t.itemId) === s.item?.itemId)?.family === 660010)!.item!;
let hoe: ReturnType<typeof currentHoe>;
beforeAll(() => { hoe = currentHoe(); });

describe.skipIf(!hasPrivateSaveFixtures)('native tool upgrades and hair shader', () => {
  it('changes the hoe and selected range together and preserves the unique ID', () => {
    for (const [id, level] of [['660015', 4], ['660016', 5]] as const) {
      const changes = pendingChanges(model, { [hoe.itemIdOffset]: id });
      const restored = parseSaveModel(decodeSave(exportSave(model, changes), 'edited'));
      expect(readSigned(restored.doc, restored.doc.resolve('pPlayerStatus_/p/mullberryRangeLevel_')!)).toBe(BigInt(level));
      const item = restored.containers.find(c => c.kind === 'tool')!.slots.find(s => s.item?.itemId === id)!.item!;
      expect(readSigned(restored.doc, restored.doc.node(item.uniqueIdOffset))).toBe(readSigned(model.doc, model.doc.node(hoe.uniqueIdOffset)));
    }
  });
  it('keeps unmodified selected ranges and undoes the linked fields as one change', () => {
    expect(linkedToolDrafts(model, {})).toEqual({});
    const range = model.doc.resolve('pPlayerStatus_/p/mullberryRangeLevel_')!;
    expect(undoToolDraft(model, { [hoe.itemIdOffset]: '660015' }, range.offset)).toEqual({});
    expect(() => pendingChanges(model, { [hoe.itemIdOffset]: '230000' })).toThrow('同类工具');
    expect(() => pendingChanges(model, { [hoe.itemIdOffset]: '660003' })).toThrow('同类工具');
  });
  it('preserves original blonde at neutral HSV and applies the shader multipliers', () => {
    expect(transformHairPixel([231, 211, 134], [0, 1, 1])).toEqual([231, 211, 134]);
    expect(transformHairPixel([231, 211, 134], [0, 0, 1])).toEqual([231, 231, 231]);
    expect(transformHairPixel([231, 211, 134], [0, 1, 0])).toEqual([0, 0, 0]);
    expect(transformHairPixel([0, 0, 0], [.5, 1, 1])).toEqual([0, 0, 0]);
    expect(transformHairPixel([255, 0, 0], [1 / 3, 1, 1])).toEqual([0, 255, 0]);
  });
});
