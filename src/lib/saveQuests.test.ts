import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';
import { readSigned } from './ser';
import data from '../../data/sources/game-save-quests.json';
let model: ReturnType<typeof parseSaveModel>;
beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
describe.skipIf(!hasPrivateSaveFixtures)('quest checklist records', () => {
  it('edits a verified checkpoint and state without touching story flags', () => {
    const pointers = model.doc.children(model.doc.resolve('questMap_')!).filter((_, index) => index % 2 === 1);
    const pointer = pointers.find(pointer => Number(readSigned(model.doc, model.doc.resolve('p/dataID_', pointer)!)) === 3)!;
    const check = model.doc.resolve('p/checkLevel_', pointer)!, state = model.doc.resolve('p/state_', pointer)!;
    const quest = data.quests.find(quest => quest.id === 3)!;
    const level = Math.max(...quest.steps.map(step => step.level)) + 1;
    const restored = parseSaveModel(decodeSave(exportSave(model, pendingChanges(model, { [check.offset]: String(level), [state.offset]: '3' })), 'edited'));
    expect(readSigned(restored.doc, restored.doc.node(check.offset))).toBe(BigInt(level));
    const flags = 'flags_/flags_';
    expect(restored.doc.payload(restored.doc.resolve(flags)!)).toEqual(model.doc.payload(model.doc.resolve(flags)!));
    expect(() => exportSave(model, pendingChanges(model, { [state.offset]: '4' }))).toThrow('任务');
    expect(() => exportSave(model, pendingChanges(model, { [check.offset]: '999' }))).toThrow('进度');
  });
});
