import { SAVE_RULES } from './saveRules';
import type { SaveContainer, SaveSlot, SlotAssignment, SlotEdits } from './saveItems';
import { tr } from '../i18n/active';

export interface MaterialRequest { itemId: number; count: number; rank?: number }

export function slotValue(slot: SaveSlot, drafts: Record<number, string>, edits: SlotEdits): SlotAssignment | null {
  if (Object.hasOwn(edits, slot.pointer)) return edits[slot.pointer];
  const item = slot.item;
  return item ? { sourcePointer: slot.pointer, itemId: drafts[item.itemIdOffset] ?? item.itemId, count: drafts[item.countOffset] ?? item.count,
    rank: drafts[item.rankOffset] ?? item.rank, quality: drafts[item.qualityOffset] ?? item.quality } : null;
}

/** Compute all assignments before changing state: insufficient room changes nothing. */
export function addMaterials(containers: SaveContainer[], drafts: Record<number, string>, edits: SlotEdits, materials: MaterialRequest[]): SlotEdits {
  const backpack = containers.find(c => c.kind === 'backpack');
  if (!backpack) throw new Error(tr('此存档没有背包。'));
  const next = { ...edits };
  for (const material of materials) {
    if (!Number.isSafeInteger(material.itemId) || material.itemId <= 0 || !Number.isSafeInteger(material.count) || material.count < 0 || !Number.isInteger(material.rank ?? 0) || (material.rank ?? 0) < 0 || (material.rank ?? 0) > 4) throw new Error(tr('材料或品质无效。'));
    let remaining = material.count;
    const itemId = String(material.itemId), rank = String(material.rank ?? 0);
    for (const slot of backpack.slots) {
      const value = slotValue(slot, drafts, next);
      if (!remaining || !value || value.itemId !== itemId || value.rank !== rank || value.quality !== '0') continue;
      const room = Math.max(0, SAVE_RULES.stackMax - Number(value.count));
      const amount = Math.min(room, remaining);
      if (amount) next[slot.pointer] = { ...value, count: String(Number(value.count) + amount) };
      remaining -= amount;
    }
    for (const slot of backpack.slots) {
      if (!remaining || slotValue(slot, drafts, next)) continue;
      const amount = Math.min(SAVE_RULES.stackMax, remaining);
      next[slot.pointer] = { itemId, rank, quality: '0', count: String(amount) };
      remaining -= amount;
    }
    if (remaining) throw new Error(tr('背包空间不足，未加入任何材料。请先腾出空位。'));
  }
  return next;
}

export function transferSlots(containers: SaveContainer[], drafts: Record<number, string>, edits: SlotEdits, from: number, to: number): SlotEdits {
  const permitted = containers.filter(c => c.kind === 'backpack' || c.kind === 'storage' || c.id === 'shippingBoxItemList_');
  const slots = permitted.flatMap(c => c.slots);
  const source = slots.find(s => s.pointer === from), target = slots.find(s => s.pointer === to);
  if (!source || !target) throw new Error(tr('只能在背包、收纳箱和出货箱之间移动物品。'));
  if (from === to) return edits;
  const a = slotValue(source, drafts, edits), b = slotValue(target, drafts, edits);
  if (!a) throw new Error(tr('来源格子为空。'));
  return { ...edits, [from]: b, [to]: a };
}

/** Drop edits that leave a slot as the file has it, so moving an item back or clearing an empty slot is not a change. */
export function normalizeSlotEdits(containers: SaveContainer[], edits: SlotEdits): SlotEdits {
  const slots = new Map(containers.flatMap(container => container.slots.map(slot => [slot.pointer, slot] as const)));
  // A slot whose original item now sits elsewhere must keep its edit, even if a lookalike replaced it.
  const moved = new Set(Object.entries(edits).flatMap(([key, value]) => value?.sourcePointer !== undefined && value.sourcePointer !== Number(key) ? [value.sourcePointer] : []));
  const next: Record<number, SlotAssignment | null> = {};
  for (const [key, value] of Object.entries(edits)) {
    const pointer = Number(key), item = slots.get(pointer)?.item;
    const unchanged = value === null ? !item
      : !!item && !moved.has(pointer) && (value.sourcePointer ?? pointer) === pointer
        && value.itemId === item.itemId && value.count === item.count && value.rank === item.rank && value.quality === item.quality;
    if (!unchanged) next[pointer] = value;
  }
  return next;
}

/** Changes as the player sees them: a move or swap between two slots counts once. */
export function slotChangeCount(edits: SlotEdits): number {
  let count = 0;
  for (const [key, value] of Object.entries(edits)) {
    const pointer = Number(key), source = value?.sourcePointer;
    const movedAway = value === null && Object.values(edits).some(other => other?.sourcePointer === pointer);
    const secondHalfOfSwap = source !== undefined && source !== pointer && edits[source]?.sourcePointer === pointer && pointer > source;
    if (!movedAway && !secondHalfOfSwap) count++;
  }
  return count;
}
