import data from '../../data/sources/game-save-machines.json';
import type { SaveContainer, SlotEdits, SlotAssignment } from './saveItems';
import { builtChild, captureBuilt, encodeSigned, readSigned, SerTag, type SerBuiltNode, type SerDocument, type SerNode } from './ser';
import { tr } from '../i18n/active';

export const MACHINES = data;
export interface MachineEdit { recipeId?: number; finish: boolean; rank?: number }
export type MachineEdits = Record<string, MachineEdit>;
export const machineSpec = (container: SaveContainer) => data.machines.find(machine => machine.id === container.dataId);
const object = (doc: SerDocument, container: SaveContainer) => doc.resolve(`gimmickList_/${container.id.replace('gimmick-', '')}/p`);
export const specialSpec = (container: SaveContainer) => data.specialContainers.find(entry => entry.id === container.dataId);
export function deviceIdentity(doc: SerDocument, container: SaveContainer): string {
  const node = object(doc, container), id = node && doc.resolve('uniqueID_', node);
  return id ? String(readSigned(doc, id)) : container.id;
}
export function deviceEnabled(doc: SerDocument, container: SaveContainer): boolean {
  const node = object(doc, container), enabled = node && doc.resolve('isEnabled_', node);
  return !!enabled && readSigned(doc, enabled) !== 0n;
}
export function displayedItem(doc: SerDocument, container: SaveContainer): number {
  if (specialSpec(container)?.script !== 'gimmick_shinto_altar') return 0;
  const node = object(doc, container);
  return node ? mapValue(doc, doc.resolve('statusIDValueMap_', node), 'itemID') : 0;
}
export function gameDuration(seconds: number): string {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  return [days && tr('{days}天', { days }), hours && tr('{hours}小时', { hours }), (rest || !minutes) && tr('{rest}分钟', { rest })].filter(Boolean).join(' ');
}
const packedKey = (key: string) => [...key].reduce((value, character, index) => value | (BigInt(character.charCodeAt(0)) << BigInt(index * 8)), 0n);
function mapValue(doc: SerDocument, node: SerNode | undefined, key: string): number {
  const children = node ? doc.children(node) : [];
  for (let index = 0; index < children.length; index += 2) {
    const id = doc.resolve('id_', children[index]);
    if (id && readSigned(doc, id) === packedKey(key)) return Number(readSigned(doc, children[index + 1]));
  }
  return 0;
}
export function machineJobs(doc: SerDocument, container: SaveContainer, edits: MachineEdits = {}) {
  const spec = machineSpec(container), node = object(doc, container);
  if (!spec || spec.mode === 'collector' || !node) return [];
  const time = doc.resolve('timeValue_', node), duration = doc.resolve('createTime_', node), clock = doc.resolve('gameTime_/second_');
  if (!time || !duration || !clock || time.size !== 24 || duration.size !== 24) return [];
  const starts = doc.payload(time), lengths = doc.payload(duration);
  const now = Number(readSigned(doc, clock));
  return Array.from({ length: spec.capacity }, (_, index) => {
    const edit = edits[`${container.id}/${index}`];
    const recipe = edit?.recipeId === undefined ? undefined : data.processes.find(recipe => recipe.id === edit.recipeId);
    const seconds = recipe ? recipe.minutes * 60 : Number(new DataView(lengths.buffer, lengths.byteOffset).getBigInt64(index * 8, true));
    const start = Number(new DataView(starts.buffer, starts.byteOffset).getBigInt64(index * 8, true));
    const remaining = edit?.finish ? 0 : recipe ? seconds : Math.min(seconds, Math.max(0, seconds - (now - start)));
    // ExtractorPopItem constructs one output from the first item template, not itemVal0.
    const template = spec.mode === 'extractor' ? container.slots[0]?.item : null;
    return { index, seconds, remaining, output: template ? Number(template.itemId) : recipe?.output ?? mapValue(doc, doc.resolve('statusIDValueMap_', node), `itemID${index}`), count: template ? 1 : recipe?.count ?? mapValue(doc, doc.resolve('statusValueMap_', node), `itemVal${index}`), rank: edit?.rank ?? Number(template?.rank ?? container.slots.slice(index * 8, index * 8 + 8).find(slot => slot.item)?.item?.rank ?? 0), inputs: spec.mode === 'extractor' ? [] : recipe?.inputs ?? container.slots.slice(index * 8, index * 8 + 8).flatMap(slot => slot.item ? [{ itemId: Number(slot.item.itemId), count: Number(slot.item.count), rank: Number(slot.item.rank) }] : []), edited: !!edit };
  });
}

/** Preserve every unrelated status entry; keys are packed eight-byte ASCII IDs. */
function updatedMap(doc: SerDocument, node: SerNode, changes: Record<string, number>, width: number): SerBuiltNode {
  const built = captureBuilt(doc, node), children = built.children ?? [];
  for (const [key, value] of Object.entries(changes)) {
    const id = packedKey(key);
    let found = false;
    for (let index = 0; index < children.length; index += 2) {
      const payload = builtChild(children[index], 'id_')?.payload;
      if (payload && new DataView(payload.buffer, payload.byteOffset).getBigInt64(0, true) === id) {
        children[index + 1].payload = encodeSigned(BigInt(value), width); found = true; break;
      }
    }
    if (!found) children.push({ tag: SerTag.Object, nameOffset: -1, name: `${children.length / 2}k`, children: [{ tag: SerTag.Scalar, nameOffset: -1, name: 'id_', payload: encodeSigned(id, 8) }] }, { tag: SerTag.Scalar, nameOffset: -1, name: `${children.length / 2}v`, payload: encodeSigned(BigInt(value), width) });
  }
  built.children = children; built.ref = children.length / 2;
  return built;
}

export function buildMachineEdits(doc: SerDocument, containers: SaveContainer[], edits: MachineEdits) {
  const payloads = new Map<number, Uint8Array>(), subtrees = new Map<number, SerBuiltNode>(), slots: Record<number, SlotAssignment | null> = {};
  for (const key of Object.keys(edits)) {
    if (!containers.some(container => machineJobs(doc, container).some(job => `${container.id}/${job.index}` === key))) throw new Error(tr('加工栏位无效。'));
  }
  for (const container of containers) {
    const affected = Object.keys(edits).some(key => key.startsWith(container.id + '/'));
    if (!affected) continue;
    const node = object(doc, container)!;
    const time = doc.resolve('timeValue_', node)!, duration = doc.resolve('createTime_', node)!;
    const starts = doc.payload(time).slice(), lengths = doc.payload(duration).slice();
    const now = Number(readSigned(doc, doc.resolve('gameTime_/second_')!));
    const values: Record<string, number> = {}, ids: Record<string, number> = {};
    for (const job of machineJobs(doc, container)) {
      const edit = edits[`${container.id}/${job.index}`];
      if (!edit) continue;
      if (edit.rank !== undefined && (!Number.isInteger(edit.rank) || edit.rank < 0 || edit.rank > 4)) throw new Error(tr('材料品质无效。'));
      let seconds = job.seconds;
      if (edit.recipeId !== undefined) {
        if (machineSpec(container)?.mode !== 'processing') throw new Error(tr('自动采集设备不能手动添加配方。'));
        if (job.seconds !== 0) throw new Error(tr('请先在游戏中领取已有加工品，再向空栏位加入配方。'));
        const recipe = data.processes.find(recipe => recipe.id === edit.recipeId && recipe.machines.includes(container.dataId!));
        if (!recipe || recipe.minutes <= 0 || recipe.inputs.length > 8) throw new Error(tr('这台设备不能加工所选配方。'));
        const buffer = container.slots.slice(job.index * 8, job.index * 8 + 8);
        if (buffer.length !== 8 || buffer.some(slot => slot.item)) throw new Error(tr('加工材料缓冲区不为空或格式未知。'));
        buffer.forEach((slot, index) => { const input = recipe.inputs[index]; slots[slot.pointer] = input ? { itemId: String(input.itemId), count: String(input.count), rank: String(edit.rank ?? 0), quality: '0' } : null; });
        seconds = recipe.minutes * 60;
        ids[`itemID${job.index}`] = recipe.output; values[`itemVal${job.index}`] = recipe.count;
        new DataView(lengths.buffer).setBigInt64(job.index * 8, BigInt(seconds), true);
        new DataView(starts.buffer).setBigInt64(job.index * 8, BigInt(now), true);
      }
      if (edit.rank !== undefined && edit.recipeId === undefined) {
        const buffer = machineSpec(container)?.mode === 'extractor' ? container.slots.slice(0, 1) : container.slots.slice(job.index * 8, job.index * 8 + 8);
        for (const slot of buffer) if (slot.item) payloads.set(slot.item.rankOffset, encodeSigned(BigInt(edit.rank), doc.node(slot.item.rankOffset).size));
      }
      if (!seconds) throw new Error(tr('空加工栏位不能立即完成。'));
      if (edit.finish) new DataView(starts.buffer).setBigInt64(job.index * 8, BigInt(now - seconds), true);
    }
    const jobs = machineJobs(doc, container, edits);
    // Lua setup uses inProc for the lid/stone and distant UI even after time expires.
    // It denotes occupied jobs, not merely jobs whose countdown is still running.
    values.inProc = machineSpec(container)?.mode === 'extractor' ? 1 : Number(jobs.some(job => job.seconds > 0));
    values.procEnd = Number(jobs.some(job => job.seconds > 0 && job.remaining === 0));
    payloads.set(time.offset, starts); payloads.set(duration.offset, lengths);
    subtrees.set(doc.resolve('statusValueMap_', node)!.offset, updatedMap(doc, doc.resolve('statusValueMap_', node)!, values, 4));
    if (Object.keys(ids).length) subtrees.set(doc.resolve('statusIDValueMap_', node)!.offset, updatedMap(doc, doc.resolve('statusIDValueMap_', node)!, ids, 8));
  }
  return { payloads, subtrees, slots: slots as SlotEdits };
}
