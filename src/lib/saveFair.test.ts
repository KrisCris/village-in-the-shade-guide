import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { decodeSave, type DecodedSave } from './saveEditor';
import { FAIR_ENTRY_FLAGS, FAIR_REPLIED_FLAG, fairDayEditCount, fairDayEntry, fairDayPrepared, fairLetterChoice, withFairDayEntry, withoutFairDayEdits } from './saveFair';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';
import { flagEnabled } from './saveProgress';
import { encodeSigned, readSigned, SerDocument } from './ser';

const VENUE = 70001, CROPS_VENUE = 70006;
let save: DecodedSave;
beforeAll(() => { save = decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004'); });

/** A copy of the save with the given letters, flags and fields patched in place (same sizes, so offsets hold). */
function patched(edit: (doc: SerDocument) => void): DecodedSave {
  const data = save.data.slice();
  edit(new SerDocument(data));
  return { ...save, data };
}
const setFlag = (doc: SerDocument, id: number, on: boolean) => {
  const bytes = doc.payload(doc.resolve('flags_/flags_')!);
  bytes[id >> 3] = on ? bytes[id >> 3] | 1 << (id & 7) : bytes[id >> 3] & ~(1 << (id & 7));
};
const letters = (doc: SerDocument) => doc.children(doc.resolve('letterStatus_/p/letterList_')!);
const set = (doc: SerDocument, path: string, from: Parameters<SerDocument['resolve']>[1], value: number) => {
  const node = doc.resolve(path, from)!;
  doc.payload(node).set(encodeSigned(BigInt(value), node.size));
};
/** The week before the fair: the last two letters are fair notices, an old answered one and this month's open one. */
const letterWeek = () => patched(doc => {
  const list = letters(doc);
  set(doc, 'p/dataID_', list.at(-2), 7); set(doc, 'p/choiceIndex_', list.at(-2), 2);
  set(doc, 'p/dataID_', list.at(-1), 7); set(doc, 'p/choiceIndex_', list.at(-1), -1);
  for (const id of [VENUE, CROPS_VENUE]) setFlag(doc, id, false);
});
/** The fair day after the preparation picked livestock. */
const fairDay = () => patched(doc => {
  for (const letter of letters(doc)) if (readSigned(doc, doc.resolve('p/dataID_', letter)!) === 7n) set(doc, 'p/dataID_', letter, 6);
  for (const [id, on] of [[600, true], [601, false], [602, true], [603, false], [VENUE, true], [CROPS_VENUE, false]] as const) setFlag(doc, id, on);
});

describe.skipIf(!hasPrivateSaveFixtures)('fair entry', () => {
  it('edits the answer on the last fair notice, the one the preparation reads', () => {
    const model = parseSaveModel(letterWeek());
    const choice = fairLetterChoice(model.doc)!;
    expect(choice.offset).toBe(model.doc.resolve('p/choiceIndex_', letters(model.doc).at(-1))!.offset);
    expect(fairDayPrepared(model.doc)).toBe(false);
    const field = model.sections.find(section => section.id === 'basic')!.groups.flatMap(group => group.fields).find(field => field.offset === choice.offset)!;
    expect(field.value).toBe('-1');
    expect(field.options?.map(option => option.value)).toEqual(['-1', '0', '1', '2']);
    const restored = parseSaveModel(decodeSave(exportSave(model, pendingChanges(model, { [field.offset]: '0' })), 'edited'));
    expect(readSigned(restored.doc, fairLetterChoice(restored.doc)!)).toBe(0n);
    // The older notice and every flag stay as they were.
    expect(readSigned(restored.doc, restored.doc.resolve('p/choiceIndex_', letters(restored.doc).at(-2))!)).toBe(2n);
    expect(restored.doc.payload(restored.doc.resolve('flags_/flags_')!)).toEqual(model.doc.payload(model.doc.resolve('flags_/flags_')!));
  });

  it('rejects an answer outside the three entries', () => {
    const model = parseSaveModel(letterWeek());
    const offset = fairLetterChoice(model.doc)!.offset;
    expect(() => exportSave(model, pendingChanges(model, { [offset]: '3' }))).toThrow();
  });

  it('offers no letter field once the notice is gone', () => {
    const model = parseSaveModel(fairDay());
    expect(fairLetterChoice(model.doc)).toBeUndefined();
    expect(model.sections.find(section => section.id === 'basic')!.groups.some(group => group.fields.some(field => field.options))).toBe(false);
  });

  it('switches the fair day the way EventSetFairFlagByReply sets it', () => {
    const model = parseSaveModel(fairDay());
    expect(fairDayPrepared(model.doc)).toBe(true);
    expect(fairDayEntry(model.doc)).toBe(1);
    expect(withFairDayEntry(model.doc, {}, 1).flags).toEqual({});

    const crops = withFairDayEntry(model.doc, {}, 0);
    expect(crops.flags).toEqual({ 601: true, 602: false, [VENUE]: false, [CROPS_VENUE]: true });
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, crops), 'edited'));
    expect(fairDayEntry(restored.doc)).toBe(0);
    expect([VENUE, CROPS_VENUE].map(id => flagEnabled(restored.doc, id))).toEqual([false, true]);

    const horse = withFairDayEntry(model.doc, crops, 2);
    expect(horse.flags).toEqual({ 602: false, 603: true });
    expect(fairDayEditCount(horse)).toBe(1);
    expect(fairDayEditCount({ flags: { 44: true } })).toBe(0);
    expect(withoutFairDayEdits({ flags: { ...horse.flags, 44: true } }).flags).toEqual({ 44: true });
    expect(() => withFairDayEntry(model.doc, {}, 3 as 0)).toThrow();
  });

  it('marks a random entry as answered when the player picks one on the fair day', () => {
    const model = parseSaveModel(patched(doc => {
      for (const [id, on] of [[FAIR_REPLIED_FLAG, false], [FAIR_ENTRY_FLAGS[0], false], [FAIR_ENTRY_FLAGS[1], false], [FAIR_ENTRY_FLAGS[2], true], [CROPS_VENUE, false], [VENUE, true]] as const) setFlag(doc, id, on);
    }));
    expect(withFairDayEntry(model.doc, {}, 1).flags).toEqual({ [FAIR_REPLIED_FLAG]: true, 602: true, 603: false });
  });
});
