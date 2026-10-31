import type { DailyPayload } from '../data/dailyPayload';
import type { DailyTree } from '../lib/saveDaily';
import type { CellRow, CropRules } from './dailyDigest';
import { SEASONS } from './dailyDigest';

/**
 * Where an item can come from, judged against the save: what is growing on the
 * farm, the season, the animals kept, the trees standing on the map and how
 * deep the quarry has been explored.
 */
export type ItemSource =
  /** Growing on the farm; `days` until the first of these cells is ripe (0: ripe now), `ready` for each cell in order. */
  | { kind: 'field'; crop: number; cells: number[]; days: number; ready: number[]; each: number; count: number }
  /** A crop to plant: `now` when it grows this season. */
  | { kind: 'plant'; crop: number; seasons: number[]; now: boolean }
  /** `now` when it bites this season, `today` when it bites in a period left before the 07:00 turnover, `night` when it only bites 0:00–7:00. */
  | { kind: 'fish'; seasons: number[]; now: boolean; today: boolean; night: boolean }
  /** Springs up on its own outdoors in `season` (4: all year). */
  | { kind: 'wild'; season: number; now: boolean }
  /** Produced by these species; `owned` when one of them lives on the farm. */
  | { kind: 'animal'; species: number[]; owned: boolean }
  /** Wood from felling these trees: grown ones on the map, saplings, and tree seeds held for planting. `stumps`: the 附身草丛 stumps give it too. */
  | { kind: 'trees'; crops: number[]; grown: number[]; young: number; seeds: Array<[itemId: number, count: number]>; stumps?: boolean }
  /** A sap extractor on this tree collects the sap in three days; `collectors` are already running for it. */
  | { kind: 'sap'; tree: number; trees: number[]; collectors: number }
  | { kind: 'machine'; machine: number; inputs: Array<[itemId: number, count: number]>; count: number; minutes: number }
  /** The quarry band with the most of this item per 100 rocks among floors already reached. */
  | { kind: 'quarry'; from: number; to: number; perHundred: number; reached: boolean };

/** Item text: 木材 comes from chestnut, oak and pine; 好加工的木材 from cedar; 坚硬的木材 from hinoki. */
export const WOOD_TREES: Readonly<Record<number, number[]>> = { 230000: [1000, 1003, 1002], 230001: [1001], 230002: [1004] };
/** cropsharvest.dat: a grown timber tree of any kind drops this much of its wood to the axe. */
export const TREE_WOOD = [12, 18] as const;
/**
 * 木材 also comes from the stumps in 附身草丛 (藪), north-west of the village. Players report many
 * there; cropsplacement.dat places none in that map, so how many is unknown, and it is not on the village map.
 */
export const STUMP_WOOD = 230000;
/** Tree seeds picked up when felling a tree (item text) and the tree each grows into. */
export const TREE_SEEDS: Readonly<Record<number, number>> = { 140270: 1000, 140280: 1001, 140170: 1002, 140210: 1003, 140290: 1004 };
/** What a sap extractor collects from each tree in three days (item text). */
export const TREE_SAPS: Readonly<Record<number, number>> = { 140300: 1000, 140310: 1001, 140320: 1002, 140370: 1003, 140340: 1004 };

export interface SourceProcess { output: number; count: number; inputs: Array<[itemId: number, count: number]>; minutes: number; machine: number }
/** Fishing periods (FISH_PERIODS indexes) still ahead before the 07:00 turnover; after midnight only the late-night one. */
export function periodsLeft(hour: number): number[] {
  const current = hour < 7 ? 3 : hour < 12 ? 0 : hour < 18 ? 1 : 2;
  return [0, 1, 2, 3].filter((period) => period >= current);
}

export interface SourceContext {
  season: number;
  /** Fishing periods left today, from periodsLeft. */
  periods: number[];
  /** Turnovers left in the season. */
  daysLeft: number;
  crops: CropRules;
  ripening: Array<CellRow & { days: number }>;
  payload: Pick<DailyPayload, 'fish' | 'wild' | 'quarry' | 'animals'>;
  /** Species living on the farm. */
  owned: ReadonlySet<number>;
  trees: DailyTree[];
  /** Backpack and storage counts by item, all qualities. */
  held: ReadonlyMap<number, number>;
  processes: SourceProcess[];
  quarryReached: number;
  /** Sap extractors on the map by the sap they collect. */
  collectors?: ReadonlyMap<number, number>;
  /** Story flags that are on, for the wild spawns that wait for one. */
  unlocked?: ReadonlySet<number>;
}

export function itemSources(itemId: number, context: SourceContext): ItemSource[] {
  const sources: ItemSource[] = [];
  const growers = [...context.crops].filter(([, rule]) => !rule.perennial && [...rule.harvest ?? [], ...rule.regrow?.items ?? []].some(([id]) => id === itemId));
  for (const [crop] of growers) {
    const rows = context.ripening.filter((row) => row.crop === crop);
    if (!rows.length) continue;
    const yieldOf = context.crops.get(crop)?.harvest?.find(([id]) => id === itemId)?.[1] ?? 1;
    const ready = rows.map((row) => row.days).sort((a, b) => a - b);
    sources.push({ kind: 'field', crop, cells: rows.map((row) => row.cell), days: ready[0], ready, each: yieldOf, count: rows.length * yieldOf });
  }
  for (const [crop, rule] of growers) {
    const seasons = rule.seasons.map((season) => SEASONS.indexOf(season)).filter((season) => season >= 0);
    if (!sources.some((source) => source.kind === 'field' && source.crop === crop)) sources.push({ kind: 'plant', crop, seasons, now: seasons.includes(context.season) });
  }
  const fish = context.payload.fish[itemId];
  if (fish?.length) {
    const season = fish.filter(([entry]) => entry === context.season);
    sources.push({
      kind: 'fish', seasons: [...new Set(fish.map(([entry]) => entry))], now: season.length > 0,
      today: season.some(([, period]) => context.periods.includes(period)), night: fish.every(([, period]) => period === 3),
    });
  }
  const wild = context.payload.wild[itemId];
  if (wild && (wild.flag === undefined || context.unlocked?.has(wild.flag))) sources.push({ kind: 'wild', season: wild.season, now: wild.season === 4 || wild.season === context.season });
  const species = context.payload.animals.filter((animal) => animal.products.includes(itemId)).map((animal) => animal.species);
  if (species.length) sources.push({ kind: 'animal', species, owned: species.some((id) => context.owned.has(id)) });
  const woods = WOOD_TREES[itemId];
  if (woods) {
    const trees = context.trees.filter((tree) => woods.includes(tree.crop));
    sources.push({
      kind: 'trees', crops: woods, grown: trees.filter((tree) => tree.grown).map((tree) => tree.cell), young: trees.filter((tree) => !tree.grown).length,
      seeds: Object.entries(TREE_SEEDS).filter(([, tree]) => woods.includes(tree)).map(([seed]): [number, number] => [Number(seed), context.held.get(Number(seed)) ?? 0]).filter(([, count]) => count > 0),
      ...itemId === STUMP_WOOD ? { stumps: true } : {},
    });
  }
  const sapTree = TREE_SAPS[itemId];
  if (sapTree) sources.push({ kind: 'sap', tree: sapTree, trees: context.trees.filter((tree) => tree.crop === sapTree && tree.grown).map((tree) => tree.cell), collectors: context.collectors?.get(itemId) ?? 0 });
  const recipe = sapTree ? undefined : bestRecipe(itemId, context);
  if (recipe) sources.push({ kind: 'machine', machine: recipe.machine, inputs: recipe.inputs, count: recipe.count, minutes: recipe.minutes });
  const quarry = quarrySource(itemId, context);
  if (quarry) sources.push(quarry);
  return sources;
}

/** The recipe for an item whose other inputs are best covered by what is held (ingots take coal or charcoal). */
export function bestRecipe(itemId: number, context: Pick<SourceContext, 'processes' | 'held'>): SourceProcess | undefined {
  const recipes = context.processes.filter((recipe) => recipe.output === itemId);
  const cover = (recipe: SourceProcess) => recipe.inputs.map(([id, count]) => (context.held.get(id) ?? 0) / count);
  const least = (recipe: SourceProcess) => Math.min(...cover(recipe)), total = (recipe: SourceProcess) => cover(recipe).reduce((sum, value) => sum + value, 0);
  return recipes.sort((a, b) => least(b) - least(a) || total(b) - total(a))[0];
}

/**
 * The best band for an item among floors already reached (the elevator stops
 * every ten floors). If it only drops deeper, the shallowest band that has it.
 */
function quarrySource(itemId: number, context: SourceContext): ItemSource | undefined {
  const bands = context.payload.quarry.flatMap((band) => {
    const perHundred = band.drops.find(([id]) => id === itemId)?.[1];
    return perHundred ? [{ ...band, perHundred, reached: band.from <= Math.max(context.quarryReached, 1) }] : [];
  });
  const reached = bands.filter((band) => band.reached).sort((a, b) => b.perHundred - a.perHundred)[0];
  const band = reached ?? bands[0];
  return band && { kind: 'quarry', from: band.from, to: band.to, perHundred: band.perHundred, reached: band.reached };
}
