import quarry from '../../data/sources/game-quarry.json';
import unlocks from '../../data/sources/game-save-unlocks.json';
import livestock from '../../data/sources/game-livestock-products.json';
import animals from '../../data/sources/game-save-animals.json';
import construction from '../../data/sources/game-construction.json';
import natural from '../../data/sources/game-natural-occurrence.json';
import fishing from '../../data/sources/game-fishing.json';
import curse from '../../data/sources/game-curse-items.json';
import { catchChances } from '../domain/fishingOdds';
import { seasonCountPerSeed } from '../domain/cropProcessing';
import type { QualityTarget } from '../domain/quality';
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
  /** Fox shrine offerings: the place in the season's group (1–4, mountain vegetables to fish), which sets when the shrine asks for it. */
  slot?: number;
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
/** A shop selling a seed or sapling: the seasons it is on sale (empty: all year), the flags it waits for and their text. */
export interface SeedSale { place: string; seasons: number[]; flags: number[]; conditions: string[] }
/** A crop's seed or sapling, the turnovers it takes to grow, what it is harvested for and where the seed is sold. */
export interface DailySeed { seed: number; days: number; items: number[]; sales: SeedSale[] }
/**
 * The harvest count an item's grade follows (item.dat needValue × HARVEST_COUNT_RATE_*): the save keeps it under `count`,
 * and harvests come out 铜星, 银星 and 金星 once it reaches `ranks`. `pick` is what one harvest of the crop adds;
 * a fruit tree or shrub has `season` instead, what one grown plant adds over a bearing season.
 */
export interface DailyQuality { count: number; crop: number; ranks: [copper: number, silver: number, gold: number]; pick?: number; season?: number }

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
  /** Crop (crops.dat id) → its seed and where to buy it. */
  seeds: Record<string, DailySeed>;
  /** Hunting reward item → the certificates that can be traded for it at the hunter's hut. */
  hunts: Record<string, number[]>;
  /** Harvest item → the count its grade follows. */
  quality: Record<string, DailyQuality>;
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
    // bundlegroup.dat lists each season's offerings in ID order: BUNDLE_ID_SPRING_01 is the first slot.
    const seasonal = /^BUNDLE_ID_(SPRING|SUMMER|AUTUMN|WINTER)_(\d+)$/.exec(entity.id);
    if (seasonal) return [{ ...base, list: 'shrine', season: SEASONS.indexOf(seasonal[1]), slot: Number(seasonal[2]) }];
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

  const seasonIndex = (season: unknown) => ['spring', 'summer', 'autumn', 'winter'].indexOf(String(season));
  const offers = catalog.entities.filter((entity) => entity.kind === 'store-offers');
  const seeds: Record<string, DailySeed> = {};
  for (const crop of catalog.entities) {
    const seed = (crop.seed_item_ids as string[] | undefined)?.[0];
    if (crop.kind !== 'crops' || typeof crop.numeric_id !== 'number' || !seed || !numeric.has(seed) || typeof crop.growth_days !== 'number') continue;
    seeds[crop.numeric_id] = {
      seed: numeric.get(seed)!, days: crop.growth_days,
      items: ((crop.harvest_item_ids ?? []) as string[]).flatMap((id) => numeric.has(id) ? [numeric.get(id)!] : []),
      sales: offers.filter((offer) => offer.item_id === seed).map((offer) => ({
        place: String(offer.location ?? ''), seasons: ((offer.seasons ?? []) as string[]).map(seasonIndex).filter((season) => season >= 0),
        flags: (offer.required_flags ?? []) as number[], conditions: (offer.conditions ?? []) as string[],
      })),
    };
  }
  const hunts: Record<string, number[]> = {};
  for (const reward of catalog.entities.filter((entity) => entity.kind === 'hunt-rewards')) {
    const certificate = numeric.get(String(reward.certificate_item_id));
    for (const [itemId] of stacks(reward.rewards)) if (certificate) hunts[itemId] = [...new Set([...hunts[itemId] ?? [], certificate])];
  }

  return { prices, bundles, crafts, fish, fishing: fishingSpots(catalog, numeric), wild, quarry: quarryBands(numeric), seeds, hunts, quality: qualityCounts(catalog, numeric), animals: livestockProducts(), houses: houseOrders(catalog, stacks) };
}

function qualityCounts(catalog: Catalog, numeric: ReadonlyMap<string, number>): Record<string, DailyQuality> {
  const crops = catalog.entities.filter((entity) => entity.kind === 'crops' && typeof entity.numeric_id === 'number');
  const quality: Record<string, DailyQuality> = {};
  for (const item of catalog.entities) {
    const target = item.quality_target as QualityTarget | null | undefined;
    const crop = target && crops.find((row) => ((row.seed_item_ids ?? []) as string[]).includes(target.seed_item_id));
    if (item.kind !== 'items' || item.id === target?.seed_item_id || !numeric.has(item.id) || !crop) continue;
    const perennial = !!crop.perennial;
    const plot = seasonCountPerSeed(crop, catalog, perennial ? 28 : Number(crop.growth_days));
    quality[numeric.get(item.id)!] = {
      count: target.count_item_numeric_id, crop: crop.numeric_id as number, ranks: [target.copper, target.silver, target.gold],
      ...plot?.perSeed ? perennial ? { season: plot.perSeed } : { pick: plot.perSeed } : {},
    };
  }
  return quality;
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
