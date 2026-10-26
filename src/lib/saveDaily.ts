import { decodeSave } from './saveEditor';
import { readSigned, readString, SerDocument } from './ser';
import { areaAvailable, cropGrowth, draftObjects, mapCells, mapObjects, MAP_CROPS, objectFootprint, sceneCells } from './saveMap';
import { containsPoint, toGrid } from './saveMapGeometry';
import { FARM_CELLS, FARM_SCENE } from './saveMapScene';
import type { CropRules } from '../domain/dailyDigest';
import { collectContainers, SHIPPING_BOX_ID } from './saveItems';
import { machineJobs, machineSpec, mapValue } from './saveMachines';
import { readDeliveries, UNLOCKS } from './saveDeliveries';
import { flagEnabled } from './saveProgress';
import { tr } from '../i18n/active';

/**
 * A read-only summary of one slot save for the daily view. Everything the
 * daily rules need is copied into plain rows here, so the rules can be tested
 * without a save and the parsed document is only kept for drawing the map.
 */
export interface DailyCell {
  id: number;
  /** A farm crop (one with seeds and a harvest); 0 for empty ground or wild plants. */
  crop: number;
  /** Grass, timber trees and other wild plants occupy the cell but are not crops. */
  wild: boolean;
  /** 0 plain ground, 1 tilled soil, 2 ridge, 3 paddy. */
  soil: number;
  wet: boolean;
  /** crops.dat form: 1 growing, 2 withered, 4/5 regrowing, 9 withered but harvestable, 10 waiting for its season. */
  form: number;
  growth: number;
  /** Growth points of the last stage of the current form; 0 when the form does not grow. */
  maximum: number;
  fertilizer: number;
}
export interface DailyStack { itemId: number; rank: number; count: number }
export interface DailyJob { output: number; count: number; seconds: number; remaining: number }
export interface DailyMachine { key: string; itemId: number; jobs: DailyJob[] }
export interface DailyDelivery { bundleId: number; index: number; itemId: number; rank: number; count: number; remain: number }
export interface DailyScarecrow {
  key: string;
  itemId: number;
  /** 0 spring … 3 winter: crops of this season keep growing in its range out of season. */
  season: number;
  /** Turnovers since it was placed; it is spent at 28. */
  days: number;
  spent: boolean;
  /** Farm cells in its effect range (5×5 around the cell it stands on). */
  cells: number[];
}
export interface DailySnapshot {
  /** In-game seconds since year 1, spring 1, 07:00. */
  seconds: number;
  date: { year: number; season: number; day: number; hour: number; minute: number };
  weather: number;
  money: number;
  player: string;
  cells: DailyCell[];
  machines: DailyMachine[];
  scarecrows: DailyScarecrow[];
  deliveriesOpen: boolean;
  deliveries: DailyDelivery[];
  /** Backpack and storage chests. */
  held: DailyStack[];
  shipping: DailyStack[];
  animals: { total: number; fed: number };
}

const DAY = 86_400;
const farmCrops = new Set(MAP_CROPS.map((crop) => crop.numeric_id));
export const DAILY_CROPS: CropRules = new Map(MAP_CROPS.map((crop) => [crop.numeric_id, {
  seasons: crop.seasons, perennial: crop.perennial, witheredHarvest: crop.harvest_stages.some((stage) => stage.state === 9),
}]));

/** Farm cells that could be tilled: unlocked ground with no building, facility or floor on it. */
export function farmableCells(doc: SerDocument, ids: number[]): number[] {
  const wanted = new Set(ids);
  const footprints = draftObjects(doc, {}).filter((object) => (object.spec || object.blocksPlacement) && !object.parent).map(objectFootprint);
  return sceneCells(FARM_SCENE).filter((cell) => wanted.has(cell.id) && cell.mask & 3 && areaAvailable(doc, cell.area) &&
    !footprints.some((polygons) => polygons.some((polygon) => containsPoint(polygon, cell)))).map((cell) => cell.id);
}

const SEASON_CODES = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];

/**
 * Placed scarecrows. The save keeps `season`, `days` (counted up at each turnover) and `disable`
 * (set when the 28 days are used up) in the gimmick's status map; a spent scarecrow stays until
 * it is chopped down.
 */
export function readScarecrows(doc: SerDocument): DailyScarecrow[] {
  return mapObjects(doc).flatMap((object) => {
    const spec = object.spec;
    if (!spec?.features.includes('SCARECROW')) return [];
    const range = Number(spec.features.find((feature) => feature.startsWith('PLACEMENT_EFFECT_RANGE_'))?.split('_').at(-1) ?? 2);
    const status = doc.resolve('p/statusValueMap_', object.node), center = toGrid(object);
    return [{
      key: object.uid, itemId: spec.itemId, season: SEASON_CODES.findIndex((code) => spec.code.endsWith(code)),
      days: mapValue(doc, status, 'days'), spent: !!mapValue(doc, status, 'disable'),
      cells: FARM_CELLS.filter((cell) => { const at = toGrid(cell); return Math.abs(at.x - center.x) < range + .5 && Math.abs(at.y - center.y) < range + .5; }).map((cell) => cell.id),
    }];
  });
}

/** Calendar days turn over at 07:00, so 00:00–06:59 still belongs to the previous day. */
export function gameDate(seconds: number): DailySnapshot['date'] {
  const days = Math.floor(seconds / DAY), clock = (seconds % DAY + 7 * 3600) % DAY;
  return { year: Math.floor(days / 112) + 1, season: Math.floor(days % 112 / 28), day: days % 28 + 1, hour: Math.floor(clock / 3600), minute: Math.floor(clock % 3600 / 60) };
}

export function readDailySave(bytes: Uint8Array, fileName: string): { doc: SerDocument; snapshot: DailySnapshot } {
  const doc = new SerDocument(decodeSave(bytes, fileName).data);
  if (doc.root.name !== 'SAVEDATA') throw new Error(tr('请选择 save.001–save.005 槽位存档。'));
  return { doc, snapshot: dailySnapshot(doc) };
}

export function dailySnapshot(doc: SerDocument): DailySnapshot {
  const number = (path: string, from = doc.root) => { const node = doc.resolve(path, from); return node ? Number(readSigned(doc, node)) : 0; };
  const seconds = number('gameTime_/second_');
  const nameNode = doc.resolve('pPlayerStatus_/p/name_');

  const cells: DailyCell[] = [];
  for (const cell of mapCells(doc)) {
    const farm = farmCrops.has(cell.crop);
    if (!cell.soil && !farm) continue;
    const growth = farm ? cropGrowth(doc, {}, FARM_SCENE, cell.id) : null;
    cells.push({
      id: cell.id, crop: farm ? cell.crop : 0, wild: !!cell.crop && !farm, soil: cell.soil,
      wet: !!number('p/pFarmlandStatus_/p/water_/this->value_', cell.node),
      form: growth?.form ?? 0, growth: growth?.growth ?? 0, maximum: growth?.maximum ?? 0,
      fertilizer: number('p/pFarmlandStatus_/p/pFertilizerData_/dataID', cell.node),
    });
  }

  const containers = collectContainers(doc);
  const stacks = (kinds: string[], id?: string) => containers
    .filter((container) => id ? container.id === id : kinds.includes(container.kind))
    .flatMap((container) => container.slots.flatMap((slot) => slot.item ? [{ itemId: Number(slot.item.itemId), rank: Number(slot.item.rank), count: Number(slot.item.count) }] : []));
  const machines: DailyMachine[] = [];
  for (const container of containers) {
    const spec = container.kind === 'machine' ? machineSpec(container) : undefined;
    if (!spec || spec.mode === 'collector') continue;
    machines.push({
      key: container.id, itemId: spec.itemId,
      jobs: machineJobs(doc, container).map((job) => ({ output: job.output, count: job.count, seconds: job.seconds, remaining: job.remaining })),
    });
  }

  const animals = doc.resolve('livestockList_');
  const fed = (animals ? doc.children(animals) : []).map((pointer) => number('p/foodNum_/this->value_', pointer));
  return {
    seconds, date: gameDate(seconds), weather: number('pWeatherData_/dataID'), money: number('money_/this->value_'),
    player: nameNode ? readString(doc, nameNode) : '',
    cells, machines, scarecrows: readScarecrows(doc),
    deliveriesOpen: flagEnabled(doc, UNLOCKS.catalogFlag),
    deliveries: [...readDeliveries(doc).values()].map(({ bundleId, itemId, rank, count, remain, key }) => ({ bundleId, index: Number(key.split(':')[1]), itemId, rank, count, remain })),
    held: stacks(['backpack', 'storage']),
    shipping: stacks([], SHIPPING_BOX_ID),
    animals: { total: fed.length, fed: fed.filter(Boolean).length },
  };
}
