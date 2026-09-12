import data from '../../data/sources/game-save-animals.json';
import { simplifySaveEntry } from './saveText';
import places from '../../data/sources/game-save-placements.json';
import { flagEnabled } from './saveProgress';
import { builtChild, captureBuilt, encodeFloat, encodeSigned, encodeString, readSigned, readString, type SerBuiltNode, type SerDocument, type SerNode } from './ser';
export const ANIMALS = data.animals.map(simplifySaveEntry);
export interface AnimalEdits { moves?: Record<string, number>; added?: Record<string, { species: number; name: string; variant?: number }> }
export function animalEditCount(edits: AnimalEdits) { return Object.keys(edits.moves ?? {}).length + Object.keys(edits.added ?? {}).length; }
export function animalResidents(doc: SerDocument, edits: AnimalEdits = {}) {
  const list = doc.resolve('livestockList_');
  return (list ? doc.children(list) : []).map((pointer, index) => {
    const get = (path: string) => doc.resolve('p/' + path, pointer)!;
    const species = Number(readSigned(doc, get('pData_/dataID'))), texture = Number(readSigned(doc, get('pReplaceTexData_/dataID')));
    const variant = ANIMALS.find(a => a.id === species)?.variants.find(v => v.texture === texture)?.index ?? 0;
    return { index, pointer, species, variant, placement: edits.moves?.[index] ?? Number(readSigned(doc, get('pPlacementData_/dataID'))), name: readString(doc, get('name_')) };
  });
}
export function animalHouses(doc: SerDocument) {
  const enabled = places.placements.filter(place => place.houseType < 2 && !place.special && place.mapGroup === 1 && place.requires.every(flag => !flag || flagEnabled(doc, flag)) && place.excludes.every(flag => !flag || !flagEnabled(doc, flag)));
  const groups = new Map<number, typeof enabled>();
  for (const place of enabled) groups.set(place.mapId, [...(groups.get(place.mapId) ?? []), place]);
  const counts = [0, 0];
  return [...groups.entries()].map(([id, slots]) => ({ id, type: slots[0].houseType, title: `${slots[0].houseType === 0 ? '畜舍' : '禽舍'} ${++counts[slots[0].houseType]}`, slots }));
}

export function buildAnimalEdits(doc: SerDocument, edits: AnimalEdits, leafEdits: Map<number, Uint8Array>, seed: bigint) {
  if (!animalEditCount(edits)) return { subtrees: new Map<number, SerBuiltNode>(), seed };
  const list = doc.resolve('livestockList_');
  if (!list) throw new Error('存档缺少动物记录。');
  const residents = animalResidents(doc), slots = animalHouses(doc).flatMap(house => house.slots);
  const occupied = new Set<number>();
  const built = captureBuilt(doc, list);
  const applyLeaves = (node: SerNode, target: SerBuiltNode) => { const payload = leafEdits.get(node.offset); if (payload) target.payload = payload; doc.children(node).forEach((child, index) => applyLeaves(child, target.children![index])); };
  applyLeaves(list, built);
  const relocate = (target: SerBuiltNode, species: number, placement: number) => {
    const slot = slots.find(slot => slot.id === placement), animal = ANIMALS.find(animal => animal.id === species);
    if (!slot || !animal || animal.houseType !== slot.houseType || occupied.has(placement)) throw new Error('动物位置不兼容、尚未建造，或已被占用。');
    occupied.add(placement);
    for (const [path, value] of [['p/pPlacementData_/dataID', placement], ['p/pMapGroupData_/dataID', slot.mapGroup]] as const) {
      const field = builtChild(target, path); if (!field?.payload) throw new Error('动物安置字段未知。'); field.payload = encodeSigned(BigInt(value), field.payload.length);
    }
    for (const position of ['pos_', 'basePos_']) for (const axis of ['x', 'y'] as const) {
      const field = builtChild(target, `p/${position}/${axis}`); if (!field?.payload) throw new Error('动物坐标字段未知。'); field.payload = encodeFloat(slot[axis], field.payload.length);
    }
  };
  // Reserve untouched positions first, so no moving/addition can silently overlap one.
  for (const resident of residents) if (edits.moves?.[resident.index] === undefined) occupied.add(resident.placement);
  for (const [index, placement] of Object.entries(edits.moves ?? {})) {
    const resident = residents[Number(index)];
    if (!resident) throw new Error('要移动的动物不存在。');
    if (!slots.some(slot => slot.id === resident.placement)) throw new Error('特殊伙伴的安置方式不同，不能移动到普通畜舍栏位。');
    relocate(built.children![resident.index], resident.species, placement);
  }
  for (const [placement, addition] of Object.entries(edits.added ?? {})) {
    const animal = ANIMALS.find(a => a.id === addition.species && a.id < 100 && a.houseType < 2);
    const variant = animal?.variants.find(v => v.index === (addition.variant ?? 0));
    const donor = residents.find(resident => resident.species === addition.species) ?? residents.find(resident => ANIMALS.some(a => a.id === resident.species && a.id < 100 && a.houseType < 2));
    if (!animal || !variant || !donor || !addition.name.trim()) throw new Error('请填写名字，并选择有效的动物品种。');
    const target = captureBuilt(doc, donor.pointer); target.pointer = 'self';
    target.nameOffset = -1; target.name = String(built.children!.length);
    for (const name of ['statusValueMap_', 'statusIDValueMap_', 'statusTableValueMap_']) {
      const map = builtChild(target, 'p/' + name); if (map) { map.children = []; map.ref = 0; }
    }
    for (const [path, value] of [['uniqueID_', ++seed], ['loveRate_/this->value_', 0n], ['moodRate_/this->value_', 0n], ['foodNum_/this->value_', 0n], ['isSold_', 0n], ['isEnabled_', 1n]] as const) {
      const field = builtChild(target, 'p/' + path); if (!field?.payload) throw new Error('动物模板字段未知。'); field.payload = encodeSigned(value, field.payload.length);
    }
    const name = builtChild(target, 'p/name_')!; name.payload = encodeString(addition.name);
    // Native creation (0x140104380 / 0x140292DB0): selected data and texture, age zero.
    for (const [path, value] of [['pData_/dataID', addition.species], ['pReplaceTexData_/dataID', variant.texture], ['growStatus_', 0], ['isDisableRelease_', 0]] as const) {
      const field = builtChild(target, 'p/' + path); if (!field?.payload) throw new Error('动物初始化字段未知。'); field.payload = encodeSigned(BigInt(value), field.payload.length);
    }
    for (const [path, value] of [['angle_', 0], ['scale_/x', 1], ['scale_/y', 1], ['baseAABB_/l', 0], ['baseAABB_/t', 0], ['baseAABB_/r', 0], ['baseAABB_/b', 0]] as const) {
      const field = builtChild(target, 'p/' + path); if (!field?.payload) throw new Error('动物外观字段未知。'); field.payload = encodeFloat(value, field.payload.length);
    }
    const features = builtChild(target, 'p/feature_/flags_'); if (features?.payload) features.payload = new Uint8Array(features.payload.length);
    relocate(target, addition.species, Number(placement));
    built.children!.push(target);
  }
  built.ref = built.children!.length;
  return { subtrees: new Map([[list.offset, built]]), seed };
}
