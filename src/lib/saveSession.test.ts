import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { identifySave, readSession, verifySessionBytes, type SaveSession } from './saveSession';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';

describe('save session recovery', () => {
  it.skipIf(!hasPrivateSaveFixtures)('preserves field and structural drafts through JSON and produces identical exports', async () => {
    const bytes = new Uint8Array(readFileSync('tests/gamesave/save.004'));
    const model = parseSaveModel(decodeSave(bytes, 'save.004'));
    const name = model.doc.resolve('pPlayerStatus_/p/name_')!;
    const slots = model.containers.find(container => container.kind === 'backpack')!.slots;
    const session: SaveSession = { version: 2, identity: await identifySave(bytes, 'save.004'), tab: 'items', drafts: { [name.offset]: '测试长名字' }, slots: { [slots[19].pointer]: { itemId: '230000', count: '3', rank: '1', quality: '0' } } };
    const storage = { getItem: () => JSON.stringify(session) } as unknown as Storage;
    const restored = readSession(storage)!;
    await verifySessionBytes(restored.identity, bytes);
    const reparsed = parseSaveModel(decodeSave(bytes, restored.identity.name));
    const before = exportSave(model, pendingChanges(model, session.drafts), session.slots);
    const after = exportSave(reparsed, pendingChanges(reparsed, restored.drafts), restored.slots);
    expect((await identifySave(after, 'edited')).sha256).toBe((await identifySave(before, 'edited')).sha256);
  });

  it('rejects a different original even when its byte length matches', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const identity = await identifySave(bytes, 'save.004');
    await expect(verifySessionBytes(identity, new Uint8Array([1, 2, 4]))).rejects.toThrow('校验不一致');
    await expect(verifySessionBytes(identity, new Uint8Array([1, 2]))).rejects.toThrow('校验不一致');
  });

  it('rejects incompatible or malformed persisted state', () => {
    const storage = (value: unknown) => ({ getItem: () => JSON.stringify(value) }) as unknown as Storage;
    expect(() => readSession(storage({ version: 1 }))).toThrow('不兼容');
    expect(() => readSession(storage({ version: 2, identity: {} }))).toThrow('不兼容');
  });
});
