import source from '../../data/sources/game-save-map.json';
import { localizeGameData } from './saveText';
import { containsPoint, footprint, polygonsOverlap } from './saveMapGeometry';
import artData from '../../data/sources/game-map-rules.json';
import crops from '../../data/generated/build-25311578/entities/crops.json';
import places from '../../data/sources/game-save-placements.json';
import { animalResidents, animalHouses, ANIMALS, type AnimalEdits } from './saveAnimals';
import { flagEnabled, type ProgressEdits } from './saveProgress';
import { builtChild, captureBuilt, encodeFloat, encodeSigned, encodeString, nullPointer, readFloat, readSigned, serializeSer, SerDocument, SerTag, type SerBuiltNode, type SerNode } from './ser';
import { tr } from '../i18n/active';
import { msg } from '../i18n/translate';

// The base house and coop templates ship without game translations; their
// Simplified Chinese names are catalog keys instead.
const untranslated = new Set([msg('我的家'), msg('鸡舍')]);
const localized = localizeGameData(source);
const data = { ...localized, objects: localized.objects.map(o => 'nameTranslations' in o || !untranslated.has(o.name) ? o : { ...o, name: tr(o.name) }) };

export const MAP_DATA = data;
export const MAP_CROPS = crops.filter(c => c.seed_item_ids.length && c.harvest_item_ids.length);
export interface CellPaint { crop?: number | null; watered?: boolean; soil?: number; growth?: number; form?: number }
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
/** Preview and export share the same placement migration; an upgrade keeps its residents. */
export function mapAnimalEdits(doc: SerDocument, edits: MapEdits, animalEdits: AnimalEdits, progress: ProgressEdits): AnimalEdits {
  const residents=animalResidents(doc,animalEdits), slots=animalHouses(doc,progress).filter(h=>h.type<2).flatMap(h=>h.slots);
  const available=new Set(slots.map(s=>s.id)), buildings=draftObjects(doc,edits).filter(o=>o.spec?.building);
  const occupied=new Set([...residents.filter(r=>available.has(r.placement)).map(r=>r.placement),...Object.keys(animalEdits.added??{}).map(Number).filter(id=>available.has(id))]);
  const moves={...animalEdits.moves},added={...animalEdits.added};
  const objects=mapObjects(doc);
  if(objects.some(o=>edits.removed?.includes(o.uid)&&o.spec?.code.includes('ARCHITECTURE_STABLE'))&&residents.some(r=>ANIMALS.some(a=>a.id===r.species&&a.houseType===2))&&!buildings.some(o=>o.spec?.code.includes('ARCHITECTURE_STABLE')))
    throw new Error(tr('马厩里还有马，请保留一座马厩后再导出。'));
  function relocate(placement:number,species:number,name:string) {
    const old=places.placements.find(p=>p.id===placement);
    if(!old||old.special||old.houseType>=2||available.has(placement))return placement;
    const oldSpec=data.objects.find(s=>s.mapId===old.mapId);
    const corresponding=buildings.find(o=>o.spec?.buildingFamily===oldSpec?.buildingFamily&&o.spec?.slot===oldSpec?.slot);
    const affected=corresponding&&corresponding.spec?.mapId!==old.mapId || objects.some(o=>o.spec?.mapId===old.mapId&&edits.removed?.includes(o.uid));
    if(!affected)return placement;
    const type=ANIMALS.find(a=>a.id===species)?.houseType;
    const candidates=slots.filter(s=>s.houseType===type&&(!corresponding||s.mapId===corresponding.spec?.mapId));
    const ordinal=places.placements.filter(p=>p.mapId===old.mapId&&!p.special).findIndex(p=>p.id===placement);
    const preferred=candidates[ordinal];
    const target=preferred&&!occupied.has(preferred.id)?preferred:candidates.find(s=>!occupied.has(s.id));
    if(!target)throw new Error(tr('建筑内没有足够栏位安置「{name}」，请先调整动物位置。', { name }));
    occupied.add(target.id);return target.id;
  }
  for(const resident of residents){const target=relocate(resident.placement,resident.species,resident.name);if(target!==resident.placement)moves[resident.index]=target;}
  for(const [placement,animal] of Object.entries(animalEdits.added??{})){const target=relocate(Number(placement),animal.species,animal.name);if(target!==Number(placement)){delete added[placement];added[target]=animal;}}
  return {...animalEdits,moves,added};
}
/** Horses stand at the stable's attachment points, so they follow the stable when it moves. */
export function stablePosition(doc: SerDocument, edits: MapEdits = {}) {
  const find = (objects: { x: number; y: number; spec?: { buildingFamily?: string | null } }[]) => objects.find(o => o.spec?.buildingFamily === 'GIMMICK_ID_ARCHITECTURE_STABLE');
  const now = find(draftObjects(doc, edits)), before = find(mapObjects(doc));
  return now ? { x: now.x, y: now.y, moved: !before || before.x !== now.x || before.y !== now.y } : null;
}
/**
 * Drop watering that leaves soil as the save already has it (rain waters every
 * field), so the review only counts cells that really change.
 */
export function withoutNoOpWatering(doc: SerDocument, edits: MapEdits): MapEdits {
  if (!edits.cells) return edits;
  const saved = new Map(mapCells(doc).map(c => [c.id, c]));
  let cells: MapEdits['cells'] | undefined;
  for (const [key, paint] of Object.entries(edits.cells)) {
    if (paint.watered === undefined) continue;
    const cell = saved.get(Number(key.split(':')[1]));
    if (!cell?.soil || (paint.soil !== undefined && paint.soil !== cell.soil)) continue;
    const water = doc.resolve('p/pFarmlandStatus_/p/water_/this->value_', cell.node);
    if (!water || !!Number(readSigned(doc, water)) !== paint.watered) continue;
    const { watered: _, ...rest } = paint;
    cells ??= { ...edits.cells };
    if (Object.values(rest).every(value => value === undefined)) delete cells[key]; else cells[key] = rest;
  }
  return cells ? { ...edits, cells } : edits;
}
export function areaAvailable(doc: SerDocument, area: number) {
  // 147/148: the two farmland expansions; 90033: the additional farmland built at the carpenter (1.2.0).
  return (!(area & 2) || flagEnabled(doc, 147)) && (!(area & 4) || flagEnabled(doc, 148)) && (!(area & 8) || flagEnabled(doc, 90033));
}
export function sceneCells(sceneId: number) {
  const scene = data.scenes.find(s => s.id === sceneId);
  return scene?.cells.map(([x, y, mask, area]) => ({ id: landId(scene.origin[0] + x * 45, scene.origin[1] + y * 45), x: scene.origin[0] + x * 45, y: scene.origin[1] + y * 45, mask, area })) ?? [];
}
// A parsed save never changes (edits produce new bytes), so its map reads are cached per document.
const cellCache = new WeakMap<SerDocument, ReturnType<typeof readMapCells>>();
const objectCache = new WeakMap<SerDocument, ReturnType<typeof readMapObjects>>();
export function mapCells(doc: SerDocument) {
  let cells = cellCache.get(doc);
  if (!cells) cellCache.set(doc, cells = readMapCells(doc));
  return cells;
}
function readMapCells(doc: SerDocument) {
  const list = doc.resolve('mapStatusMap_/0v/p/cells_');
  const nodes = list ? doc.children(list) : [];
  return nodes.flatMap((key, i) => i % 2 ? [] : [{ id: Number(readSigned(doc, key)), node: nodes[i + 1],
    crop: scalar(doc, nodes[i + 1], 'p/pCropsStatus_/p/pData_/dataID'), soil: scalar(doc, nodes[i + 1], 'p/pFarmlandStatus_/p/pData_/dataID') }]);
}
function scalar(doc: SerDocument, node: SerNode, path: string) { const n = doc.resolve(path, node); return n ? Number(readSigned(doc, n)) : 0; }
export function mapObjects(doc: SerDocument) {
  let objects = objectCache.get(doc);
  if (!objects) objectCache.set(doc, objects = readMapObjects(doc));
  return objects;
}
function readMapObjects(doc: SerDocument) {
  const list = doc.resolve('gimmickList_');
  // Furniture lists the items standing on it as `posNN` → item uniqueID; the item points back through parentID_.
  const slots = new Map<string, string>();
  const objects = (list ? doc.children(list) : []).flatMap(node => {
    const id = scalar(doc, node, 'p/pData_/dataID'), spec = data.objects.find(o => o.id === id);
    const x = doc.resolve('p/pos_/x', node), y = doc.resolve('p/pos_/y', node);
    if (!x || !y || !scalar(doc, node, 'p/isEnabled_')) return [];
    const map = doc.resolve('p/statusIDValueMap_', node), pairs = map ? doc.children(map) : [];
    for (const key of pairs) {
      const label = key.name.endsWith('k') ? doc.resolve('id_', key) : undefined, value = pairs.find(v => v.name === key.name.slice(0, -1) + 'v');
      const text = label ? String.fromCharCode(...doc.payload(label)).split(String.fromCharCode(0))[0] : '';
      if (value && /^pos\d+$/.test(text)) slots.set(String(readSigned(doc, value)), text);
    }
    const number = (key: string) => { const n = doc.resolve(`p/baseAABB_/${key}`, node); return n ? readFloat(doc, n) : 0; };
    const angleNode = doc.resolve('p/angle_', node), parent = String(scalar(doc, node, 'p/parentID_'));
    return [{ node, id, spec, uid: String(scalar(doc, node, 'p/uniqueID_')), x: readFloat(doc, x), y: readFloat(doc, y), angle: angleNode ? readFloat(doc, angleNode) : 0,
      bounds: [number('l'), number('t'), number('r'), number('b')], movable: !!spec && (spec.features.includes('RELOCATION') || scalar(doc, node, 'p/tag_/id_') === 0),
      // Fixed indoor geometry uses YMWR placement masks. Effect actors (notably
      // room lights) have room-sized visual AABBs, not furniture collision boxes.
      blocksPlacement: spec ? !spec.floor : id >= 100000000 && id < 200000000,
      parent: parent === '0' ? undefined : parent, slot: undefined as string | undefined }];
  });
  const uids = new Set(objects.map(o => o.uid));
  for (const o of objects) {
    if (!o.parent || !uids.has(o.parent)) { o.parent = undefined; continue; }
    // Items on furniture follow it; they are not placed on the floor grid themselves.
    o.slot = slots.get(o.uid); o.movable = false; o.blocksPlacement = false;
  }
  return objects;
}
const specById = new Map(data.objects.map(o => [o.id, o]));
type ObjectRules = Record<string, { initial?: number; directional?: boolean; slots?: Record<string, Record<string, number[]>> }>;
function slotOffset(id: number, angle: number, slot?: string) {
  const entity = (artData.objects as ObjectRules)[id];
  const frame = (entity?.initial ?? 100) + (entity?.directional ? [6,3,2,1,4,7,8,9][((Math.round(angle/45)%8)+8)%8] : 0);
  // A direction without its own frame is drawn with the resting frame (see spriteArt).
  return slot ? (entity?.slots?.[frame] ?? entity?.slots?.[entity.initial ?? 100])?.[slot] : undefined;
}
type SavedObject = ReturnType<typeof readMapObjects>[number];
export type EditedObject = SavedObject & { move?: ObjectPlacement; carried?: boolean; parentY?: number };
/** Saved objects after layout edits: moved ones at their new cell, items on furniture carried along with it. Cleared ones are left out. */
export function editedObjects(doc: SerDocument, edits: MapEdits): EditedObject[] {
  const objects = mapObjects(doc), byUid = new Map(objects.map(o => [o.uid, o])), removed = new Set(edits.removed);
  const moves = new Map((edits.objects ?? []).flatMap(e => e.move ? [[e.move, e] as const] : []));
  const done = new Map<string, EditedObject | null>();
  const place = (o: SavedObject, depth: number): EditedObject | null => {
    if (done.has(o.uid)) return done.get(o.uid)!;
    let result: EditedObject | null;
    const parent = o.parent ? byUid.get(o.parent) : undefined, move = moves.get(o.uid);
    if (removed.has(o.uid)) result = null;
    else if (!parent || depth > 4) result = move ? { ...o, ...landPosition(move.cell), id: move.template, spec: specById.get(move.template), angle: move.angle ?? o.angle, move } : o;
    else {
      const at = place(parent, depth + 1);
      if (!at) result = null;
      else if (at === parent) result = { ...o, parentY: parent.y };
      else {
        let dx = o.x - parent.x, dy = o.y - parent.y;
        const before = slotOffset(parent.id, parent.angle, o.slot), after = slotOffset(at.id, at.angle, o.slot);
        // Mirrored rooms store the slot with x negated; keep whichever side the save used.
        if (before && after && Math.abs(dy - before[1]) < 2) {
          const side = Math.abs(dx - before[0]) < 2 ? 1 : Math.abs(dx + before[0]) < 2 ? -1 : 0;
          if (side) { dx = side * after[0]; dy = after[1]; }
        }
        result = { ...o, x: at.x + dx, y: at.y + dy, carried: true, parentY: at.y };
      }
    }
    done.set(o.uid, result);
    return result;
  };
  return objects.flatMap(o => { const p = place(o, 0); return p ? [p] : []; });
}

export function parseMapPreset(text: string): MapEdits {
  if (text.length > 2_000_000) throw new Error(tr('布局预设过大。'));
  const preset = JSON.parse(text);
  if (preset?.version !== 1 || preset?.game !== 'honogurashi' || !preset.edits || typeof preset.edits !== 'object') throw new Error(tr('布局预设格式不兼容。'));
  const e = preset.edits as MapEdits;
  if (Array.isArray(e) || Object.keys(e).some(key => !['cells', 'objects', 'removed'].includes(key))) throw new Error(tr('预设包含未知编辑项。'));
  if (e.cells !== undefined && (!e.cells || Array.isArray(e.cells) || typeof e.cells !== 'object')) throw new Error(tr('预设田地列表无效。'));
  if (Object.keys(e.cells ?? {}).length > 5000 || (e.objects?.length ?? 0) > 1000) throw new Error(tr('布局预设超出编辑上限。'));
  for (const [key, paint] of Object.entries(e.cells ?? {})) {
    if (!/^\d+:\d+$/.test(key) || !paint || typeof paint !== 'object' || Array.isArray(paint) || Object.keys(paint).some(k => !['crop', 'soil', 'watered', 'growth', 'form'].includes(k)) || (paint.crop !== undefined && paint.crop !== null && !MAP_CROPS.some(c => c.numeric_id === paint.crop)) || (paint.soil !== undefined && ![0, 1, 2, 3].includes(paint.soil)) || (paint.watered !== undefined && typeof paint.watered !== 'boolean')) throw new Error(tr('预设含无效田地。'));
    if(paint.growth!==undefined&&(!Number.isSafeInteger(paint.growth)||paint.growth<0||paint.growth>1_000_000)||paint.form!==undefined&&(!Number.isSafeInteger(paint.form)||paint.form<1||paint.form>10))throw new Error(tr('无效的生长状态。'));
  }
  if (e.objects !== undefined && !Array.isArray(e.objects)) throw new Error(tr('预设物体列表无效。'));
  for (const object of e.objects ?? []) if (!object || ![object.scene, object.cell, object.template].every(Number.isSafeInteger) || (object.move !== undefined && !/^\d+$/.test(object.move))) throw new Error(tr('预设含无效物体。'));
  if (e.removed !== undefined && (!Array.isArray(e.removed) || e.removed.some(id => !/^\d+$/.test(id)))) throw new Error(tr('无效的清理物体列表。'));
  for (const o of e.objects ?? []) if (o.angle !== undefined && (!Number.isFinite(o.angle) || o.angle % 45 !== 0)) throw new Error(tr('无效的物体方向。'));
  return e;
}

export function draftObjects(doc: SerDocument, edits: MapEdits) {
  return editedObjects(doc, edits).map(({ move: _, carried: __, parentY: ___, ...o }) => o).concat((edits.objects??[]).flatMap((e,i)=>e.move?[]:[{
    node:undefined as unknown as SerNode,id:e.template,spec:specById.get(e.template),uid:`new:${i}`, ...landPosition(e.cell), angle:e.angle??45,
    bounds:[-45,-45,45,45],movable:true,blocksPlacement:true,parent:undefined as string|undefined,slot:undefined as string|undefined
  }]));
}
export function objectFootprint(object: {spec?: typeof data.objects[number];x:number;y:number;angle:number;bounds:number[]}) {
  return object.spec ? footprint(object.spec,object,object.angle) : [[
    {x:object.x+object.bounds[0],y:object.y+object.bounds[1]}, {x:object.x+object.bounds[2],y:object.y+object.bounds[1]},
    {x:object.x+object.bounds[2],y:object.y+object.bounds[3]}, {x:object.x+object.bounds[0],y:object.y+object.bounds[3]}
  ]];
}
export function matureTreeAt(doc: SerDocument, edits: MapEdits, id: number, scene: number) {
  const state=cropGrowth(doc,edits,scene,id);
  if(state)return state.crop.id.startsWith('CROPS_ID_OBJECT_TREE')&&state.form===1&&state.maximum>0&&state.growth>=state.maximum;
  return false;

}
/** The growth the game uses: value_ clamped to the stored max_ of growth_. */
export function storedGrowth(doc:SerDocument,cell:SerNode){
  const value=doc.resolve('p/pCropsStatus_/p/growth_/this->value_',cell),max=doc.resolve('p/pCropsStatus_/p/growth_/max_',cell);
  return value?Math.min(Number(readSigned(doc,value)),max?Number(readSigned(doc,max)):Infinity):0;
}
export const CROP_FORMS:Record<number,string>={1:tr('正常生长'),2:tr('枯萎'),3:tr('异变'),4:tr('再收获生长'),5:tr('再次收获生长'),6:tr('树桩'),7:tr('树桩'),8:tr('坑洞'),9:tr('枯萎可收获'),10:tr('等待收获季节')};
export function cropGrowth(doc:SerDocument,edits:MapEdits,scene:number,id:number) {
  const cell=mapCells(doc).find(c=>c.id===id),paint=edits.cells?.[`${scene}:${id}`];
  const crop=crops.find(c=>c.numeric_id===(paint?.crop!==undefined?paint.crop:cell?.crop));
  if(!crop||paint?.soil===0)return null;
  const entity=(artData.crops as Record<string,{states?:Record<string,number[][]>}>)[crop.numeric_id];
  const forms=entity?.states??{},read=(path:string,fallback:number)=>{const n=cell&&doc.resolve(`p/pCropsStatus_/p/${path}`,cell.node);return n?Number(readSigned(doc,n)):fallback;};
  const form=paint?.form??(paint?.crop!==undefined?1:read('formID_',1)),growth=paint?.growth??(paint?.crop!==undefined?0:cell?storedGrowth(doc,cell.node):0);
  const stages=forms[form]??[],maximum=stages.at(-1)?.[0]??0;
  const stage=Math.max(0,stages.findLastIndex(s=>s[0]<=growth));
  const growing=[1,4,5].includes(form)&&maximum>0;
  return {crop,form,growth,forms,stages,stage,maximum,days:growing?Math.ceil(Math.max(0,maximum-growth)/100):null};
}
export function cropSoils(id:number):number[]{return (data.cropRules as Record<string,{soils:number[]}>)[id]?.soils??[];}
/** The soil a crop needs on a cell that currently has `soil` (0 = plain ground), or undefined when it can stay. */
export function soilForCrop(id:number,soil:number):number|undefined {
  const allowed=cropSoils(id);
  if(!allowed.length)return soil===3?1:undefined;
  return allowed.includes(soil)?undefined:allowed[0];
}
export function cropPlacementProblem(id:number,soil:number) {
  const allowed=cropSoils(id);
  if(allowed.length&&!allowed.includes(soil))return allowed.includes(3)?tr('这种作物需要水田，请先使用水渠／水田工具。'):tr('这种作物不能种在水田，请先改为耕地或田垄。');
  if(!allowed.length&&soil===3)return tr('这种作物不能种在水田。');
  return null;
}
export function placementProblem(doc: SerDocument, edits: MapEdits, placement: ObjectPlacement): string | null {
  const spec=data.objects.find(s=>s.id===placement.template),terrain=sceneCells(placement.scene);
  const original=placement.move?mapObjects(doc).find(o=>o.uid===placement.move):undefined;
  const homeUpgrade=!!original&&!!spec?.code.includes('ARCHITECTURE_MYHOUSE_')&&!!original.spec?.code.includes('ARCHITECTURE_MYHOUSE_')&&placement.cell===landId(original.x,original.y)&&spec.level>original.spec.level;
  if(homeUpgrade)return null;
  if(spec?.code.includes('ARCHITECTURE_MYHOUSE_'))return tr('自宅只能在原位置升级。');
  const target=terrain.find(c=>c.id===placement.cell);
  if (!target || !spec) return tr('此位置不可放置。');
  if (!areaAvailable(doc,target.area)) return tr('此田地尚未购买。');
  const fs=spec.features,indoor=placement.scene!==100000001;
  if ((spec.building || fs.includes('PLACEMENT_GARDEN_ONLY')) && indoor) return tr('只能放在室外庭院。');
  if (fs.includes('PLACEMENT_INDOOR_ONLY') && !indoor) return tr('只能放在室内。');
  if (fs.includes('PLACEMENT_MYHOUSE_ONLY') && !data.scenes.find(s=>s.id===placement.scene)?.code.includes('MYHOUSE')) return tr('只能放在自宅。');
  if (fs.includes('TREE') && !matureTreeAt(doc,edits,target.id,placement.scene)) return tr('树液采集器需要放在成熟树木所在的地块。');
  if (fs.includes('PLACEMENT_ARC_LIVESTOCK_ONLY') && !/LIVESTOCK|AVIARY/.test(data.scenes.find(s=>s.id===placement.scene)?.code??'')) return tr('只能放在畜舍或鸡舍内。');
  const specialMask=fs.includes('PLACEMENT_FISHING')?256:fs.includes('PLACEMENT_BIND_TRAP')?512:fs.includes('PLACEMENT_BOX_TRAP')?1024:fs.includes('PLACEMENT_SPRINKLING_BAIT')?2048:0;
  if(specialMask&&(!(target.mask&specialMask)||(target.mask&4096)&&fs.includes('TRAP')))return fs.includes('PLACEMENT_FISHING')?tr('捕蟹笼只能放在允许设笼的钓鱼水域。'):tr('这里不是这种陷阱或鱼饵的可放置地点。');
  const soil=edits.cells?.[`${placement.scene}:${target.id}`]?.soil??mapCells(doc).find(c=>c.id===target.id)?.soil;
  if(soil===3&&!spec.building&&!spec.floor&&!fs.includes('SCARECROW'))return tr('水田内不能放置这类设施，请先恢复平地。');
  const mask=specialMask|| (spec.building?4:fs.includes('PLACEMENT_WALL_ONLY')?128:fs.includes('PLACEMENT_GARDEN_ONLY')?64:fs.includes('PLACEMENT_FARMING_ONLY')?1:2);
  const polygons=footprint(spec,target,placement.angle??45);
  const points=polygons.flat();
  const parity=(Math.round(target.x/45)+Math.round(target.y/45))%2;
  const valid=new Map(terrain.map(c=>[`${c.x},${c.y}`,c]));
  for(let x=Math.floor(Math.min(...points.map(p=>p.x))/45)*45;x<=Math.max(...points.map(p=>p.x));x+=45)
    for(let y=Math.floor(Math.min(...points.map(p=>p.y))/45)*45;y<=Math.max(...points.map(p=>p.y));y+=45) {
      if(fs.includes('PLACEMENT_WALL_ONLY') || (Math.round(x/45)+Math.round(y/45))%2!==parity || !polygons.some(poly=>containsPoint(poly,{x,y}))) continue;
      const c=valid.get(`${x},${y}`);
      if(!c || !areaAvailable(doc,c.area) || (!fs.includes('PLACEMENT_ANYWHERE') && !(c.mask&mask))) return tr('物体完整占地越过可放置边界。');
    }
  if (!(target.mask&mask) && !fs.includes('PLACEMENT_ANYWHERE')) return tr('此地面不允许放置这类物体。');
  const all=draftObjects(doc,edits).filter(o=>o.uid!==placement.move);
  if (spec.building && all.some(o=>o.spec?.building && (spec.mapId ? o.spec.buildingFamily===spec.buildingFamily && o.spec.slot===spec.slot : o.spec.buildingFamily===spec.buildingFamily && spec.limit===1))) return tr('此编号的建筑已存在。');
  for(const o of all) {
    if(!o.spec && !o.blocksPlacement || o.parent)continue;
    const overlaps=polygons.some(a=>objectFootprint(o).some(b=>polygonsOverlap(a,b)));
    if(!overlaps)continue;
    if(spec.building && o.movable && !o.spec?.building)continue;
    if(spec.floor && o.spec?.floor && Math.hypot(o.x-target.x,o.y-target.y)<1)return tr('这里已有地板，请先清除地板层。');
    // Facilities may stand on a floor, but a floor is not slid under something already standing there.
    if(spec.floor && !o.spec?.floor)return tr('这里有设施或树木，请先清除再铺地板。');
    if(spec.floor || o.spec?.floor || fs.includes('OVERLAPABLE') || o.spec?.features.includes('OVERLAPABLE'))continue;
    if(fs.includes('PLACEMENT_IGNORE_COLLISION'))continue;
    return tr('物体占地与现有设施重叠。');
  }
  if(spec.floor) {
    const saved=mapCells(doc).find(c=>c.id===target.id),edit=edits.cells?.[`${placement.scene}:${target.id}`];
    if(edit?.crop!==undefined?edit.crop:saved?.crop)return tr('这里有作物，请先清除再铺地板。');
  }
  if(!spec.floor && !spec.building && !fs.includes('TREE')) for(const c of mapCells(doc)) {
    const edit=edits.cells?.[`${placement.scene}:${c.id}`];
    if((edit?.crop!==undefined?edit.crop:c.crop) && polygons.some(poly=>containsPoint(poly,landPosition(c.id))))return tr('物体占地内有作物，请先清除或选择空地。');
  }
  if(!spec.floor&&!spec.building&&!fs.includes('TREE'))for(const [key,edit] of Object.entries(edits.cells??{})) {
    const [scene,id]=key.split(':').map(Number);
    if(scene===placement.scene&&edit.crop&&polygons.some(poly=>containsPoint(poly,landPosition(id))))return tr('物体占地内有作物，请先清除或选择空地。');
  }
  return null;
}

/** Terrain-only overlay: object collisions and full footprints remain in placementProblem. */
export function allowedMapTerrain(doc:SerDocument,edits:MapEdits,scene:number,tool:string,template=0,crop=0) {
  const spec=tool==='place'?data.objects.find(o=>o.id===template):undefined,fs=spec?.features??[];
  const indoor=scene!==100000001,code=data.scenes.find(s=>s.id===scene)?.code??'';
  if(spec&&((spec.building||fs.includes('PLACEMENT_GARDEN_ONLY'))&&indoor||fs.includes('PLACEMENT_INDOOR_ONLY')&&!indoor||fs.includes('PLACEMENT_MYHOUSE_ONLY')&&!code.includes('MYHOUSE')||fs.includes('PLACEMENT_ARC_LIVESTOCK_ONLY')&&!/LIVESTOCK|AVIARY/.test(code)))return [];
  const farming=['plant','water','soil','ridge','canal'].includes(tool);
  const special=fs.includes('PLACEMENT_FISHING')?256:fs.includes('PLACEMENT_BIND_TRAP')?512:fs.includes('PLACEMENT_BOX_TRAP')?1024:fs.includes('PLACEMENT_SPRINKLING_BAIT')?2048:0;
  const mask=farming?1:special||(spec?.building?4:fs.includes('PLACEMENT_WALL_ONLY')?128:fs.includes('PLACEMENT_GARDEN_ONLY')?64:fs.includes('PLACEMENT_FARMING_ONLY')?1:2);
  const saved=new Map(mapCells(doc).map(c=>[c.id,c])),areas=new Map<number,boolean>();
  const trees=new Set(crops.filter(c=>c.id.startsWith('CROPS_ID_OBJECT_TREE')).map(c=>c.numeric_id));
  return sceneCells(scene).filter(c=>{
    if(!areas.has(c.area))areas.set(c.area,areaAvailable(doc,c.area));
    if(!areas.get(c.area)||(!(c.mask&mask)&&!fs.includes('PLACEMENT_ANYWHERE')))return false;
    if(special&&(c.mask&4096)&&fs.includes('TRAP'))return false;
    const soil=edits.cells?.[`${scene}:${c.id}`]?.soil??saved.get(c.id)?.soil??1;
    if(tool==='plant'&&cropPlacementProblem(crop,soil))return false;
    if(!farming&&soil===3&&!spec?.building&&!fs.includes('SCARECROW'))return false;
    if(fs.includes('TREE')) {
      const edit=edits.cells?.[`${scene}:${c.id}`],crop=edit?.crop!==undefined?edit.crop:saved.get(c.id)?.crop;
      if(!crop||!trees.has(crop)||!matureTreeAt(doc,edits,c.id,scene))return false;
    }
    return true;
  });
}
/** Expand building clearing into the same undoable draft as its placement. */
export function addMapPlacement(doc: SerDocument, edits: MapEdits, placement: ObjectPlacement): MapEdits {
  const original=placement.move?draftObjects(doc,edits).find(o=>o.uid===placement.move):undefined;
  placement={...placement,angle:placement.angle??original?.angle??45};
  const draftIndex=placement.move?.startsWith('new:')?Number(placement.move.slice(4)):undefined;
  const base={...edits,objects:(edits.objects??[]).filter((e,i)=>draftIndex!==undefined?i!==draftIndex:!placement.move || e.move!==placement.move)};
  if(draftIndex!==undefined)placement={...placement,move:undefined};
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
  // An empty field under a new floor is turned back into plain ground first.
  if(spec.floor) {
    const key=`${placement.scene}:${placement.cell}`;
    if(next.cells?.[key]?.soil??mapCells(doc).find(c=>c.id===placement.cell)?.soil)next.cells![key]={crop:null,soil:0,watered:false};
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
      if(!room)throw new Error(tr('新建筑的室内布局尚未解析，不能迁移室内物品。'));
      const x=(old[0]+old[2])/2,y=(old[1]+old[3])/2;
      const desired={x:(room[0]+room[2])/2+(spec.mirror!==oldSpec.mirror?x-item.x:item.x-x),y:(room[1]+room[3])/2+item.y-y};
      const candidates=sceneCells(spec.mapId).filter(c=>c.x>=room[0]&&c.x<=room[2]&&c.y>=room[1]&&c.y<=room[3]).sort((a,b)=>Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y));
      const draftIndex=item.uid.startsWith('new:')?Number(item.uid.slice(4)):undefined;
      const base={...next,objects:next.objects!.filter((e,i)=>draftIndex===undefined?e.move!==item.uid:i!==draftIndex)};
      const move={scene:spec.mapId,template:item.id,angle:item.angle,...(draftIndex===undefined?{move:item.uid}:{})};
      const cell=candidates.find(c=>!placementProblem(doc,base,{...move,cell:c.id}));
      if(!cell)throw new Error(tr('新房间没有足够位置安置「{name}」，请先整理室内。',{name:item.spec?.name??tr('室内物品')}));
      next={...base,objects:[...base.objects,{...move,cell:cell.id}]};
    }
  }

  return next;
}

export type MapChangeKind = 'plant' | 'growth' | 'clearCrop' | 'clearSoil' | 'soil' | 'water' | 'place' | 'move' | 'upgrade' | 'remove';
/** Map drafts of one kind and subject, for the review list; `cells`, `objects` and `removed` say what undoing the group drops. */
export interface MapChangeGroup { key: string; kind: MapChangeKind; count: number; crop?: number; soil?: number; watered?: boolean; template?: number; from?: number; growth?: { form: number; stage: number; stages: number; mature: boolean }; cells: string[]; objects: number[]; removed: string[] }
export function mapChangeGroups(doc: SerDocument, edits: MapEdits): MapChangeGroup[] {
  const groups = new Map<string, MapChangeGroup>(), cells = new Map(mapCells(doc).map(c => [c.id, c])), objects = new Map(mapObjects(doc).map(o => [o.uid, o]));
  const add = (base: Omit<MapChangeGroup, 'key' | 'count' | 'cells' | 'objects' | 'removed'>, part: { cell?: string; object?: number; removed?: string }) => {
    const key = [base.kind, base.crop, base.soil, base.watered, base.template, base.from, base.growth && `${base.growth.form}.${base.growth.stage}`].join(':');
    const group = groups.get(key) ?? { ...base, key, count: 0, cells: [], objects: [], removed: [] };
    group.count++;
    if (part.cell) group.cells.push(part.cell);
    if (part.object !== undefined) group.objects.push(part.object);
    if (part.removed) group.removed.push(part.removed);
    groups.set(key, group);
  };
  for (const [cell, paint] of Object.entries(edits.cells ?? {})) {
    const old = cells.get(Number(cell.split(':')[1])), crop = old?.crop || undefined;
    if (paint.soil === 0) add({ kind: 'clearSoil' }, { cell });
    else if (typeof paint.crop === 'number') add({ kind: 'plant', crop: paint.crop }, { cell });
    else if (paint.crop === null) add({ kind: 'clearCrop', crop }, { cell });
    else if (paint.growth !== undefined || paint.form !== undefined) {
      const [scene, id] = cell.split(':').map(Number), state = cropGrowth(doc, edits, scene, id);
      add({ kind: 'growth', crop, growth: state ? { form: state.form, stage: state.stage, stages: state.stages.length, mature: state.days === 0 } : undefined }, { cell });
    }
    else if (paint.soil !== undefined) add({ kind: 'soil', soil: paint.soil }, { cell });
    else if (paint.watered !== undefined) add({ kind: 'water', watered: paint.watered }, { cell });
  }
  (edits.objects ?? []).forEach((placement, index) => {
    const from = placement.move ? objects.get(placement.move)?.id : undefined;
    add(!placement.move ? { kind: 'place', template: placement.template } : from === placement.template ? { kind: 'move', template: placement.template } : { kind: 'upgrade', template: placement.template, from }, { object: index });
  });
  for (const uid of edits.removed ?? []) add({ kind: 'remove', template: objects.get(uid)?.id }, { removed: uid });
  const order: MapChangeKind[] = ['place', 'upgrade', 'move', 'remove', 'plant', 'growth', 'clearCrop', 'clearSoil', 'soil', 'water'];
  return [...groups.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
export function withoutMapChanges(edits: MapEdits, group: MapChangeGroup): MapEdits {
  const cells = { ...edits.cells };
  for (const key of group.cells) delete cells[key];
  return { ...edits, cells, objects: (edits.objects ?? []).filter((_, index) => !group.objects.includes(index)), removed: (edits.removed ?? []).filter(uid => !group.removed.includes(uid)) };
}

export type ClearLayer = 'crops' | 'floor' | 'objects' | 'soil' | 'reset';
export function clearMapArea(doc: SerDocument, edits: MapEdits, scene: number, cellIds: number[], keys: string[], layer: ClearLayer): MapEdits {
  const ids=new Set(cellIds),next:MapEdits={...edits,cells:{...edits.cells},removed:[...(edits.removed??[])]};
  // 'soil' turns tilled cells back into plain ground (a crop cannot stay without soil) but keeps objects standing there.
  if(layer==='crops'||layer==='soil'||layer==='reset')for(const c of sceneCells(scene))if(ids.has(c.id)&&(c.mask&1)&&areaAvailable(doc,c.area))
    next.cells![`${scene}:${c.id}`]=layer==='crops'?{...next.cells![`${scene}:${c.id}`],crop:null,growth:undefined,form:undefined}:{crop:null,soil:0,watered:false};
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
  if (!cellList || !objectList || !seedNode) throw new Error(tr('此存档缺少地图结构。'));
  let seed = readSigned(doc, seedNode);
  const world = captureBuilt(doc, cellList, true), gimmicks = captureBuilt(doc, objectList, true);
  const patch = (target: SerBuiltNode, path: string, value: number, floating = false) => {
    const node = builtChild(target, path); if (!node?.payload) throw new Error(tr('地图模板缺少 {path}', { path }));
    node.payload = floating ? encodeFloat(value, node.payload.length) : encodeSigned(BigInt(value), node.payload.length);
  };
  const occupied = objects.filter(o=>!edits.removed?.includes(o.uid)).map(o => ({ ...o, bounds: [...o.bounds] }));
  for(const uid of edits.removed??[]) {
    const object=objects.find(o=>o.uid===uid);
    if(!object?.movable) throw new Error(tr('不能清理固定场景物体。'));
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
    if(!target || !spec || !donor || (placement.move && ((!moving?.movable&&!homeUpgrade) || (!homeUpgrade&&moving!.id!==spec.id && moving!.spec?.buildingFamily!==spec.buildingFamily))))throw new Error(tr('此位置不可放置，或无法建立物体结构（{template} / {move}）。',{template:placement.template,move:placement.move??tr('新增')}));
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
    const entity=(artData.objects as Record<string,{initial?:number;directional?:boolean;aabb?:Record<string,number[]>}>)[spec.id];
    const code=[6,3,2,1,4,7,8,9][((Math.round(angle/45)%8)+8)%8];
    // The game stores the uncropped bounds of the facing's first frame, not the visible sprite.
    const box=entity?.aabb?.[String((entity.initial??100)+(entity.directional?code:0))]??(entity?.aabb?Object.values(entity.aabb)[0]:undefined);
    if(box)(['l','t','r','b'] as const).forEach((key,i)=>patch(built,`p/baseAABB_/${key}`,box[i],true));
    // gimmick_cobblestones plays its placement sound once and then records se=1.
    if(!moving&&spec.script==='gimmick_cobblestones'){
      const status=builtChild(built,'p/statusValueMap_');
      if(status){status.children=[{tag:SerTag.Object,nameOffset:-1,name:'0k',children:[{tag:SerTag.Scalar,nameOffset:-1,name:'id_',payload:encodeSigned(0x6573n,8)}]},{tag:SerTag.Scalar,nameOffset:-1,name:'0v',payload:encodeSigned(1n,4)}];status.ref=1;}
    }
    patch(built, 'p/pos_/x', target.x, true); patch(built, 'p/pos_/y', target.y, true);
    if (moving) { moving.x = target.x; moving.y = target.y; moving.id=spec.id; moving.spec=spec; moving.angle=angle; }
    else occupied.push({ ...donor, id: placement.template, spec, uid: String(seed), x: target.x, y: target.y, angle, bounds: [...donor.bounds] });
  }
  // Items on furniture travel with it, and are cleared with it.
  const placed = new Map(editedObjects(doc, edits).map(o => [o.uid, o]));
  for (const o of objects) {
    if (!o.parent) continue;
    const next = placed.get(o.uid), built = gimmicks.children![doc.children(objectList).findIndex(n => n.offset === o.node.offset)];
    if (!next) patch(built, 'p/isEnabled_', 0);
    else if (next.carried) { patch(built, 'p/pos_/x', next.x, true); patch(built, 'p/pos_/y', next.y, true); }
  }
  // growth_ is a clamped range: the game keeps min_ at 0 and max_ at the last
  // threshold of the current form, and clamps value_ to it when loading.
  const syncGrowthRange = (built: SerBuiltNode, scene: number, id: number) => {
    const state = cropGrowth(doc, edits, scene, id);
    if (!state) return;
    patch(built, 'p/pCropsStatus_/p/growth_/min_', 0);
    patch(built, 'p/pCropsStatus_/p/growth_/max_', state.maximum);
  };
  for (const [key, paint] of Object.entries(edits.cells ?? {})) {
    const [sceneId, id] = key.split(':').map(Number), terrain = sceneCells(sceneId).find(c => c.id === id);
    const growthOnly=paint.crop===undefined&&paint.soil===undefined&&paint.watered===undefined&&(paint.growth!==undefined||paint.form!==undefined);
    if (!growthOnly&&(!terrain || !(terrain.mask & 1) || !areaAvailable(doc, terrain.area))) throw new Error(tr('目标不在已开放的可耕作区域。'));
    const oldCell=cells.find(c=>c.id===id),cropId=paint.crop!==undefined?paint.crop:oldCell?.crop;
    const soil=paint.soil??oldCell?.soil??1;
    if(cropId&&paint.soil!==0&&(paint.crop!==undefined||paint.soil!==undefined)){const problem=cropPlacementProblem(cropId,soil);if(problem)throw new Error(problem);}
    if(paint.growth!==undefined||paint.form!==undefined){const state=cropGrowth(doc,edits,sceneId,id);if(!state||!state.stages.length||state.growth>state.maximum)throw new Error(tr('此作物不支持所选生长阶段。'));}
    const clearingOnly = paint.crop === null && paint.soil === undefined && paint.watered === undefined;
    if(growthOnly){
      if(!oldCell)throw new Error(tr('此处没有可修改的作物。'));
      const built=world.children![doc.children(cellList).findIndex(n=>n.offset===oldCell.node.offset)];
      if(paint.growth!==undefined)patch(built,'p/pCropsStatus_/p/growth_/this->value_',paint.growth);
      if(paint.form!==undefined)patch(built,'p/pCropsStatus_/p/formID_',paint.form);
      syncGrowthRange(built,sceneId,id);
      continue;
    }
    if (!clearingOnly && paint.soil!==0 && occupied.some(o => o.blocksPlacement && !o.spec?.floor && objectFootprint(o).some(poly=>containsPoint(poly,terrain!)))) throw new Error(tr('田地被设施占用。'));
    let entry = cells.find(c => c.id === id);
    if(paint.soil===0) {
      if(entry) {
        const built=world.children![doc.children(cellList).findIndex(n=>n.offset===entry!.node.offset)],parent=builtChild(built,'p')!;
        for(const name of ['pFarmlandStatus_','pCropsStatus_','pSubCropsStatus_']){const i=parent.children!.findIndex(n=>n.name===name);if(i>=0)parent.children![i]=nullPointer(parent.children![i].nameOffset,name);}
      }
      continue;
    }
    const donor = cells.find(c => c.soil && c.crop && MAP_CROPS.some(crop => crop.numeric_id === c.crop));
    if (!donor) throw new Error(tr('请先在游戏中耕地并种下一株作物，作为田地模板。'));
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
    if(paint.growth!==undefined)patch(built,'p/pCropsStatus_/p/growth_/this->value_',paint.growth);
    if(paint.form!==undefined)patch(built,'p/pCropsStatus_/p/formID_',paint.form);
    if(paint.crop!==null&&builtChild(built,'p/pCropsStatus_/p'))syncGrowthRange(built,sceneId,id);
    if (paint.soil !== undefined) patch(built, 'p/pFarmlandStatus_/p/pData_/dataID', paint.soil);
    if (paint.watered !== undefined) patch(built, 'p/pFarmlandStatus_/p/water_/this->value_', paint.watered ? 1 : 0);
  }
  if (Object.keys(edits.cells ?? {}).length) { world.ref = world.children!.length / 2; subtrees.set(cellList.offset, world); }
  if (edits.objects?.length || edits.removed?.length) { gimmicks.ref = gimmicks.children!.length; subtrees.set(objectList.offset, gimmicks); payloads.set(seedNode.offset, encodeSigned(seed, seedNode.size)); }
  return serializeSer(doc, { subtrees, payloads });
}

/* Full layouts: every tilled cell and movable object, so a farm can be backed up or rebuilt in another save. */
export interface LayoutCell { scene: number; cell: number; soil: number; crop: number | null; growth?: number; form?: number; watered: boolean }
export interface LayoutObject { scene: number; cell: number; template: number; angle: number }
export interface MapLayout { version: 2; game: 'honogurashi'; cells: LayoutCell[]; objects: LayoutObject[] }
export interface LayoutImport { edits: MapEdits; placed: number; skipped: number; kept: number }

const FARM_ID = data.scenes.find(s => s.code === 'MAP_ID_OPENWORLD')!.id;
const sceneIndexes = new Map<number, Map<number, ReturnType<typeof sceneCells>[number]>>();
function sceneCell(scene: number, id: number) {
  let index = sceneIndexes.get(scene);
  if (!index) sceneIndexes.set(scene, index = new Map(sceneCells(scene).map(c => [c.id, c])));
  return index.get(id);
}
let cellScenes: Map<number, number> | undefined;
/** Rooms use separate world coordinates, so a cell ID identifies its scene; the open farm wins ties. */
function sceneOfCell(id: number) {
  if (!cellScenes) {
    cellScenes = new Map();
    for (const scene of [...data.scenes].sort((a, b) => Number(b.id === FARM_ID) - Number(a.id === FARM_ID)))
      for (const c of sceneCells(scene.id)) if (!cellScenes.has(c.id)) cellScenes.set(c.id, scene.id);
  }
  return cellScenes.get(id) ?? FARM_ID;
}
const layoutObject = (spec?: typeof data.objects[number]) => !!spec && !spec.code.includes('ARCHITECTURE_MYHOUSE_');

export function exportMapLayout(doc: SerDocument, edits: MapEdits): MapLayout {
  const saved = new Map(mapCells(doc).map(c => [c.id, c]));
  const keys = new Map<string, { scene: number; id: number }>();
  for (const id of saved.keys()) keys.set(`${sceneOfCell(id)}:${id}`, { scene: sceneOfCell(id), id });
  for (const key of Object.keys(edits.cells ?? {})) { const [scene, id] = key.split(':').map(Number); keys.set(key, { scene, id }); }
  const value = (node: SerNode | undefined, path: string) => { const n = node && doc.resolve(path, node); return n ? Number(readSigned(doc, n)) : undefined; };
  const cells: LayoutCell[] = [];
  for (const [key, { scene, id }] of keys) {
    const old = saved.get(id), paint = edits.cells?.[key];
    const soil = paint?.soil ?? old?.soil ?? 1;
    if (!soil) continue;
    const raw = paint?.crop !== undefined ? paint.crop : old?.crop || null;
    const crop = raw && MAP_CROPS.some(c => c.numeric_id === raw) ? raw : null, fresh = paint?.crop !== undefined;
    cells.push({ scene, cell: id, soil, crop, ...(crop ? {
      growth: paint?.growth ?? (fresh || !old ? 0 : storedGrowth(doc, old.node)),
      form: paint?.form ?? (fresh ? 1 : value(old?.node, 'p/pCropsStatus_/p/formID_') ?? 1)
    } : {}), watered: paint?.watered ?? !!value(old?.node, 'p/pFarmlandStatus_/p/water_/this->value_') });
  }
  const objects = draftObjects(doc, edits).filter(o => o.movable && layoutObject(o.spec)).map(o => {
    const draft = o.uid.startsWith('new:') ? edits.objects?.[Number(o.uid.slice(4))] : edits.objects?.findLast(e => e.move === o.uid);
    const cell = draft?.cell ?? landId(o.x, o.y);
    return { scene: draft?.scene ?? sceneOfCell(cell), cell, template: o.id, angle: o.angle };
  });
  return { version: 2, game: 'honogurashi', cells, objects };
}

export function parseMapLayout(text: string): MapLayout {
  if (text.length > 5_000_000) throw new Error(tr('布局文件过大。'));
  const layout = JSON.parse(text);
  if (layout?.version !== 2 || layout?.game !== 'honogurashi' || !Array.isArray(layout.cells) || !Array.isArray(layout.objects)) throw new Error(tr('布局文件格式不兼容。'));
  if (layout.cells.length > 20000 || layout.objects.length > 5000) throw new Error(tr('布局文件超出编辑上限。'));
  const int = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
  for (const c of layout.cells)
    if (!c || !int(c.scene, 0, 2 ** 31) || !int(c.cell, 0, 2 ** 40) || ![1, 2, 3].includes(c.soil) || typeof c.watered !== 'boolean' || (c.crop !== null && !MAP_CROPS.some(crop => crop.numeric_id === c.crop))
      || (c.growth !== undefined && !int(c.growth, 0, 1_000_000)) || (c.form !== undefined && !int(c.form, 1, 10))) throw new Error(tr('布局文件含无效田地。'));
  for (const o of layout.objects)
    if (!o || !int(o.scene, 0, 2 ** 31) || !int(o.cell, 0, 2 ** 40) || !data.objects.some(s => s.id === o.template) || !Number.isFinite(o.angle) || o.angle % 45 !== 0) throw new Error(tr('布局文件含无效物体。'));
  return layout as MapLayout;
}

function holdsItems(doc: SerDocument, node: SerNode) {
  const list = doc.resolve('p/itemList_', node);
  return !!list && doc.children(list).some(slot => doc.children(slot).some(child => child.tag === SerTag.Object));
}

/** Rebuild this save's farm from a layout: reuse matching objects, clear the rest, skip what the save cannot hold. */
export function importMapLayout(doc: SerDocument, layout: MapLayout): LayoutImport {
  let skipped = 0;
  const cells: Record<string, CellPaint> = {};
  const wanted = new Set(layout.cells.map(c => `${c.scene}:${c.cell}`));
  for (const old of mapCells(doc)) {
    const scene = sceneOfCell(old.id), key = `${scene}:${old.id}`, terrain = sceneCell(scene, old.id);
    // Untilled ground keeps its debris and wild trees; only farmland outside the layout is reset.
    if (old.soil && !wanted.has(key) && terrain && (terrain.mask & 1) && areaAvailable(doc, terrain.area)) cells[key] = { crop: null, soil: 0, watered: false };
  }
  for (const c of layout.cells) {
    const terrain = sceneCell(c.scene, c.cell);
    if (!terrain || !(terrain.mask & 1) || !areaAvailable(doc, terrain.area) || (c.crop && cropPlacementProblem(c.crop, c.soil))) { skipped++; continue; }
    cells[`${c.scene}:${c.cell}`] = { soil: c.soil, crop: c.crop, watered: c.watered };
  }
  for (const c of layout.cells) {
    const key = `${c.scene}:${c.cell}`, paint = cells[key];
    if (!paint?.crop || (c.growth === undefined && c.form === undefined)) continue;
    const staged = { ...paint, growth: c.growth, form: c.form };
    const state = cropGrowth(doc, { cells: { ...cells, [key]: staged } }, c.scene, c.cell);
    if (state?.stages.length && state.growth <= state.maximum) cells[key] = staged;
  }
  // Cells that already match the layout need no edit.
  const current = new Map(exportMapLayout(doc, {}).cells.map(c => [`${c.scene}:${c.cell}`, c]));
  for (const c of layout.cells) {
    const key = `${c.scene}:${c.cell}`, now = current.get(key), paint = cells[key];
    if (paint && now && now.soil === paint.soil && now.crop === paint.crop && now.watered === paint.watered && (!paint.crop || (now.growth === (paint.growth ?? 0) && now.form === (paint.form ?? 1)))) delete cells[key];
  }
  const pool = mapObjects(doc).filter(o => o.movable && layoutObject(o.spec));
  const used = new Set<string>();
  const building = (template: number) => Number(!!data.objects.find(s => s.id === template)?.building);
  // An object already standing where the layout wants it stays untouched, even where the editor could not place it.
  const order = [...layout.objects].sort((a, b) => building(b.template) - building(a.template));
  const rest = order.filter(o => {
    const same = pool.find(p => p.id === o.template && !used.has(p.uid) && landId(p.x, p.y) === o.cell && p.angle === o.angle);
    if (same) used.add(same.uid);
    return !same;
  });
  let pending: ObjectPlacement[] = rest.map(o => {
    const at = landPosition(o.cell);
    const match = pool.filter(p => p.id === o.template && !used.has(p.uid)).sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
    if (match) used.add(match.uid);
    return { scene: o.scene, cell: o.cell, template: o.template, angle: o.angle, ...(match ? { move: match.uid } : {}) };
  });
  const leftover = pool.filter(p => !used.has(p.uid));
  const kept = leftover.filter(p => holdsItems(doc, p.node));
  let edits: MapEdits = { cells, removed: leftover.filter(p => !kept.includes(p)).map(p => p.uid), objects: [] };
  // Objects still at their old spot can block each other; retry until no placement makes progress.
  for (let progress = true; pending.length && progress;) {
    progress = false;
    const failed: ObjectPlacement[] = [];
    for (const placement of pending) {
      try { edits = addMapPlacement(doc, edits, placement); progress = true; }
      catch { failed.push(placement); }
    }
    pending = failed;
  }
  skipped += pending.length;
  return { edits, placed: layout.objects.length - pending.length, skipped, kept: kept.length };
}
