import type { Catalog, Entity } from './types';
import { SEASON_KEYS, type SeasonKey } from './calendar';

/**
 * What the season plan page shows for each season, from one (localized) catalog:
 * the fox shrine offerings in the order the shrine asks for them, the village head's
 * seasonal catalog entries, seeds that open too late for Year 1, and birthdays.
 * Matching is by game ID only, so every language gets the same rows.
 */
export interface PlanStack { item: Entity; quantity: number }
export interface PlanBundle { entity: Entity; slot: number; items: PlanStack[]; rewards: PlanStack[] }
/** Harvest items whose seeds are sold only after a condition later than this season of Year 1. */
export interface SeedNote { condition: string; items: Entity[] }
export interface SeasonPlan {
  season: number;
  key: SeasonKey;
  shrine: PlanBundle[];
  catalog: PlanBundle[];
  seedNotes: SeedNote[];
  /** Items both the shrine and the catalog ask for this season. */
  shared: Set<string>;
  birthdays: Entity[];
}

type Stack = { item_id: string; quantity: number };

/**
 * storesales.dat flags that only mean "from this season of Year 1" (GAME_FLAG_SALE_START_SEED_*):
 * a seed sold from summer of Year 1 is no obstacle for the summer lists.
 */
const YEAR_ONE_FLAGS: Record<number, number> = { 522: 1, 525: 2, 527: 3 };
/** GAME_FLAG_SALE_START_SEED_2ND_* and _3RD_*: seeds added in Year 2 and Year 3. */
export const LATER_YEAR_FLAGS: Record<number, { year: number; season: number }> = {
  520: { year: 2, season: 0 }, 523: { year: 2, season: 1 }, 526: { year: 2, season: 2 },
  521: { year: 3, season: 0 }, 524: { year: 3, season: 1 },
};

function index(catalog: Catalog) {
  const items = new Map(catalog.entities.filter((e) => e.kind === 'items').map((e) => [e.id, e]));
  const stacks = (rows: unknown): PlanStack[] => ((rows ?? []) as Stack[]).flatMap((row) => {
    const item = items.get(row.item_id);
    return item ? [{ item, quantity: row.quantity }] : [];
  });
  const bundle = (entity: Entity, slot: number): PlanBundle => ({ entity, slot, items: stacks(entity.inputs), rewards: stacks(entity.rewards) });
  return { items, bundle };
}

/** Sale conditions that stop a harvest item's seed from being bought in this season of Year 1; empty when it can be. */
export function lateSeedConditions(catalog: Catalog, itemId: string, season: number): string[] {
  const crop = catalog.entities.find((e) => e.kind === 'crops' && ((e.harvest_item_ids ?? []) as string[]).includes(itemId));
  const seeds = new Set((crop?.seed_item_ids ?? []) as string[]);
  const offers = catalog.entities.filter((e) => e.kind === 'store-offers' && seeds.has(String(e.item_id)));
  const late = (offer: Entity) => ((offer.required_flags ?? []) as number[]).some((flag) => !(flag in YEAR_ONE_FLAGS && YEAR_ONE_FLAGS[flag] <= season));
  if (!offers.length || offers.some((offer) => !late(offer))) return [];
  return [...new Set(offers.flatMap((offer) => (offer.conditions ?? []) as string[]))];
}

export function seasonPlans(catalog: Catalog): SeasonPlan[] {
  const { bundle } = index(catalog);
  const activities = catalog.entities.filter((e) => e.kind === 'activities');
  return SEASON_KEYS.map((key, season) => {
    // BUNDLE_ID_SPRING_01…04: bundlegroup.dat asks for them in ID order (mountain vegetables, crops, flowers, fish).
    const shrine = activities.flatMap((e) => {
      const match = new RegExp(`^BUNDLE_ID_${key.toUpperCase()}_(\\d+)$`).exec(e.id);
      return match ? [bundle(e, Number(match[1]))] : [];
    }).sort((a, b) => a.slot - b.slot);
    // BUNDLE_ID_VILLAGE_HEAD_02 vegetables, _03 fruit, _04 flowers; the last number is the season.
    const catalogRows = activities.flatMap((e) => {
      const match = /^BUNDLE_ID_VILLAGE_HEAD_0([234])_0(\d)$/.exec(e.id);
      return match && Number(match[2]) === season + 1 ? [bundle(e, Number(match[1]) - 1)] : [];
    }).sort((a, b) => a.slot - b.slot);
    const notes = new Map<string, Entity[]>();
    for (const stack of [...shrine, ...catalogRows].flatMap((row) => row.items)) {
      const conditions = lateSeedConditions(catalog, stack.item.id, season);
      if (!conditions.length) continue;
      const label = conditions.join(' / ');
      const list = notes.get(label) ?? [];
      if (!list.some((item) => item.id === stack.item.id)) list.push(stack.item);
      notes.set(label, list);
    }
    const inShrine = new Set(shrine.flatMap((row) => row.items.map((stack) => stack.item.id)));
    const shared = new Set(catalogRows.flatMap((row) => row.items.map((stack) => stack.item.id)).filter((id) => inShrine.has(id)));
    const birthdays = catalog.entities.filter((e) => e.kind === 'characters' && e.birthday_season === key && e.birthday_day)
      .sort((a, b) => Number(a.birthday_day) - Number(b.birthday_day));
    return { season, key, shrine, catalog: catalogRows, seedNotes: [...notes].map(([condition, items]) => ({ condition, items })), shared, birthdays };
  });
}

/** The village head's entries that belong to no season, grouped by catalog page in ID order. */
export function yearRoundCatalog(catalog: Catalog): Array<{ page: string; bundles: PlanBundle[] }> {
  const { bundle } = index(catalog);
  const pages = new Map<string, PlanBundle[]>();
  for (const entity of catalog.entities.filter((e) => e.kind === 'activities').sort((a, b) => Number(a.numeric_id) - Number(b.numeric_id))) {
    const match = /^BUNDLE_ID_VILLAGE_HEAD_(\d+)_(\d+)$/.exec(entity.id);
    if (!match || ['02', '03', '04'].includes(match[1])) continue;
    // The catalog writes the page after the book's name: "村长家交付委托目录 · 交付加工品". // i18n-ignore
    const page = String(entity.location ?? '').split(' · ').at(-1) ?? '';
    pages.set(page, [...pages.get(page) ?? [], bundle(entity, Number(match[2]))]);
  }
  return [...pages].map(([page, bundles]) => ({ page, bundles }));
}

/** Seeds and saplings added in Year 2 and Year 3, by the year and season they go on sale. */
export function laterSeeds(catalog: Catalog): Array<{ year: number; season: number; seeds: Entity[] }> {
  const { items } = index(catalog);
  const groups = new Map<string, { year: number; season: number; seeds: Entity[] }>();
  for (const offer of catalog.entities.filter((e) => e.kind === 'store-offers')) {
    const flag = ((offer.required_flags ?? []) as number[]).find((value) => value in LATER_YEAR_FLAGS);
    const seed = items.get(String(offer.item_id));
    if (flag === undefined || !seed) continue;
    const { year, season } = LATER_YEAR_FLAGS[flag];
    const group = groups.get(`${year}-${season}`) ?? { year, season, seeds: [] };
    if (!group.seeds.some((entry) => entry.id === seed.id)) group.seeds.push(seed);
    groups.set(`${year}-${season}`, group);
  }
  return [...groups.values()].sort((a, b) => a.year - b.year || a.season - b.season);
}
