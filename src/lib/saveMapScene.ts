import { MAP_DATA, landPosition, mapCells, mapObjects, sceneCells, type MapEdits } from './saveMap';
import { readSigned, type SerDocument } from './ser';
import { splitGameTime } from './saveTime';

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
}
export interface MapArt {
  bounds: number[];
  seasons: string[];
  crops: Record<string, ArtEntity>;
  objects: Record<string, ArtEntity>;
  soils?: Record<string, SpriteArt>;
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
}
export const FARM_SCENE = MAP_DATA.scenes.find((s) => s.code === 'MAP_ID_OPENWORLD')!.id;
export const FARM_CELLS = sceneCells(FARM_SCENE);
export const FARM_REGIONS = [
  { id: 1, name: '住宅旁', description: '北边 · L 形田地' },
  { id: 2, name: '西边田地', description: '中部 · 第二块田' },
  { id: 4, name: '南边田地', description: '下方 · 第三块田' }
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
export const FARM_BOUNDS = [8100, 19300, 13600, 26600];
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
export function pickFarmCell(p: Point) {
  const x = Math.round(p.x / 45) * 45,
    y = Math.round(p.y / 45) * 45;
  return [
    [x, y],
    [x - 45, y],
    [x + 45, y],
    [x, y - 45],
    [x, y + 45]
  ]
    .map(([a, b]) => cellIndex.get(`${a},${b}`))
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
export function spriteArt(art: MapArt, kind: 'crop' | 'object', id: number, season: number, form?: number) {
  const frames = (kind === 'crop' ? art.crops : art.objects)[id]?.seasons[season];
  if (!frames) return undefined;
  const preferred = kind === 'crop' ? cropSequence(art.crops[id], 1, 0, true) : 100;
  return (
    (form !== undefined ? frames[form] : undefined) ??
    (preferred !== undefined ? frames[preferred] : undefined) ??
    Object.values(frames).at(-1)
  );
}
export function buildFarmScene(
  doc: SerDocument,
  edits: MapEdits,
  art: MapArt,
  season: number,
  mature = false
): SceneSprite[] {
  const within = (p: Point) =>
    p.x >= art.bounds[0] && p.y >= art.bounds[1] && p.x <= art.bounds[2] && p.y <= art.bounds[3];
  const existing = new Map(mapCells(doc).map((c) => [c.id, c]));
  const ids = new Set([
    ...existing.keys(),
    ...Object.keys(edits.cells ?? {})
      .filter((k) => k.startsWith(`${FARM_SCENE}:`))
      .map((k) => Number(k.split(':')[1]))
  ]);
  const result: SceneSprite[] = [];
  for (const id of ids) {
    const p = landPosition(id);
    if (!within(p)) continue;
    const cell = existing.get(id),
      edit = edits.cells?.[`${FARM_SCENE}:${id}`];
    const crop = edit?.crop !== undefined ? edit.crop : cell?.crop;
    if (!crop) continue;
    const formNode = cell && doc.resolve('p/pCropsStatus_/p/formID_', cell.node);
    const growthNode = cell && doc.resolve('p/pCropsStatus_/p/growth_/this->value_', cell.node);
    const form = edit?.crop !== undefined ? 1 : formNode ? Number(readSigned(doc, formNode)) : 1;
    const growth = edit?.crop !== undefined ? 0 : growthNode ? Number(readSigned(doc, growthNode)) : 0;
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
  const original = mapObjects(doc);
  for (const obj of original) {
    // Event markers are invisible trigger/sparkle actors, not placed facilities.
    if (obj.id >= 500000000 && !obj.spec) continue;
    const move = edits.objects?.findLast((e) => e.move === obj.uid);
    const p = move ? landPosition(move.cell) : obj;
    if (!within(p)) continue;
    result.push({
      x: p.x,
      y: p.y,
      key: `object:${obj.uid}`,
      uid: obj.uid,
      id: obj.id,
      kind: 'object',
      art: spriteArt(art, 'object', obj.id, season),
      edited: !!move,
      floor: !!obj.spec?.floor,
      movable: obj.movable
    });
  }
  edits.objects
    ?.filter((e) => !e.move && e.scene === FARM_SCENE)
    .forEach((e, i) => {
      const p = landPosition(e.cell),
        spec = MAP_DATA.objects.find((s) => s.id === e.template);
      result.push({
        ...p,
        key: `new:${i}`,
        id: e.template,
        kind: 'object',
        art: spriteArt(art, 'object', e.template, season),
        edited: true,
        floor: !!spec?.floor
      });
    });
  return result.sort((a, b) => Number(b.floor) - Number(a.floor) || a.y - b.y || a.x - b.x);
}

export function farmGround(doc: SerDocument, edits: MapEdits): SceneGround[] {
  const existing = new Map(mapCells(doc).map((c) => [c.id, c]));
  return FARM_CELLS.flatMap((cell) => {
    const original = existing.get(cell.id),
      edit = edits.cells?.[`${FARM_SCENE}:${cell.id}`];
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
