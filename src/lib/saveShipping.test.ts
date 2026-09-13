import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges, type SaveModel } from './saveModel';
import { SHIPPING_BOX_ID } from './saveItems';
import { readSigned } from './ser';
import { readSession, SESSION_KEY } from './saveSession';

const item = { itemId: '230000', count: '17', rank: '0', quality: '0' };
const box = (model: SaveModel) => model.containers.find(c => c.id === SHIPPING_BOX_ID)!;
const reload = (bytes: Uint8Array) => parseSaveModel(decodeSave(bytes, 'edited'));

describe.skipIf(!hasPrivateSaveFixtures)('shipping box with dynamic saved entries', () => {
  let model: SaveModel;
  beforeAll(() => { model = reload(new Uint8Array(readFileSync('tests/gamesave/save.004'))); });

  it('exposes thirty editable cells for an empty list without changing the save', () => {
    expect(model.doc.children(model.doc.resolve(SHIPPING_BOX_ID)!)).toHaveLength(0);
    expect(box(model).slots).toHaveLength(30);
    expect(box(model).used).toBe(0);
    expect(new Set(model.containers.flatMap(c => c.slots.map(s => s.pointer))).size).toBe(model.containers.reduce((n, c) => n + c.slots.length, 0));
    const restored = reload(exportSave(model, []));
    expect(Buffer.from(restored.doc.data.subarray(0, restored.doc.usedSize)).equals(Buffer.from(model.doc.data.subarray(0, model.doc.usedSize)))).toBe(true);
  });

  it('creates a real item in a virtual cell, with a fresh ID and readable export', () => {
    const restored = reload(exportSave(model, [], { [box(model).slots[29].pointer]: item }));
    expect(box(restored).slots[29].item).toMatchObject(item);
    expect(box(restored).used).toBe(1);
    expect(restored.doc.children(restored.doc.resolve(SHIPPING_BOX_ID)!)).toHaveLength(30);
    const seed = 'statusUniqueIDGenerator_/idSeed_';
    expect(readSigned(restored.doc, restored.doc.resolve(seed)!)).toBe(readSigned(model.doc, model.doc.resolve(seed)!) + 1n);
    expect(box(restored).slots).toHaveLength(40); // The game's next empty row after 30 entries.
  });

  it('keeps existing leaf edits and slot deletions while extending the same list', () => {
    const first = reload(exportSave(model, [], { [box(model).slots[0].pointer]: item, [box(model).slots[1].pointer]: item }));
    const shipping = box(first);
    const changed = pendingChanges(first, { [shipping.slots[0].item!.countOffset]: '53' });
    const next = reload(exportSave(first, changed, { [shipping.slots[1].pointer]: null, [shipping.slots[2].pointer]: { ...item, itemId: '230001' } }));
    expect(box(next).slots[0].item!.count).toBe('53');
    expect(box(next).slots[1].item).toBeNull();
    expect(box(next).slots[2].item!.itemId).toBe('230001');
    expect(box(next).slots).toHaveLength(30);
    expect(box(next).used).toBe(2);
  });

  it('does not materialize cleared virtual cells or permit nonexistent cells', () => {
    expect(Buffer.from(exportSave(model, [], { [box(model).slots[29].pointer]: null })).equals(Buffer.from(exportSave(model, [])))).toBe(true);
    expect(() => exportSave(model, [], { [box(model).slots[29].pointer + 1]: item })).toThrow('栏位');
  });

  it('restores virtual-cell drafts through the existing session format', () => {
    const slots = { [box(model).slots[0].pointer]: item };
    const session = { version: 2, identity: { name: 'save.004', size: model.save.original.length, sha256: 'a'.repeat(64) }, drafts: {}, slots, tab: 'items' };
    const storage = { getItem: (key: string) => key === SESSION_KEY ? JSON.stringify(session) : null } as Storage;
    expect(readSession(storage)?.slots).toEqual(slots);
  });
});
