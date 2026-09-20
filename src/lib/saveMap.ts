import data from '../../data/sources/game-save-map.json';
import { containsPoint, footprint, polygonsOverlap } from './saveMapGeometry';
import artData from '../../data/sources/game-map-rules.json';
import crops from '../../data/generated/build-24969282/entities/crops.json';
import places from '../../data/sources/game-save-placements.json';
import { animalResidents, animalHouses, ANIMALS, type AnimalEdits } from './saveAnimals';
import { flagEnabled, type ProgressEdits } from './saveProgress';
import { builtChild, captureBuilt, encodeFloat, encodeSigned, encodeString, nullPointer, readFloat, readSigned, serializeSer, SerDocument, SerTag, type SerBuiltNode, type SerNode } from './ser';

export const MAP_DATA = data;
export const MAP_CROPS = crops.filter(c => c.seed_item_ids.length && c.harvest_item_ids.length);
export interface CellPaint { crop?: number | null; watered?: boolean; soil?: number }
export interface ObjectPlacement { scene: number; cell: number; template: number; move?: string; angle?: number }
export interface MapEdits { cells?: Record<string, CellPaint>; objects?: ObjectPlacement[]; removed?: string[] }
export const mapEditCount = (edits: MapEdits) => Object.keys(edits.cells ?? {}).length + (edits.objects?.length ?? 0) + (edits.removed?.length ?? 0);
export const landId = (x: number, y: number) => Math.round(y / 45) * 1_000_000 + Math.round(x / 45) + 1;
export const landPosition = (id: number) => ({ x: (id % 1_000_000 - 1) * 45, y: Math.floor(id / 1_000_000) * 45 });
export function mapBuildingFlags(edits: MapEdits, doc?: SerDocument): ProgressEdits {
  const flags: Record<string, boolean> = {};
  if(doc) for(const object of mapObjects(doc)) if(edits.removed?.includes(object.uid)&&object.spec?.building)
    for(const id of object.spec.requires) if(id) flags[id]=false;
  for (const placement of edits.objects ?? []) {
    const spec = data.objects.find(o => o.id === placement.template);
    if (!spec?.building) continue;
    for (const id of spec.requires) if (id) flags[id] = true;
    for (const id of spec.excludes) if (id) flags[id] = false;
  }
  return { flags };
}
/** Move residents to the corresponding upgraded room, or another available house. */
export function mapAnimalEdits(doc: SerDocument, edits: MapEdits, animalEdits: AnimalEdits, progress: ProgressEdits): AnimalEdits {
  const residents=animalResidents(doc,animalEdits), houses=animalHouses(doc,progress).filter(h=>h.type<2);
  const slots=houses.flatMap(h=>h.slots), available=new Set(slots.map(s=>s.id));
  const occupied=new Set([...residents.filter(r=>available.has(r.placement)).map(r=>r.placement),...Object.keys(animalEdits.added??{}).map(Number)]);
  const moves={...animalEdits.moves};
  const objects=mapObjects(doc);
  const removingStable=objects.some(o=>edits.removed?.includes(o.uid)&&o.spec?.code.includes('ARCHITECTURE_STABLE'));
  if(removingStable&&residents.some(r=>ANIMALS.some(a=>a.id===r.species&&a.houseType===2))&&!draftObjects(doc,edits).some(o=>o.spec?.code.includes('ARCHITECTURE_STABLE')))
    throw new Error('马厩里还有马，请保留一座马厩后再导出。');
  for(const resident of residents) {
    const old=places.placements.find(p=>p.id===resident.placement);
    if(!old || old.special || old.houseType>=2 || available.has(resident.placement))continue;
    const affected=objects.find(o=>o.spec?.mapId===old.mapId&&(edits.removed?.includes(o.uid)||edits.objects?.some(e=>e.move===o.uid&&e.template!==o.id)));
    if(!affected)continue;
    const upgrade=edits.objects?.find(e=>e.move===affected.uid), mapId=data.objects.find(s=>s.id===upgrade?.template)?.mapId;
    const type=ANIMALS.find(a=>a.id===resident.species)?.houseType;
    const target=slots.find(s=>s.mapId===mapId&&s.houseType===type&&!occupied.has(s.id))??slots.find(s=>s.houseType===type&&!occupied.has(s.id));
    if(!target)throw new Error(`清理建筑前，请为「${resident.name}」保留一处可用的畜舍栏位。`);
    moves[resident.index]=target.id;occupied.add(target.id);
  }
  return {...animalEdits,moves};
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
      bounds: [number('l'), number('t'), number('r'), number('b')], movable: !!spec && (spec.features.includes('RELOCATION') || scalar(doc, node, 'p/tag_/id_') === 0),
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
  if (Array.isArray(e) || Object.keys(e).some(key => !['cells', 'objects', 'removed'].includes(key))) throw new Error('预设包含未知编辑项。');
  if (e.cells !== undefined && (!e.cells || Array.isArray(e.cells) || typeof e.cells !== 'object')) throw new Error('预设田地列表无效。');
  if (Object.keys(e.cells ?? {}).length > 5000 || (e.objects?.length ?? 0) > 1000) throw new Error('布局预设超出编辑上限。');
  for (const [key, paint] of Object.entries(e.cells ?? {})) {
    if (!/^\d+:\d+$/.test(key) || !paint || typeof paint !== 'object' || Array.isArray(paint) || Object.keys(paint).some(k => !['crop', 'soil', 'watered'].includes(k)) || (paint.crop !== undefined && paint.crop !== null && !MAP_CROPS.some(c => c.numeric_id === paint.crop)) || (paint.soil !== undefined && ![0, 1, 2].includes(paint.soil)) || (paint.watered !== undefined && typeof paint.watered !== 'boolean')) throw new Error('预设含无效田地。');
  }
  if (e.objects !== undefined && !Array.isArray(e.objects)) throw new Error('预设物体列表无效。');
  for (const object of e.objects ?? []) if (!object || ![object.scene, object.cell, object.template].every(Number.isSafeInteger) || (object.move !== undefined && !/^\d+$/.test(object.move))) throw new Error('预设含无效物体。');
  if (e.removed !== undefined && (!Array.isArray(e.removed) || e.removed.some(id => !/^\d+$/.test(id)))) throw new Error('无效的清理物体列表。');
  for (const o of e.objects ?? []) if (o.angle !== undefined && (!Number.isFinite(o.angle) || o.angle % 45 !== 0)) throw new Error('无效的物体方向。');
  return e;
}

export function draftObjects(doc: SerDocument, edits: MapEdits) {
  return mapObjects(doc).filter(o => !edits.removed?.includes(o.uid)).map(o => {
    const e=edits.objects?.findLast(e=>e.move===o.uid);
    return { ...o, ...(e?landPosition(e.cell):{}), id:e?.template??o.id, spec:data.objects.find(s=>s.id===(e?.template??o.id)), angle:e?.angle??o.angle };
  }).concat((edits.objects??[]).flatMap((e,i)=>e.move?[]:[{
    node:undefined as unknown as SerNode,id:e.template,spec:data.objects.find(s=>s.id===e.template),uid:`new:${i}`, ...landPosition(e.cell), angle:e.angle??45,
    bounds:[-45,-45,45,45],movable:true,blocksPlacement:true
  }]));
}
export function objectFootprint(object: {spec?: typeof data.objects[number];x:number;y:number;angle:number;bounds:number[]}) {
  return object.spec ? footprint(object.spec,object,object.angle) : [[
    {x:object.x+object.bounds[0],y:object.y+object.bounds[1]}, {x:object.x+object.bounds[2],y:object.y+object.bounds[1]},
    {x:object.x+object.bounds[2],y:object.y+object.bounds[3]}, {x:object.x+object.bounds[0],y:object.y+object.bounds[3]}
  ]];
}
export function matureTreeAt(doc: SerDocument, edits: MapEdits, id: number, scene: number) {
  if (edits.cells?.[`${scene}:${id}`]?.crop !== undefined) return false;
  const cell=mapCells(doc).find(c=>c.id===id);
  if (!cell) return false;
  const crop=crops.find(c=>c.numeric_id===cell.crop);
  const entity=(artData.crops as Record<string,{model:string;states?:Record<string,number[][]>}>)[cell.crop];
  if (!crop || !crop.id.startsWith('CROPS_ID_OBJECT_TREE')) return false;
  const growth=doc.resolve('p/pCropsStatus_/p/growth_/this->value_',cell.node),form=doc.resolve('p/pCropsStatus_/p/formID_',cell.node);
  const stages=entity?.states?.['1'];
  return !!growth && (!form || Number(readSigned(doc,form))===1) && !!stages?.length && Number(readSigned(doc,growth))>=stages.at(-1)![0];
}
export function placementProblem(doc: SerDocument, edits: MapEdits, placement: ObjectPlacement): string | null {
  const spec=data.objects.find(s=>s.id===placement.template),terrain=sceneCells(placement.scene);
  const original=placement.move?mapObjects(doc).find(o=>o.uid===placement.move):undefined;
  const homeUpgrade=!!original&&!!spec?.code.includes('ARCHITECTURE_MYHOUSE_')&&!!original.spec?.code.includes('ARCHITECTURE_MYHOUSE_')&&placement.cell===landId(original.x,original.y)&&spec.level>original.spec.level;
  if(homeUpgrade)return null;
  if(spec?.code.includes('ARCHITECTURE_MYHOUSE_'))return '自宅只能在原位置升级。';
  const target=terrain.find(c=>c.id===placement.cell);
  if (!target || !spec) return '此位置不可放置。';
  if (!areaAvailable(doc,target.area)) return '此田地尚未购买。';
  const fs=spec.features,indoor=placement.scene!==100000001;
  if ((spec.building || fs.includes('PLACEMENT_GARDEN_ONLY')) && indoor) return '只能放在室外庭院。';
  if (fs.includes('PLACEMENT_INDOOR_ONLY') && !indoor) return '只能放在室内。';
  if (fs.includes('PLACEMENT_MYHOUSE_ONLY') && !data.scenes.find(s=>s.id===placement.scene)?.code.includes('MYHOUSE')) return '只能放在自宅。';
  if (fs.includes('TREE') && !matureTreeAt(doc,edits,target.id,placement.scene)) return '树液采集器需要放在成熟树木所在的地块。';
  if (fs.includes('PLACEMENT_ARC_LIVESTOCK_ONLY') && !/LIVESTOCK|AVIARY/.test(data.scenes.find(s=>s.id===placement.scene)?.code??'')) return '只能放在畜舍或鸡舍内。';
  const mask=spec.building?4:fs.includes('PLACEMENT_WALL_ONLY')?128:fs.includes('PLACEMENT_GARDEN_ONLY')?64:fs.includes('PLACEMENT_FARMING_ONLY')?1:2;
  const polygons=footprint(spec,target,placement.angle??45);
  const points=polygons.flat();
  const parity=(Math.round(target.x/45)+Math.round(target.y/45))%2;
  const valid=new Map(terrain.map(c=>[`${c.x},${c.y}`,c]));
  for(let x=Math.floor(Math.min(...points.map(p=>p.x))/45)*45;x<=Math.max(...points.map(p=>p.x));x+=45)
    for(let y=Math.floor(Math.min(...points.map(p=>p.y))/45)*45;y<=Math.max(...points.map(p=>p.y));y+=45) {
      if(fs.includes('PLACEMENT_WALL_ONLY') || (Math.round(x/45)+Math.round(y/45))%2!==parity || !polygons.some(poly=>containsPoint(poly,{x,y}))) continue;
      const c=valid.get(`${x},${y}`);
      if(!c || !areaAvailable(doc,c.area) || (!fs.includes('PLACEMENT_ANYWHERE') && !(c.mask&mask))) return '物体完整占地越过可放置边界。';
    }
  if (!(target.mask&mask) && !fs.includes('PLACEMENT_ANYWHERE')) return '此地面不允许放置这类物体。';
  const all=draftObjects(doc,edits).filter(o=>o.uid!==placement.move);
  if (spec.building && all.some(o=>o.spec?.building && (spec.mapId ? o.spec.buildingFamily===spec.buildingFamily && o.spec.slot===spec.slot : o.spec.buildingFamily===spec.buildingFamily && spec.limit===1))) return '此编号的建筑已存在。';
  for(const o of all) {
    if(!o.spec && !o.blocksPlacement)continue;
    const overlaps=polygons.some(a=>objectFootprint(o).some(b=>polygonsOverlap(a,b)));
    if(!overlaps)continue;
    if(spec.building && o.movable && !o.spec?.building)continue;
    if(spec.floor && o.spec?.floor && Math.hypot(o.x-target.x,o.y-target.y)<1)return '这里已有地板，请先清除地板层。';
    if(spec.floor || o.spec?.floor || fs.includes('OVERLAPABLE') || o.spec?.features.includes('OVERLAPABLE'))continue;
    if(fs.includes('PLACEMENT_IGNORE_COLLISION'))continue;
    return '物体占地与现有设施重叠。';
  }
  if(!spec.floor && !spec.building && !fs.includes('TREE')) for(const c of mapCells(doc)) {
    const edit=edits.cells?.[`${placement.scene}:${c.id}`];
    if((edit?.crop!==undefined?edit.crop:c.crop) && polygons.some(poly=>containsPoint(poly,landPosition(c.id))))return '物体占地内有作物，请先清除或选择空地。';
  }
  if(!spec.floor&&!spec.building&&!fs.includes('TREE'))for(const [key,edit] of Object.entries(edits.cells??{})) {
    const [scene,id]=key.split(':').map(Number);
    if(scene===placement.scene&&edit.crop&&polygons.some(poly=>containsPoint(poly,landPosition(id))))return '物体占地内有作物，请先清除或选择空地。';
  }
  return null;
}
/** Expand building clearing into the same undoable draft as its placement. */
export function addMapPlacement(doc: SerDocument, edits: MapEdits, placement: ObjectPlacement): MapEdits {
  const original=placement.move?draftObjects(doc,edits).find(o=>o.uid===placement.move):undefined;
  placement={...placement,angle:placement.angle??original?.angle??45};
  const base={...edits,objects:(edits.objects??[]).filter(e=>!placement.move || e.move!==placement.move)};
  const problem=placementProblem(doc,base,placement);if(problem)throw new Error(problem);
  const spec=data.objects.find(s=>s.id===placement.template)!,p=landPosition(placement.cell),polygons=footprint(spec,p,placement.angle??45);
  let next:MapEdits={...base,cells:{...base.cells},removed:[...(base.removed??[])]};
  if(spec.building) {
    for(const c of sceneCells(placement.scene))if((c.mask&1)&&polygons.some(poly=>containsPoint(poly,c)))next.cells![`${placement.scene}:${c.id}`]={crop:null,soil:0,watered:false};
    for(const o of draftObjects(doc,base))if(o.movable&&!o.spec?.building&&polygons.some(a=>objectFootprint(o).some(b=>polygonsOverlap(a,b)))){
      if(o.uid.startsWith('new:'))continue;
      next.removed!.push(o.uid);
    }
    next.objects=(next.objects??[]).filter(e=>e.move ? !next.removed?.includes(e.move) : !polygons.some(a=>footprint(data.objects.find(s=>s.id===e.template)!,landPosition(e.cell),e.angle??45).some(b=>polygonsOverlap(a,b))));
  }
  next.objects=[...(next.objects??[]),placement];
  const oldSpec=original?.spec;
  if(oldSpec?.building && oldSpec.mapId && spec.mapId && oldSpec.mapId!==spec.mapId) {
    const rooms=artData.rooms as Record<string,{bounds:number[]}[]>;
    const oldRooms=rooms[oldSpec.mapId]??[],newRooms=rooms[spec.mapId]??[];
    for(const item of draftObjects(doc,next).filter(o=>o.movable&&!o.spec?.building)) {
      const floor=oldRooms.findIndex(r=>item.x>=r.bounds[0]&&item.x<=r.bounds[2]&&item.y>=r.bounds[1]&&item.y<=r.bounds[3]);
      if(floor<0)continue;
      const old=oldRooms[floor].bounds,room=newRooms[Math.min(floor,newRooms.length-1)]?.bounds;
      if(!room)throw new Error('新建筑的室内布局尚未解析，不能迁移室内物品。');
      const x=(old[0]+old[2])/2,y=(old[1]+old[3])/2;
      const desired={x:(room[0]+room[2])/2+(spec.mirror!==oldSpec.mirror?x-item.x:item.x-x),y:(room[1]+room[3])/2+item.y-y};
      const candidates=sceneCells(spec.mapId).filter(c=>c.x>=room[0]&&c.x<=room[2]&&c.y>=room[1]&&c.y<=room[3]).sort((a,b)=>Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y));
      const draftIndex=item.uid.startsWith('new:')?Number(item.uid.slice(4)):undefined;
      const base={...next,objects:next.objects!.filter((e,i)=>draftIndex===undefined?e.move!==item.uid:i!==draftIndex)};
      const move={scene:spec.mapId,template:item.id,angle:item.angle,...(draftIndex===undefined?{move:item.uid}:{})};
      const cell=candidates.find(c=>!placementProblem(doc,base,{...move,cell:c.id}));
      if(!cell)throw new Error(`新房间没有足够位置安置「${item.spec?.name??'室内物品'}」，请先整理室内。`);
      next={...base,objects:[...base.objects,{...move,cell:cell.id}]};
    }
  }

  return next;
}

export type ClearLayer = 'crops' | 'floor' | 'objects' | 'reset';
export function clearMapArea(doc: SerDocument, edits: MapEdits, scene: number, cellIds: number[], keys: string[], layer: ClearLayer): MapEdits {
  const ids=new Set(cellIds),next:MapEdits={...edits,cells:{...edits.cells},removed:[...(edits.removed??[])]};
  if(layer==='crops'||layer==='reset')for(const c of sceneCells(scene))if(ids.has(c.id)&&(c.mask&1)&&areaAvailable(doc,c.area))
    next.cells![`${scene}:${c.id}`]=layer==='reset'?{crop:null,soil:0,watered:false}:{...next.cells![`${scene}:${c.id}`],crop:null};
  const remove=new Set<string>();
  for(const o of draftObjects(doc,edits)) {
    const key=o.uid.startsWith('new:')?o.uid:`object:${o.uid}`;
    if(!o.movable || (!keys.includes(key)&&!ids.has(landId(o.x,o.y))))continue;
    if(layer==='reset'||layer==='floor'&&o.spec?.floor||layer==='objects'&&!o.spec?.floor||layer==='crops'&&o.spec?.features.includes('TREE'))remove.add(o.uid);
  }
  next.removed=Array.from(new Set([...next.removed!,...Array.from(remove).filter(id=>!id.startsWith('new:'))]));
  next.objects=(edits.objects??[]).filter((e,i)=>e.move?!remove.has(e.move):!remove.has(`new:${i}`));
  return next;
}

/** Apply layout after ordinary save edits, resolving stable cell/unique IDs again. */
export function applyMapEdits(doc: SerDocument, edits: MapEdits): Uint8Array {
  if (!mapEditCount(edits)) return serializeSer(doc, {});
  parseMapPreset(JSON.stringify({ version: 1, game: 'honogurashi', edits }));
  // Imported layouts use exactly the same construction clearing as the UI.
  const placements=edits.objects??[];
  edits=placements.reduce((draft,p)=>addMapPlacement(doc,draft,p),{...edits,objects:[]} as MapEdits);
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
  const occupied = objects.filter(o=>!edits.removed?.includes(o.uid)).map(o => ({ ...o, bounds: [...o.bounds] }));
  for(const uid of edits.removed??[]) {
    const object=objects.find(o=>o.uid===uid);
    if(!object?.movable) throw new Error('不能清理固定场景物体。');
    const index=doc.children(objectList).findIndex(n=>n.offset===object.node.offset);
    patch(gimmicks.children![index],'p/isEnabled_',0);
  }
  const processed:ObjectPlacement[]=[];
  for (const placement of edits.objects ?? []) {
    const spec = data.objects.find(o => o.id === placement.template);
    const donor = objects.find(o=>o.movable&&o.id===placement.template)
      ?? objects.find(o=>o.movable&&o.spec?.script===spec?.script)
      ?? objects.find(o=>o.movable&&o.spec?.category===spec?.category)
      ?? objects.find(o=>o.movable);
    const moving = placement.move ? occupied.find(o=>o.uid===placement.move) : undefined;
    const homeUpgrade=!!moving&&!!spec?.code.includes('ARCHITECTURE_MYHOUSE_')&&!!moving.spec?.code.includes('ARCHITECTURE_MYHOUSE_')&&placement.cell===landId(moving.x,moving.y)&&spec.level>moving.spec.level;
    const target = sceneCells(placement.scene).find(c => c.id === placement.cell)??(homeUpgrade?landPosition(placement.cell):undefined);
    if(!target || !spec || !donor || (placement.move && ((!moving?.movable&&!homeUpgrade) || (!homeUpgrade&&moving!.id!==spec.id && moving!.spec?.buildingFamily!==spec.buildingFamily))))throw new Error(`此位置不可放置，或无法建立物体结构（${placement.template} / ${placement.move??'新增'}）。`);
    const problem=placementProblem(doc,{...edits,objects:processed},placement);if(problem)throw new Error(problem);
    processed.push(placement);
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
      const list = builtChild(built, 'p/itemList_');
      const count=spec.storage;
      if(list){list.children=Array.from({length:count},(_,i)=>nullPointer(-1,String(i)));list.ref=count;}
      patch(built,'p/scale_/x',1,true);patch(built,'p/scale_/y',1,true);
      patch(built,'p/isEnabled_',1);patch(built,'p/isDisableRelease_',0);
      gimmicks.children!.push(built);
    }
    patch(built,'p/pData_/dataID',spec.id);
    const angle=placement.angle??moving?.angle??45;
    patch(built,'p/angle_',angle,true);
    const entity=(artData.objects as Record<string,{initial?:number;directional?:boolean;seasons:Record<string,{x:number;y:number;w:number;h:number}>[]}>)[spec.id];
    const frames=entity?.seasons[0];
    const code=[6,3,2,1,4,7,8,9][((Math.round(angle/45)%8)+8)%8];
    const sprite=frames?.[String((entity?.initial??100)+(entity?.directional?code:0))]??(frames?Object.values(frames)[0]:undefined);
    if(sprite)for(const [key,value] of Object.entries({l:sprite.x,t:sprite.y,r:sprite.x+sprite.w,b:sprite.y+sprite.h}))patch(built,`p/baseAABB_/${key}`,value,true);
    patch(built, 'p/pos_/x', target.x, true); patch(built, 'p/pos_/y', target.y, true);
    if (moving) { moving.x = target.x; moving.y = target.y; moving.id=spec.id; moving.spec=spec; moving.angle=angle; }
    else occupied.push({ ...donor, id: placement.template, spec, uid: String(seed), x: target.x, y: target.y, angle, bounds: [...donor.bounds] });
  }
  for (const [key, paint] of Object.entries(edits.cells ?? {})) {
    const [sceneId, id] = key.split(':').map(Number), terrain = sceneCells(sceneId).find(c => c.id === id);
    if (!terrain || !(terrain.mask & 1) || !areaAvailable(doc, terrain.area)) throw new Error('目标不在已开放的可耕作区域。');
    const clearingOnly = paint.crop === null && paint.soil === undefined && paint.watered === undefined;
    if (!clearingOnly && paint.soil!==0 && occupied.some(o => o.blocksPlacement && !o.spec?.floor && objectFootprint(o).some(poly=>containsPoint(poly,terrain)))) throw new Error('田地被设施占用。');
    let entry = cells.find(c => c.id === id);
    if(paint.soil===0) {
      if(entry) {
        const built=world.children![doc.children(cellList).findIndex(n=>n.offset===entry!.node.offset)],parent=builtChild(built,'p')!;
        for(const name of ['pFarmlandStatus_','pCropsStatus_','pSubCropsStatus_']){const i=parent.children!.findIndex(n=>n.name===name);if(i>=0)parent.children![i]=nullPointer(parent.children![i].nameOffset,name);}
      }
      continue;
    }
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
  if (edits.objects?.length || edits.removed?.length) { gimmicks.ref = gimmicks.children!.length; subtrees.set(objectList.offset, gimmicks); payloads.set(seedNode.offset, encodeSigned(seed, seedNode.size)); }
  return serializeSer(doc, { subtrees, payloads });
}
