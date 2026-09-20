import data from '../../data/sources/game-save-map.json';
import crops from '../../data/generated/build-24969282/entities/crops.json';
import { flagEnabled, type ProgressEdits } from './saveProgress';
import { builtChild, captureBuilt, encodeFloat, encodeSigned, encodeString, nullPointer, readFloat, readSigned, serializeSer, SerDocument, SerTag, type SerBuiltNode, type SerNode } from './ser';

export const MAP_DATA = data;
export const MAP_CROPS = crops.filter(c => c.seed_item_ids.length && c.harvest_item_ids.length);
export interface CellPaint { crop?: number | null; watered?: boolean; soil?: number }
export interface ObjectPlacement { scene: number; cell: number; template: number; move?: string }
export interface MapEdits { cells?: Record<string, CellPaint>; objects?: ObjectPlacement[] }
export const mapEditCount = (edits: MapEdits) => Object.keys(edits.cells ?? {}).length + (edits.objects?.length ?? 0);
export const landId = (x: number, y: number) => Math.round(y / 45) * 1_000_000 + Math.round(x / 45) + 1;
export const landPosition = (id: number) => ({ x: (id % 1_000_000 - 1) * 45, y: Math.floor(id / 1_000_000) * 45 });
export function mapBuildingFlags(edits: MapEdits): ProgressEdits {
  const flags: Record<string, boolean> = {};
  for (const placement of edits.objects ?? []) {
    const spec = data.objects.find(o => o.id === placement.template);
    if (!spec?.building) continue;
    for (const id of spec.requires) if (id) flags[id] = true;
    for (const id of spec.excludes) if (id) flags[id] = false;
  }
  return { flags };
}
export function areaAvailable(doc: SerDocument, area: number) {
  return (!(area & 2) || flagEnabled(doc, 147)) && (!(area & 4) || flagEnabled(doc, 148));
}
export function sceneCells(sceneId: number) {
  const scene = data.scenes.find(s => s.id === sceneId);
  return scene?.cells.map(([x, y, mask, area]) => ({ id: landId(scene.origin[0] + x * 45, scene.origin[1] + y * 45), x: scene.origin[0] + x * 45, y: scene.origin[1] + y * 45, mask, area })) ?? [];
}
export function mapCells(doc: SerDocument) {
  const list = doc.resolve('mapStatusMap_/0v/p/cells_');
  const nodes = list ? doc.children(list) : [];
  return nodes.flatMap((key, i) => i % 2 ? [] : [{ id: Number(readSigned(doc, key)), node: nodes[i + 1],
    crop: scalar(doc, nodes[i + 1], 'p/pCropsStatus_/p/pData_/dataID'), soil: scalar(doc, nodes[i + 1], 'p/pFarmlandStatus_/p/pData_/dataID') }]);
}
function scalar(doc: SerDocument, node: SerNode, path: string) { const n = doc.resolve(path, node); return n ? Number(readSigned(doc, n)) : 0; }
export function mapObjects(doc: SerDocument) {
  const list = doc.resolve('gimmickList_');
  return (list ? doc.children(list) : []).flatMap(node => {
    const id = scalar(doc, node, 'p/pData_/dataID'), spec = data.objects.find(o => o.id === id);
    const x = doc.resolve('p/pos_/x', node), y = doc.resolve('p/pos_/y', node);
    if (!x || !y || !scalar(doc, node, 'p/isEnabled_')) return [];
    const number = (key: string) => { const n = doc.resolve(`p/baseAABB_/${key}`, node); return n ? readFloat(doc, n) : 0; };
    const angleNode = doc.resolve('p/angle_', node);
    return [{ node, id, spec, uid: String(scalar(doc, node, 'p/uniqueID_')), x: readFloat(doc, x), y: readFloat(doc, y), angle: angleNode ? readFloat(doc, angleNode) : 0,
      bounds: [number('l'), number('t'), number('r'), number('b')], movable: !!spec && scalar(doc, node, 'p/tag_/id_') === 0,
      // Fixed indoor geometry uses YMWR placement masks. Effect actors (notably
      // room lights) have room-sized visual AABBs, not furniture collision boxes.
      blocksPlacement: spec ? !spec.floor : id >= 100000000 && id < 200000000 }];
  });
}

export function parseMapPreset(text: string): MapEdits {
  if (text.length > 2_000_000) throw new Error('布局预设过大。');
  const preset = JSON.parse(text);
  if (preset?.version !== 1 || preset?.game !== 'honogurashi' || !preset.edits || typeof preset.edits !== 'object') throw new Error('布局预设格式不兼容。');
  const e = preset.edits as MapEdits;
  if (Array.isArray(e) || Object.keys(e).some(key => !['cells', 'objects'].includes(key))) throw new Error('预设包含未知编辑项。');
  if (e.cells !== undefined && (!e.cells || Array.isArray(e.cells) || typeof e.cells !== 'object')) throw new Error('预设田地列表无效。');
  if (Object.keys(e.cells ?? {}).length > 5000 || (e.objects?.length ?? 0) > 1000) throw new Error('布局预设超出编辑上限。');
  for (const [key, paint] of Object.entries(e.cells ?? {})) {
    if (!/^\d+:\d+$/.test(key) || !paint || typeof paint !== 'object' || Array.isArray(paint) || Object.keys(paint).some(k => !['crop', 'soil', 'watered'].includes(k)) || (paint.crop !== undefined && paint.crop !== null && !MAP_CROPS.some(c => c.numeric_id === paint.crop)) || (paint.soil !== undefined && ![1, 2].includes(paint.soil)) || (paint.watered !== undefined && typeof paint.watered !== 'boolean')) throw new Error('预设含无效田地。');
  }
  if (e.objects !== undefined && !Array.isArray(e.objects)) throw new Error('预设物体列表无效。');
  for (const object of e.objects ?? []) if (!object || ![object.scene, object.cell, object.template].every(Number.isSafeInteger) || (object.move !== undefined && !/^\d+$/.test(object.move))) throw new Error('预设含无效物体。');
  return e;
}

/** Apply layout after ordinary save edits, resolving stable cell/unique IDs again. */
export function applyMapEdits(doc: SerDocument, edits: MapEdits): Uint8Array {
  if (!mapEditCount(edits)) return serializeSer(doc, {});
  parseMapPreset(JSON.stringify({ version: 1, game: 'honogurashi', edits }));
  const subtrees = new Map<number, SerBuiltNode>(), payloads = new Map<number, Uint8Array>();
  const cells = mapCells(doc), objects = mapObjects(doc);
  const cellList = doc.resolve('mapStatusMap_/0v/p/cells_');
  const objectList = doc.resolve('gimmickList_');
  const seedNode = doc.resolve('statusUniqueIDGenerator_/idSeed_');
  if (!cellList || !objectList || !seedNode) throw new Error('此存档缺少地图结构。');
  let seed = readSigned(doc, seedNode);
  const world = captureBuilt(doc, cellList, true), gimmicks = captureBuilt(doc, objectList, true);
  const patch = (target: SerBuiltNode, path: string, value: number, floating = false) => {
    const node = builtChild(target, path); if (!node?.payload) throw new Error(`地图模板缺少 ${path}`);
    node.payload = floating ? encodeFloat(value, node.payload.length) : encodeSigned(BigInt(value), node.payload.length);
  };
  const occupied = objects.map(o => ({ ...o, bounds: [...o.bounds] }));
  for (const placement of edits.objects ?? []) {
    const target = sceneCells(placement.scene).find(c => c.id === placement.cell);
    const spec = data.objects.find(o => o.id === placement.template);
    const donor = objects.find(o => o.movable && (o.id === placement.template || (spec?.building && o.spec?.family === spec.family)));
    const moving = placement.move ? occupied.find(o => o.uid === placement.move) : undefined;
    const mask = spec?.building ? 4 : 2;
    if (!target || !(target.mask & mask) || !donor || (placement.move && (!moving?.movable || moving.id !== placement.template))) throw new Error('此位置不可放置，或当前存档没有对应物体模板。');
    if (!areaAvailable(doc, target.area)) throw new Error('此田地尚未购买。');
    if (spec?.building && !moving && occupied.some(o => o.spec?.mapId === spec.mapId)) throw new Error('此编号的房屋已经存在。请选择其他空闲编号。');
    const [l, t, r, b] = donor.bounds;
    const box = { l: target.x + Math.min(l, -22), r: target.x + Math.max(r, 22), t: target.y + Math.min(t, -22), b: target.y + Math.max(b, 22) };
    if (!spec?.floor && cells.some(c => {
      const p = landPosition(c.id), edit = edits.cells?.[`${placement.scene}:${c.id}`];
      return (edit?.crop !== undefined ? edit.crop : c.crop) && p.x >= box.l && p.x <= box.r && p.y >= box.t && p.y <= box.b;
    })) throw new Error('物体占地内有作物，请先清除或选择空地。');
    if (!donor.spec?.floor && occupied.some(o => o.uid !== moving?.uid && o.blocksPlacement && box.l < o.x + Math.max(o.bounds[2], 22) && box.r > o.x + Math.min(o.bounds[0], -22) && box.t < o.y + Math.max(o.bounds[3], 22) && box.b > o.y + Math.min(o.bounds[1], -22))) throw new Error('物体占地与现有设施重叠。');
    const terrain = sceneCells(placement.scene);
    // Sample every valid grid parity point within the conservative saved bounds.
    for (let x = Math.ceil(box.l / 45) * 45; x <= box.r; x += 45) for (let y = Math.ceil(box.t / 45) * 45; y <= box.b; y += 45) {
      if ((Math.round(x / 45) + Math.round(y / 45)) % 2 === (Math.round(target.x / 45) + Math.round(target.y / 45)) % 2 && !terrain.some(c => c.x === x && c.y === y && (c.mask & mask) && areaAvailable(doc, c.area))) throw new Error('物体完整占地越过可放置边界。');
    }
    const index = moving ? doc.children(objectList).findIndex(n => n.offset === moving.node.offset) : gimmicks.children!.length;
    const built = moving ? gimmicks.children![index] : captureBuilt(doc, donor.node);
    if (!moving) {
      built.nameOffset = -1; built.name = String(index); built.pointer = 'self';
      patch(built, 'p/uniqueID_', Number(++seed));
      patch(built, 'p/pData_/dataID', placement.template);
      for (const path of ['parentID_', 'useItemID_', 'tag_/id_']) patch(built, `p/${path}`, 0);
      for (const path of ['name_', 'scriptArgTable_']) { const n = builtChild(built, `p/${path}`); if (n) n.payload = encodeString(''); }
      for (const path of ['statusValueMap_', 'statusIDValueMap_', 'statusTableValueMap_']) { const n = builtChild(built, `p/${path}`); if (n) { n.children = []; n.ref = 0; } }
      for (const path of ['timeValue_', 'createTime_']) { const n = builtChild(built, `p/${path}`); if (n?.payload) n.payload = new Uint8Array(n.payload.length); }
      const list = builtChild(built, 'p/itemList_'); if (list?.children) list.children = list.children.map(n => nullPointer(n.nameOffset, n.name));
      gimmicks.children!.push(built);
    }
    patch(built, 'p/pos_/x', target.x, true); patch(built, 'p/pos_/y', target.y, true);
    if (moving) { moving.x = target.x; moving.y = target.y; }
    else occupied.push({ ...donor, id: placement.template, spec, uid: String(seed), x: target.x, y: target.y, bounds: [...donor.bounds] });
  }
  for (const [key, paint] of Object.entries(edits.cells ?? {})) {
    const [sceneId, id] = key.split(':').map(Number), terrain = sceneCells(sceneId).find(c => c.id === id);
    if (!terrain || !(terrain.mask & 1) || !areaAvailable(doc, terrain.area)) throw new Error('目标不在已开放的可耕作区域。');
    const clearingOnly = paint.crop === null && paint.soil === undefined && paint.watered === undefined;
    if (!clearingOnly && occupied.some(o => o.blocksPlacement && terrain.x >= o.x + Math.min(o.bounds[0], -22) && terrain.x <= o.x + Math.max(o.bounds[2], 22) && terrain.y >= o.y + Math.min(o.bounds[1], -22) && terrain.y <= o.y + Math.max(o.bounds[3], 22))) throw new Error('田地被设施占用。');
    let entry = cells.find(c => c.id === id);
    const donor = cells.find(c => c.soil && c.crop && MAP_CROPS.some(crop => crop.numeric_id === c.crop));
    if (!donor) throw new Error('请先在游戏中耕地并种下一株作物，作为田地模板。');
    let built: SerBuiltNode;
    if (entry) built = world.children![doc.children(cellList).findIndex(n => n.offset === entry!.node.offset)];
    else {
      built = captureBuilt(doc, donor.node); built.pointer = 'self'; built.nameOffset = -1; built.name = `${world.children!.length / 2}v`;
      world.children!.push({ tag: SerTag.Scalar, nameOffset: -1, name: `${world.children!.length / 2}k`, payload: encodeSigned(BigInt(id), 8) }, built);
    }
    for (const part of ['pFarmlandStatus_', ...(typeof paint.crop === 'number' ? ['pCropsStatus_'] : [])]) if (!builtChild(built, `p/${part}/p`)) {
      const template = captureBuilt(doc, doc.resolve(`p/${part}`, donor.node)!);
      const parent = builtChild(built, 'p')!; const index = parent.children!.findIndex(n => n.name === part); parent.children![index] = template;
    }
    if (paint.crop === null || (!entry && paint.crop === undefined)) {
      const parent = builtChild(built, 'p')!; const i = parent.children!.findIndex(n => n.name === 'pCropsStatus_'); parent.children![i] = nullPointer(parent.children![i].nameOffset, 'pCropsStatus_');
    } else if (paint.crop !== undefined) {
      patch(built, 'p/pCropsStatus_/p/pData_/dataID', paint.crop); patch(built, 'p/pCropsStatus_/p/landID_', id);
      for (const [path, value] of [['growth_/this->value_', 0], ['formID_', 1], ['changeCropsID_', 0], ['toolHitCount_', 0], ['isNight_', 0], ['isWater_', 0], ['isRandomCrops_', 0], ['isSubCrops_', 0], ['pFertilizerData_/dataID', 0], ['removeEventID_', 0], ['witheredSeason_', 0]] as const) patch(built, `p/pCropsStatus_/p/${path}`, value);
      const effects = builtChild(built, 'p/pCropsStatus_/p/effects_'); if (effects) { effects.children = []; effects.ref = 0; }
    }
    if (!entry) {
      patch(built, 'p/pFarmlandStatus_/p/pData_/dataID', 1);
      patch(built, 'p/pFarmlandStatus_/p/water_/this->value_', 0);
      patch(built, 'p/pFarmlandStatus_/p/pFertilizerData_/dataID', 0);
      for (const name of ['effects_', 'nowDays_']) { const n = builtChild(built, `p/pFarmlandStatus_/p/${name}`); if (n) { n.children = []; n.ref = 0; } }
      const parent = builtChild(built, 'p')!; const sub = parent.children!.findIndex(n => n.name === 'pSubCropsStatus_'); if (sub >= 0) parent.children![sub] = nullPointer(parent.children![sub].nameOffset, 'pSubCropsStatus_');
    }
    if (paint.soil !== undefined) patch(built, 'p/pFarmlandStatus_/p/pData_/dataID', paint.soil);
    if (paint.watered !== undefined) patch(built, 'p/pFarmlandStatus_/p/water_/this->value_', paint.watered ? 1 : 0);
  }
  if (Object.keys(edits.cells ?? {}).length) { world.ref = world.children!.length / 2; subtrees.set(cellList.offset, world); }
  if (edits.objects?.length) { gimmicks.ref = gimmicks.children!.length; subtrees.set(objectList.offset, gimmicks); payloads.set(seedNode.offset, encodeSigned(seed, seedNode.size)); }
  return serializeSer(doc, { subtrees, payloads });
}
