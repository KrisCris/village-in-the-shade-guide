import data from '../../data/sources/game-save-progression.json';
import { builtChild, captureBuilt, encodeSigned, readSigned, SerTag, type SerBuiltNode, type SerDocument } from './ser';
import { buildDeliveryEdits, type DeliveryEdits } from './saveDeliveries';

export const PROGRESSION = data;
export interface ProgressEdits { encyclopedia?: Record<string, boolean>; skills?: Record<string, boolean>; flags?: Record<string, boolean>; deliveries?: DeliveryEdits }
export type ProgressToggleGroup = Exclude<keyof ProgressEdits, 'deliveries'>;
export function progressCount(edits: ProgressEdits): number { return Object.values(edits).reduce((sum, group) => sum + Object.keys(group ?? {}).length, 0); }

export function readEncyclopedia(doc: SerDocument): Set<string> {
  const node = doc.resolve('encyclopediaReleaseMap_');
  const children = node ? doc.children(node) : [];
  return new Set(children.filter((_, index) => index % 2 === 0).map(key => readSigned(doc, key).toString()));
}
export function readSkills(doc: SerDocument): Set<string> {
  const node = doc.resolve('pPlayerStatus_/p/skills_');
  return new Set((node ? doc.children(node) : []).flatMap(pointer => {
    const id = doc.resolve('p/pData_/dataID', pointer);
    return id ? [readSigned(doc, id).toString()] : [];
  }));
}
export function flagEnabled(doc: SerDocument, id: number, edits: ProgressEdits = {}): boolean {
  if (edits.flags?.[id] !== undefined) return edits.flags[id];
  const node = doc.resolve('flags_/flags_');
  const bytes = node && doc.payload(node);
  return !!bytes && !!(bytes[id >> 3] & (1 << (id & 7)));
}

export function buildProgressEdits(doc: SerDocument, edits: ProgressEdits): { subtrees: Map<number, SerBuiltNode>; payloads: Map<number, Uint8Array> } {
  const delivery = buildDeliveryEdits(doc, edits.deliveries);
  const subtrees = new Map<number, SerBuiltNode>(), payloads = delivery.payloads;
  const flags = { ...edits.flags, ...delivery.flags };
  if (Object.keys(edits.encyclopedia ?? {}).length) {
    const node = doc.resolve('encyclopediaReleaseMap_');
    if (!node) throw new Error('存档缺少图鉴记录。');
    const children = doc.children(node), pairs = new Map<string, SerBuiltNode[]>();
    for (let i = 0; i < children.length; i += 2) pairs.set(readSigned(doc, children[i]).toString(), [captureBuilt(doc, children[i]), captureBuilt(doc, children[i + 1])]);
    for (const [id, enabled] of Object.entries(edits.encyclopedia ?? {})) {
      if (!/^\d+$/.test(id)) throw new Error('图鉴物品无效。');
      if (!enabled) pairs.delete(id);
      else if (!pairs.has(id)) pairs.set(id, [
        { tag: SerTag.Scalar, nameOffset: -1, name: '0k', payload: encodeSigned(BigInt(id), 8) },
        { tag: SerTag.Scalar, nameOffset: -1, name: '0v', payload: new Uint8Array([1]) },
      ]);
    }
    const result = captureBuilt(doc, node);
    result.ref = pairs.size;
    result.children = [...pairs.values()].flatMap(([key, value], index) => [
      { ...key, nameOffset: -1, name: `${index}k` }, { ...value, nameOffset: -1, name: `${index}v` },
    ]);
    subtrees.set(node.offset, result);
  }
  if (Object.keys(edits.skills ?? {}).length) {
    const node = doc.resolve('pPlayerStatus_/p/skills_');
    if (!node) throw new Error('存档缺少技能记录。');
    const children = doc.children(node), entries = new Map<string, SerBuiltNode>();
    for (const pointer of children) {
      const id = doc.resolve('p/pData_/dataID', pointer);
      if (id) entries.set(readSigned(doc, id).toString(), captureBuilt(doc, pointer));
    }
    for (const [id, enabled] of Object.entries(edits.skills ?? {})) {
      const skill = PROGRESSION.skills.find(skill => String(skill.id) === id);
      if (!skill) throw new Error('技能不在游戏资料表内。');
      flags[skill.flag] = enabled;
      if (!enabled) entries.delete(id);
      else if (!entries.has(id)) {
        const built: SerBuiltNode = children[0] ? captureBuilt(doc, children[0]) : {
          tag: SerTag.Pointer, nameOffset: -1, name: '0', pointer: 'self', children: [{
            tag: SerTag.Object, nameOffset: -1, name: 'p', children: [{
              tag: SerTag.Object, nameOffset: -1, name: 'pData_', children: [{ tag: SerTag.Scalar, nameOffset: -1, name: 'dataID', payload: encodeSigned(0n, 8) }],
            }, { tag: SerTag.Scalar, nameOffset: -1, name: 'value_', payload: encodeSigned(0n, 8) }],
          }],
        };
        built.pointer = 'self';
        const target = builtChild(built, 'p/pData_/dataID'), value = builtChild(built, 'p/value_');
        if (!target || !value) throw new Error('技能模板格式未知。');
        target.payload = encodeSigned(BigInt(id), 8); value.payload = encodeSigned(0n, 8);
        entries.set(id, built);
      }
    }
    const result = captureBuilt(doc, node);
    result.ref = entries.size;
    result.children = [...entries.values()].map((child, index) => ({ ...child, nameOffset: -1, name: String(index) }));
    subtrees.set(node.offset, result);
  }
  if (Object.keys(flags).length) {
    const node = doc.resolve('flags_/flags_');
    if (!node) throw new Error('存档缺少解锁记录。');
    const bytes = doc.payload(node).slice();
    for (const [id, enabled] of Object.entries(flags)) {
      const bit = Number(id);
      if (!Number.isSafeInteger(bit) || bit < 0 || bit >= bytes.length * 8 || !PROGRESSION.flags.some(flag => flag.id === bit)) throw new Error('解锁项目无效。');
      const mask = 1 << (bit & 7);
      bytes[bit >> 3] = enabled ? bytes[bit >> 3] | mask : bytes[bit >> 3] & ~mask;
    }
    payloads.set(node.offset, bytes);
  }
  return { subtrees, payloads };
}
