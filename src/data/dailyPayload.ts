import quarry from '../../data/sources/game-quarry.json';
import unlocks from '../../data/sources/game-save-unlocks.json';
import livestock from '../../data/sources/game-livestock-products.json';
import animals from '../../data/sources/game-save-animals.json';
import construction from '../../data/sources/game-construction.json';
import natural from '../../data/sources/game-natural-occurrence.json';
import fishing from '../../data/sources/game-fishing.json';
import curse from '../../data/sources/game-curse-items.json';
import { catchChances } from '../domain/fishingOdds';
import type { Catalog } from './types';

/**
 * Lookup tables for the daily planner, keyed by the numeric IDs a save stores.
 * Names of items come from `save-editor-names.json`; this file carries what
 * that table lacks: delivery lists, machine recipes, prices, seasons and
 * quarry drops. Built per language because bundle and skill names are text.
 */
export type DeliveryList = 'shrine' | 'repair' | 'catalog';
export interface DailyBundleSpec {
  /** bundle.dat record number, the `bundleID_` a save keeps. */
  id: number;
  list: DeliveryList;
  /** Fox shrine offerings: 0 spring … 3 winter. */
  season?: number;
  /** Shrine repairs: which of the five repairs (1–5). */
  stage?: number;
  name: string;
  /** Where it is handed in, as the catalog writes it. */
  place: string;
  items: Array<[itemId: number, count: number]>;
  rewards: Array<[itemId: number, count: number]>;
}
export interface DailyCraft { machine: number; inputs: Array<[itemId: number, count: number]>; flag: number | null; skill: string | null }
export interface QuarryBand { from: number; to: number; drops: Array<[itemId: number, perHundredRocks: number]> }
/** A carpenter's order for an animal house: a new house, or a renovation from `from` slots. */
export interface HouseOrder {
  type: number;
  name: string;
  /** Slots after the order. */
  slots: number;
  from: number | null;
  /** Houses of this type allowed on the farm (new houses only). */
  limit: number;
  flag: number | null;
  inputs: Array<[itemId: number, count: number]>;
  money: number;
}
/** fishing.dat time periods in the order a game day runs from the 07:00 turnover: 7–12, 12–18, 18–24 and 0–7. */
export const FISH_PERIODS = ['morning', 'day', 'evening', 'late-night'] as const;
/** A fishing spot and each fish's chance on one bite with no bait, by season (0–3) and FISH_PERIODS index. Trash is left out. */
export interface FishSpot { id: string; name: string; catches: Array<[season: number, period: number, itemId: number, chance: number]> }
/** A wild plant or insect: the season it springs up in (0–3, 4 all year) and the story flag it waits for. */
export interface WildSpawn { season: number; flag?: number }

export interface DailyPayload {
  prices: Record<string, number>;
  bundles: DailyBundleSpec[];
  crafts: DailyCraft[];
  /** Fish item → the seasons (0–3) and FISH_PERIODS indexes it bites in. */
  fish: Record<string, Array<[season: number, period: number]>>;
  fishing: FishSpot[];
  /** Wild plant and insect items that spring up on their own (naturaloccurrence.dat). */
  wild: Record<string, WildSpawn>;
  quarry: QuarryBand[];
  /** Adult livestock (livestock.dat id) → its house type (0 barn, 1 coop, 2 stable) and the items it produces. */
  animals: Array<{ species: number; house: number; products: number[] }>;
  houses: HouseOrder[];
}

const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];
type Stack = { item_id: string; quantity: number };

export function dailyPayload(catalog: Catalog): DailyPayload {
  const numeric = new Map<string, number>();
  for (const entity of catalog.entities) if (entity.kind === 'items' && typeof entity.numeric_id === 'number') numeric.set(entity.id, entity.numeric_id);
  const stacks = (rows: unknown) => ((rows ?? []) as Stack[]).flatMap((row): Array<[number, number]> => numeric.has(row.item_id) ? [[numeric.get(row.item_id)!, row.quantity]] : []);
  const local = (row: { name: string; nameTranslations?: Record<string, string> }) => (catalog.locale && row.nameTranslations?.[catalog.locale]) || row.name;

  const prices: Record<string, number> = {};
  for (const entity of catalog.entities) if (entity.kind === 'items' && typeof entity.numeric_id === 'number' && typeof entity.sell_price === 'number') prices[entity.numeric_id] = entity.sell_price;

  const bundles = catalog.entities.flatMap((entity): DailyBundleSpec[] => {
    if (entity.kind !== 'activities' || typeof entity.numeric_id !== 'number') return [];
    const base = { id: entity.numeric_id, name: entity.name.zh_hans, place: String(entity.location ?? ''), items: stacks(entity.inputs), rewards: stacks(entity.rewards) };
    const seasonal = /^BUNDLE_ID_(SPRING|SUMMER|AUTUMN|WINTER)_\d+$/.exec(entity.id);
    if (seasonal) return [{ ...base, list: 'shrine', season: SEASONS.indexOf(seasonal[1]) }];
    const repair = /^BUNDLE_ID_SHRINE_REPAIR_(\d+)_\d+$/.exec(entity.id);
    if (repair) return [{ ...base, list: 'repair', stage: Number(repair[1]) }];
    return entity.id.startsWith('BUNDLE_ID_VILLAGE_HEAD_') ? [{ ...base, list: 'catalog' }] : [];
  }).sort((a, b) => a.id - b.id);

  const machineItems = new Set(catalog.entities.filter((entity) => entity.kind === 'machines').map((entity) => entity.id));
  const skills = new Map(unlocks.nodes.map((node) => [node.flag, local(node)]));
  const crafts = catalog.entities.flatMap((entity): DailyCraft[] => {
    const output = (entity.output as Stack | undefined)?.item_id;
    if (entity.kind !== 'craft-recipes' || !output || !machineItems.has(output) || !numeric.has(output)) return [];
    const flag = typeof entity.unlock_flag === 'number' ? entity.unlock_flag : null;
    return [{ machine: numeric.get(output)!, inputs: stacks(entity.inputs), flag, skill: flag === null ? null : skills.get(flag) ?? null }];
  });

  const fish: Record<string, Array<[number, number]>> = {};
  for (const entity of catalog.entities) {
    if (entity.kind !== 'fish' || !numeric.has(entity.id)) continue;
    const times = new Set((entity.appearances ?? []).map((row) => {
      const season = ['spring', 'summer', 'autumn', 'winter'].indexOf(row.season), period = (FISH_PERIODS as readonly string[]).indexOf(row.time_period);
      return season >= 0 && period >= 0 ? season * 4 + period : -1;
    }).filter((time) => time >= 0));
    fish[numeric.get(entity.id)!] = [...times].sort((a, b) => a - b).map((time): [number, number] => [Math.floor(time / 4), time % 4]);
  }
  const wild: Record<string, WildSpawn> = {};
  for (const row of natural.groups.flatMap((group) => group.rows)) wild[row.item_numeric_id] = { season: row.season, ...'flag' in row ? { flag: row.flag } : {} };

  return { prices, bundles, crafts, fish, fishing: fishingSpots(catalog, numeric), wild, quarry: quarryBands(numeric), animals: livestockProducts(), houses: houseOrders(catalog, stacks) };
}

/** Catch odds per spot as the fishing spots guide shows them; spot names come from the fish entries. */
function fishingSpots(catalog: Catalog, numeric: ReadonlyMap<string, number>): FishSpot[] {
  const names = new Map(catalog.entities.filter((entity) => entity.kind === 'fish').flatMap((entity) =>
    ((entity.locations ?? []) as Array<{ location_id: string; name: { zh_hans: string } }>).map((location) => [location.location_id, location.name.zh_hans] as const)));
  const pools = new Map<string, Array<(typeof fishing.spawns)[number]>>();
  for (const spawn of fishing.spawns) {
    const key = `${spawn.spot}|${spawn.season}|${spawn.period}`;
    pools.set(key, [...pools.get(key) ?? [], spawn]);
  }
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  return fishing.spots.map((spot) => ({
    id: spot, name: names.get(spot) ?? spot,
    catches: seasons.flatMap((season, seasonIndex) => FISH_PERIODS.flatMap((period, periodIndex) =>
      [...catchChances(pools.get(`${spot}|${season}|${period}`) ?? [], curse.fish_kind as Record<string, number>)]
        .filter(([item]) => !item.startsWith('ITEM_ID_TRASH_') && numeric.has(item))
        .map(([item, chance]): [number, number, number, number] => [seasonIndex, periodIndex, numeric.get(item)!, Math.round(chance * 10000) / 10000]))),
  }));
}

/** Slot counts from each order's description in construction.dat. */
const HOUSE_ORDERS: Array<{ id: string; type: number; slots: number; from: number | null }> = [
  { id: 'BUILD_LIVESTOCK_HOUSE_LV1', type: 0, slots: 4, from: null },
  { id: 'RENOVATION_LIVESTOCK_HOUSE_LV2', type: 0, slots: 8, from: 4 },
  { id: 'RENOVATION_LIVESTOCK_HOUSE_LV3', type: 0, slots: 12, from: 8 },
  { id: 'BUILD_AVIARY_LV2', type: 1, slots: 8, from: null },
  { id: 'RENOVATION_AVIARY_LV2', type: 1, slots: 8, from: 4 },
  { id: 'RENOVATION_AVIARY_LV3', type: 1, slots: 12, from: 8 },
  { id: 'BUILD_STABLE', type: 2, slots: 3, from: null },
];

function houseOrders(catalog: Catalog, stacks: (rows: unknown) => Array<[number, number]>): HouseOrder[] {
  return HOUSE_ORDERS.flatMap((order) => {
    const entity = catalog.byId[`CONSTRUCTION_ID_${order.id}`], data = construction.constructions.find((row) => row.id === `CONSTRUCTION_ID_${order.id}`);
    if (!entity || !data) return [];
    return [{ type: order.type, name: entity.name.zh_hans, slots: order.slots, from: order.from, limit: data.limit, flag: data.required_flags[0]?.id ?? null, inputs: stacks(entity.inputs), money: Number(entity.money_cost ?? 0) }];
  });
}

/**
 * Expected drops per 100 rocks broken on each floor, from the floor's rock
 * weights and each rock's independent drop rolls (average of min and max).
 * Floors with the same table are merged into one band; rest floors spawn no
 * rocks. Special rooms (ore veins, bee nests) are left out.
 */
export function quarryBands(numeric: ReadonlyMap<string, number>): QuarryBand[] {
  const rocks = quarry.rocks as Record<string, { drops: Array<{ item: string; min: number; max: number; chance: number }> }>;
  const bands: QuarryBand[] = [];
  let previous = '';
  for (const floor of quarry.floors) {
    const total = floor.rocks.reduce((sum, rock) => sum + rock.weight, 0);
    if (!total) { previous = ''; continue; }
    const expected = new Map<number, number>();
    for (const { rock, weight } of floor.rocks) {
      for (const drop of rocks[rock]?.drops ?? []) {
        const id = numeric.get(drop.item);
        if (id) expected.set(id, (expected.get(id) ?? 0) + weight / total * drop.chance / 100 * (drop.min + drop.max) / 2 * 100);
      }
    }
    const drops = [...expected].map(([id, count]): [number, number] => [id, Math.round(count * 10) / 10]).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
    const key = JSON.stringify(drops), last = bands.at(-1);
    if (key === previous && last && last.to === floor.floor - 1) last.to = floor.floor;
    else bands.push({ from: floor.floor, to: floor.floor, drops });
    previous = key;
  }
  return bands;
}

function livestockProducts(): DailyPayload['animals'] {
  return livestock.animals.flatMap((animal) => {
    const species = animals.animals.find((row) => row.code === animal.livestock_id);
    const products = [...new Set(animal.raw_candidates.map((row) => row.item_numeric_id).filter(Boolean))];
    return species && !animal.adult_id && products.length ? [{ species: species.id, house: species.houseType, products }] : [];
  });
}
