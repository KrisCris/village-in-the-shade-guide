import { MAP_DATA, landPosition, mapCells, mapObjects, editedObjects, sceneCells, storedGrowth, type MapEdits } from './saveMap';
import { readSigned, type SerDocument } from './ser';
import { splitGameTime } from './saveTime';
import { flagEnabled } from './saveProgress';
import { tr } from '../i18n/active';

export interface SpriteArt {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ArtEntity {
  model: string;
  seasons: Record<string, SpriteArt>[];
  states?: Record<string, number[][]>;
  initial?: number;
  directional?: boolean;
  mirror?: boolean;
  replacement?: number;
  hidden?: boolean;
  mapId?: number;
}
export interface RoomFixture extends Point { id: number; require: number; art: SpriteArt }
export interface RoomArt { file: string; scenery?: string; bounds: number[]; fixtures?: RoomFixture[] }
export interface MapArt {
  bounds: number[];
  seasons: string[];
  crops: Record<string, ArtEntity>;
  objects: Record<string, ArtEntity>;
  soils?: Record<string, SpriteArt>;
  rooms?: Record<string, RoomArt[]>;
  background?: string;
  /** Walls, fences, roofs and trees, drawn over the background with the same bounds. */
  scenery?: string;
  fixtures?: RoomFixture[];
  fixedObjects?: (Point & { id: number; name: string; angle: number; require: number })[];
}
export interface SceneGround extends Point {
  id: number;
  soil: number;
  watered: boolean;
  edited: boolean;
}
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface SceneSprite extends Point {
  key: string;
  id: number;
  kind: 'crop' | 'object';
  art?: SpriteArt;
  edited: boolean;
  floor: boolean;
  uid?: string;
  cell?: number;
  movable?: boolean;
  /** Mirrored buildings store their contents flipped; the game draws those sprites flipped too. */
  mirror?: boolean;
  /** Stands on another object and moves with it. */
  carried?: boolean;
  /** Draw-order key when it differs from y: items on furniture draw right after the furniture. */
  depth?: number;
}
export const FARM_SCENE = MAP_DATA.scenes.find((s) => s.code === 'MAP_ID_OPENWORLD')!.id;
export const FARM_CELLS = sceneCells(FARM_SCENE);
export const FARM_REGIONS = [
  { id: 1, name: tr('住宅旁'), description: tr('北边 · L 形田地') },
  { id: 2, name: tr('西边田地'), description: tr('中部 · 第二块田') },
  { id: 4, name: tr('南边田地'), description: tr('下方 · 第三块田') },
  { id: 8, name: tr('东边田地'), description: tr('右侧 · 追加农地（1.2.0）') }
].map((region) => {
  const cells = FARM_CELLS.filter((c) => c.area === region.id);
  return {
    ...region,
    bounds: [
      Math.min(...cells.map((c) => c.x)) - 240,
      Math.min(...cells.map((c) => c.y)) - 500,
      Math.max(...cells.map((c) => c.x)) + 400,
      Math.max(...cells.map((c) => c.y)) + 220
    ]
  };
});
export const FARM_BOUNDS = [8100, 19300, 16500, 26600];
export const worldToScreen = (p: Point, c: Camera, width: number, height: number): Point => ({
  x: (p.x - c.x) * c.zoom + width / 2,
  y: (p.y - c.y) * c.zoom + height / 2
});
export const screenToWorld = (p: Point, c: Camera, width: number, height: number): Point => ({
  x: (p.x - width / 2) / c.zoom + c.x,
  y: (p.y - height / 2) / c.zoom + c.y
});
export function fitCamera(bounds: number[], width: number, height: number): Camera {
  return {
    x: (bounds[0] + bounds[2]) / 2,
    y: (bounds[1] + bounds[3]) / 2,
    zoom: Math.max(
      0.035,
      Math.min(1.8, Math.min(width / (bounds[2] - bounds[0]), height / (bounds[3] - bounds[1])) * 0.92)
    )
  };
}
export function zoomCamera(
  camera: Camera,
  factor: number,
  pointer: Point,
  width: number,
  height: number
): Camera {
  const before = screenToWorld(pointer, camera, width, height),
    zoom = Math.max(0.035, Math.min(2, camera.zoom * factor));
  return {
    x: before.x - (pointer.x - width / 2) / zoom,
    y: before.y - (pointer.y - height / 2) / zoom,
    zoom
  };
}
const cellIndex = new Map(FARM_CELLS.map((c) => [`${c.x},${c.y}`, c]));
export function pickFarmCell(p: Point, cells = FARM_CELLS) {
  const index = cells === FARM_CELLS ? cellIndex : new Map(cells.map(c => [`${c.x},${c.y}`, c]));
  const x = Math.round(p.x / 45) * 45,
    y = Math.round(p.y / 45) * 45;
  return [
    [x, y],
    [x - 45, y],
    [x + 45, y],
    [x, y - 45],
    [x, y + 45]
  ]
    .map(([a, b]) => index.get(`${a},${b}`))
    .filter((c) => c && Math.abs(c.x - p.x) + Math.abs(c.y - p.y) <= 45.01)
    .sort((a, b) => Math.hypot(a!.x - p.x, a!.y - p.y) - Math.hypot(b!.x - p.x, b!.y - p.y))[0];
}
export function saveSeason(doc: SerDocument) {
  const n = doc.resolve('gameTime_/second_');
  return n ? Number(splitGameTime(String(readSigned(doc, n)))?.season ?? 0) : 0;
}
export function cropSequence(entity: ArtEntity | undefined, state: number, growth: number, mature = false) {
  const stages = entity?.states?.[mature ? 1 : state] ?? entity?.states?.[1];
  return mature ? stages?.at(-1)?.[1] : stages?.findLast((s) => s[0] <= growth)?.[1];
}
export function spriteArt(art: MapArt, kind: 'crop' | 'object', id: number, season: number, form?: number, angle = 45) {
  const frames = (kind === 'crop' ? art.crops : art.objects)[id]?.seasons[season];
  if (!frames) return undefined;
  const entity = art.objects[id];
  const preferred = kind === 'crop' ? cropSequence(art.crops[id], 1, 0, true) : entity?.directional ? (entity.initial ?? 110) + angleCode(angle) : entity?.initial ?? 100;
  return (
    (form !== undefined ? frames[form] : undefined) ??
    (preferred !== undefined ? frames[preferred] : undefined) ??
    // A direction without its own frame uses the resting frame (e.g. barn troughs at 0° share frame 300).
    (kind === 'object' && entity?.initial !== undefined ? frames[entity.initial] : undefined) ??
    Object.values(frames).at(-1)
  );
}
/** Game angles are degrees clockwise in screen-world coordinates; codes use the numeric keypad. */
export function angleCode(angle: number) { return [6,3,2,1,4,7,8,9][((Math.round(angle / 45) % 8) + 8) % 8]; }
export function buildFarmScene(
  doc: SerDocument,
  edits: MapEdits,
  art: MapArt,
  season: number,
  mature = false,
  scene = FARM_SCENE
): SceneSprite[] {
  const within = (p: Point) =>
    p.x >= art.bounds[0] && p.y >= art.bounds[1] && p.x <= art.bounds[2] && p.y <= art.bounds[3];
  const existing = new Map(mapCells(doc).map((c) => [c.id, c]));
  const ids = new Set([
    ...existing.keys(),
    ...Object.keys(edits.cells ?? {})
      .filter((k) => k.startsWith(`${scene}:`))
      .map((k) => Number(k.split(':')[1]))
  ]);
  const result: SceneSprite[] = [];
  const mirror = isMirrorScene(scene);
  for (const id of ids) {
    const p = landPosition(id);
    if (!within(p)) continue;
    const cell = existing.get(id),
      edit = edits.cells?.[`${scene}:${id}`];
    const crop = edit?.crop !== undefined ? edit.crop : cell?.crop;
    if (!crop) continue;
    const formNode = cell && doc.resolve('p/pCropsStatus_/p/formID_', cell.node);
    const form = edit?.form ?? (edit?.crop !== undefined ? 1 : formNode ? Number(readSigned(doc, formNode)) : 1);
    const growth = edit?.growth ?? (edit?.crop !== undefined || !cell ? 0 : storedGrowth(doc, cell.node));
    const sequence = cropSequence(art.crops[crop], form, growth, mature);
    result.push({
      ...p,
      key: `crop:${id}`,
      id: crop,
      cell: id,
      kind: 'crop',
      art: spriteArt(art, 'crop', crop, season, sequence),
      edited: !!edit,
      floor: false
    });
  }
  const original = mapObjects(doc).filter(o=>!edits.removed?.includes(o.uid));
  if(scene===FARM_SCENE) for(const fixture of art.fixedObjects??[]) {
    if(!within(fixture)||(fixture.require>=0&&!flagEnabled(doc,fixture.require)))continue;
    if(original.some(o=>o.id===fixture.id))continue;
    result.push({...fixture,key:`fixed:${fixture.id}:${fixture.x}:${fixture.y}`,kind:'object',
      art:spriteArt(art,'object',fixture.id,season,undefined,fixture.angle),edited:false,floor:false,movable:false});
  }
  for (const [index, fixture] of (art.fixtures ?? []).entries()) {
    if (fixture.require >= 0 && !flagEnabled(doc, fixture.require)) continue;
    if (original.some(o => o.id === fixture.id && Math.hypot(o.x-fixture.x,o.y-fixture.y) < 5)) continue;
    result.push({key:`fixture:${scene}:${index}`,id:fixture.id,x:fixture.x,y:fixture.y,kind:'object',art:fixture.art,edited:false,floor:false,movable:false});
  }
  for (const obj of editedObjects(doc, edits)) {
    // Event markers are invisible trigger/sparkle actors, not placed facilities.
    if (obj.id >= 500000000 && !obj.spec) continue;
    if (art.objects[obj.id]?.hidden) continue;
    if (!within(obj)) continue;
    result.push({
      x: obj.x,
      y: obj.y,
      key: `object:${obj.uid}`,
      uid: obj.uid,
      id: obj.id,
      kind: 'object',
      art: spriteArt(art, 'object', obj.id, season, undefined, obj.angle),
      edited: !!obj.move || !!obj.carried,
      floor: !!obj.spec?.floor,
      movable: obj.movable,
      mirror,
      ...(obj.parentY !== undefined ? { carried: true, depth: obj.parentY + 0.01 } : {})
    });
  }
  edits.objects
    ?.filter((e) => !e.move && e.scene === scene)
    .forEach((e) => {
      const p = landPosition(e.cell),
        spec = MAP_DATA.objects.find((s) => s.id === e.template);
      result.push({
        ...p,
        key: `new:${edits.objects!.indexOf(e)}`,
        uid: `new:${edits.objects!.indexOf(e)}`,
        movable: true,
        id: e.template,
        kind: 'object',
        art: spriteArt(art, 'object', e.template, season, undefined, e.angle ?? original.find(o => o.id === e.template)?.angle),
        edited: true,
        floor: !!spec?.floor,
        mirror
      });
    });
  return result.sort((a, b) => Number(b.floor) - Number(a.floor) || (a.depth ?? a.y) - (b.depth ?? b.y) || a.x - b.x);
}

export const isMirrorScene = (scene: number) => !!MAP_DATA.scenes.find((s) => s.id === scene)?.code.endsWith('_MIRROR');

export function farmGround(doc: SerDocument, edits: MapEdits, scene = FARM_SCENE): SceneGround[] {
  const existing = new Map(mapCells(doc).map((c) => [c.id, c]));
  return sceneCells(scene).flatMap((cell) => {
    const original = existing.get(cell.id),
      edit = edits.cells?.[`${scene}:${cell.id}`];
    const soil = edit?.soil ?? original?.soil;
    if (!soil) return [];
    const n = original && doc.resolve('p/pFarmlandStatus_/p/water_/this->value_', original.node);
    return [
      {
        x: cell.x,
        y: cell.y,
        id: cell.id,
        soil,
        watered: edit?.watered ?? !!(n && Number(readSigned(doc, n))),
        edited: !!edit
      }
    ];
  });
}
