import data from '../../data/sources/game-save-unlocks.json';
import { simplifySaveEntry } from './saveText';
import { encodeSigned, readSigned, type SerDocument } from './ser';

export const UNLOCKS = { ...data, nodes: data.nodes.map(simplifySaveEntry), groups: data.groups.map(simplifySaveEntry), bundles: data.bundles.map(simplifySaveEntry) };
export type DeliveryEdits = Record<string, number>;
export function readDeliveries(doc: SerDocument) {
  const root = doc.resolve('bundleList_');
  const result = new Map<string, { key: string; bundleId: number; itemId: number; count: number; remain: number; rank: number; offset: number }>();
  for (const pointer of root ? doc.children(root).filter((_, i) => i % 2 === 1) : []) {
    const idNode = doc.resolve('p/bundleID_', pointer);
    if (!idNode) continue;
    const bundleId = Number(readSigned(doc, idNode));
    const bundle = data.bundles.find(row => row.id === bundleId);
    const items = doc.resolve('p/bundleItems_', pointer);
    if (!bundle || !items) continue;
    doc.children(items).forEach((item, index) => {
      const id = doc.resolve('pData_/dataID', item), remain = doc.resolve('remain_', item), rank = doc.resolve('rank_', item);
      const expected = bundle.items[index];
      if (!id || !remain || !rank || !expected || Number(readSigned(doc, id)) !== expected.itemId || Number(readSigned(doc, rank)) !== expected.rank || remain.size !== 4) return;
      const key = `${bundleId}:${index}`;
      result.set(key, { key, bundleId, itemId: expected.itemId, count: expected.count, remain: Number(readSigned(doc, remain)), rank: Number(readSigned(doc, rank)), offset: remain.offset });
    });
  }
  return result;
}

export function buildDeliveryEdits(doc: SerDocument, edits: DeliveryEdits = {}) {
  const rows = readDeliveries(doc), payloads = new Map<number, Uint8Array>(), flags: Record<string, boolean> = {};
  for (const [key, count] of Object.entries(edits)) {
    const row = rows.get(key);
    if (!row || !Number.isInteger(count) || count < 0 || count > row.count) throw new Error('交付数量必须在 0 与所需数量之间。');
    payloads.set(row.offset, encodeSigned(BigInt(row.count - count), 4));
  }
  for (const group of data.groups) {
    if (!Object.keys(edits).some(key => group.bundles.includes(Number(key.split(':')[0])))) continue;
    const expected = data.bundles.filter(b => group.bundles.includes(b.id)).flatMap(b => b.items.map((_, i) => `${b.id}:${i}`));
    if (expected.some(key => !rows.has(key))) throw new Error('此目录缺少可验证的交付记录。');
    flags[group.flag] = expected.every(key => { const row = rows.get(key)!; return (edits[key] ?? row.count - row.remain) === row.count; });
  }
  return { payloads, flags };
}
