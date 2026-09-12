import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeSave } from './saveEditor';
import { encodeString, readString, serializeSer, SerDocument, SerTag } from './ser';

const FIXTURES = ['save.001', 'save.002', 'save.003', 'save.004', 'save.005', '.systemsave'];

function open(name: string): SerDocument {
  return new SerDocument(decodeSave(new Uint8Array(readFileSync(`tests/gamesave/${name}`)), name).data);
}

describe.skipIf(!hasPrivateSaveFixtures)('SER container', () => {
  it('re-serializes every real save byte for byte', () => {
    for (const name of FIXTURES) {
      const doc = open(name);
      const rebuilt = serializeSer(doc, new Map());
      expect(`${name}:${rebuilt.length}`).toBe(`${name}:${doc.usedSize}`);
      expect(Buffer.from(rebuilt).equals(Buffer.from(doc.data.subarray(0, doc.usedSize)))).toBe(true);
    }
  }, 120_000);

  it('walks the save tree down to the leaves', () => {
    const doc = open('save.003');
    expect(doc.root.name).toBe('SAVEDATA');
    expect(doc.root.tag).toBe(SerTag.Object);
    const names = doc.children(doc.root).map((node) => node.name);
    expect(names.slice(0, 5)).toEqual(['version_', 'playTime_', 'revision_', 'flags_', 'gameValues_']);
    expect(names).toContain('brandCropsNameMap_');

    expect(readString(doc, doc.resolve('pPlayerStatus_/p/name_')!)).toBe('losty');
    expect(readString(doc, doc.resolve('pPlayerStatus_/p/dogName_')!)).toBe('maple');
    expect(readString(doc, doc.resolve('livestockList_/#1/p/name_')!)).toBe('CHUU');
    expect(readString(doc, doc.resolve('brandCropsNameMap_/#1')!)).toBe('金克拉小麦');
  });

  it('keeps the tree consistent when a string changes byte length', () => {
    const doc = open('save.003');
    const player = doc.resolve('pPlayerStatus_/p/name_')!;
    const animal = doc.resolve('livestockList_/#0/p/name_')!;
    const edits = new Map([
      [player.offset, encodeString('一个很长的新名字')],
      [animal.offset, encodeString('x')],
    ]);

    const rebuilt = serializeSer(doc, edits);
    expect(rebuilt.length).not.toBe(doc.usedSize);

    const reread = new SerDocument(rebuilt);
    expect(readString(reread, reread.resolve('pPlayerStatus_/p/name_')!)).toBe('一个很长的新名字');
    expect(readString(reread, reread.resolve('livestockList_/#0/p/name_')!)).toBe('x');
    // Untouched neighbours still resolve, so the shifted offsets stayed coherent.
    expect(readString(reread, reread.resolve('livestockList_/#9/p/name_')!)).toBe('牛鬼');
    expect(readString(reread, reread.resolve('brandCropsNameMap_/#3')!)).toBe('上帝压狗');
  });

  it('rewrites every pointer ref to the node it still points at', () => {
    const doc = open('save.003');
    const player = doc.resolve('pPlayerStatus_/p/name_')!;
    const rebuilt = new SerDocument(serializeSer(doc, new Map([[player.offset, encodeString('lo')]])));
    let checked = 0;
    const walk = (node: ReturnType<SerDocument['node']>): void => {
      if (node.tag === SerTag.Pointer && node.ref !== 0xffffffff) {
        // Either the pointer owns its target, or it aliases a real node header.
        expect(node.ref === node.offset || rebuilt.node(node.ref).offset === node.ref).toBe(true);
        checked++;
      }
      for (const child of rebuilt.children(node)) walk(child);
    };
    walk(rebuilt.root);
    expect(checked).toBeGreaterThan(10_000);
  }, 60_000);
});
