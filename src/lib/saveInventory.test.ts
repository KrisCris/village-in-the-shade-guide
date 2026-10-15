import { describe, expect, it } from 'vitest';
import { addMaterials, normalizeSlotEdits, slotChangeCount, transferSlots } from './saveInventory';
import { SAVE_RULES } from './saveRules';
import type { SaveContainer, SaveSlot } from './saveItems';

const slot = (pointer: number, count?: number): SaveSlot => ({ pointer, index: pointer, item: count === undefined ? null : { itemId: '101', count: String(count), rank: '2', quality: '0', itemIdOffset: pointer + 100, countOffset: pointer + 200, rankOffset: pointer + 300, qualityOffset: pointer + 400, uniqueIdOffset: pointer + 500 } });
const container = (kind: SaveContainer['kind'], slots: SaveSlot[]): SaveContainer => ({ id: kind, kind, slots, title: kind, customName: '', dataId: null, used: 0, previewItemId: null });
describe('inventory actions', () => {
  it('merges pending stacks and splits overflowing materials into empty slots', () => {
    const containers = [container('backpack', [slot(1, 1), slot(2)])];
    const edits = addMaterials(containers, { 201: String(SAVE_RULES.stackMax - 1) }, {}, [{ itemId: 101, count: 3, rank: 2 }]);
    expect(edits[1]?.count).toBe(String(SAVE_RULES.stackMax));
    expect(edits[2]).toMatchObject({ count: '2', rank: '2' });
  });
  it('fails atomically when any material does not fit', () => {
    const initial = { 2: null };
    expect(() => addMaterials([container('backpack', [slot(1, SAVE_RULES.stackMax), slot(2)])], {}, initial, [{ itemId: 102, count: 1 }, { itemId: 103, count: 1 }])).toThrow('空间不足');
    expect(initial).toEqual({ 2: null });
  });
  it('swaps occupied slots using draft values and rejects machine buffers', () => {
    const containers = [container('backpack', [slot(1, 2)]), container('storage', [slot(2, 3)]), container('machine', [slot(3)])];
    expect(transferSlots(containers, { 201: '7' }, {}, 1, 2)).toMatchObject({ 1: { count: '3' }, 2: { count: '7' } });
    expect(() => transferSlots(containers, {}, {}, 1, 3)).toThrow('只能');
  });
  it('drops edits that put a slot back the way the file has it', () => {
    const containers = [container('backpack', [slot(1, 2), slot(2)]), container('storage', [slot(3)])];
    // Add to an empty slot, then move it on: the emptied slot was empty to begin with.
    const added = normalizeSlotEdits(containers, { 2: { itemId: '9', count: '1', rank: '0', quality: '0' } });
    expect(normalizeSlotEdits(containers, transferSlots(containers, {}, added, 2, 3))).toEqual({ 3: added[2] });
    // Move out and back again.
    const out = normalizeSlotEdits(containers, transferSlots(containers, {}, {}, 1, 3));
    expect(Object.keys(out)).toEqual(['1', '3']);
    expect(normalizeSlotEdits(containers, transferSlots(containers, {}, out, 3, 1))).toEqual({});
  });
  it('keeps an emptied source while its item sits elsewhere, even under a lookalike', () => {
    const containers = [container('backpack', [slot(1, 2), slot(2)])];
    const moved = transferSlots(containers, {}, {}, 1, 2);
    const lookalike = { ...moved, 1: { itemId: '101', count: '2', rank: '2', quality: '0' } };
    expect(Object.keys(normalizeSlotEdits(containers, lookalike))).toEqual(['1', '2']);
  });
  it('counts a move or a swap as one change', () => {
    const containers = [container('backpack', [slot(1, 2), slot(2)]), container('storage', [slot(3, 4)])];
    expect(slotChangeCount(transferSlots(containers, {}, {}, 1, 2))).toBe(1);
    expect(slotChangeCount(transferSlots(containers, {}, {}, 1, 3))).toBe(1);
    expect(slotChangeCount({ 2: { itemId: '9', count: '1', rank: '0', quality: '0' }, 3: null })).toBe(2);
  });
});
