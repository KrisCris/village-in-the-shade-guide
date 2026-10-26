import type { Catalog, Entity } from '../data/types';
import { cropProcessingOptions, type CropProcessingResult } from './cropProcessing';
import { seedAvailability } from './seedAvailability';
import { DAYS_PER_SEASON, SEASONS } from './dailyDigest';

/**
 * What to sow on the empty part of the farm area today. A crop qualifies when
 * it grows this season on tilled soil or ridges, ripens before it stops, and
 * its seeds are held or on sale. Crops still owed to deliveries come first;
 * the rest are ranked by the profit planner's best result for one cell over
 * the turnovers left (seed cost, regrowth and processing included), counting
 * only recipes whose machines are on the farm and still have time free.
 */
export interface PlantingIdea {
  crop: Entity;
  seed: { item: Entity; held: number; buyable: boolean; places: string[] };
  harvests: number;
  best: CropProcessingResult;
  /** Selling the harvest without processing. */
  direct?: CropProcessingResult;
  /** Harvest items deliveries are still missing. */
  needed: number;
}

export function plantingIdeas(input: {
  catalog: Catalog;
  date: { year: number; season: number; day: number };
  /** crops.dat soil rules by numeric crop: 1 tilled soil, 2 ridge, 3 paddy. */
  soils: Readonly<Record<string, { soils: number[] }>>;
  heldSeeds: ReadonlyMap<number, number>;
  /** Missing delivery items by numeric item ID. */
  needs: ReadonlyMap<number, number>;
  /** Recipes (gimmickprocess IDs) whose machines are on the farm and can take more work. */
  canProcess?: (process: number) => boolean;
}): PlantingIdea[] {
  const { catalog, date } = input;
  const season = SEASONS[date.season], next = SEASONS[(date.season + 1) % 4];
  const turnovers = DAYS_PER_SEASON - date.day;
  const numeric = (id: string | undefined) => id ? catalog.byId[id]?.numeric_id as number | undefined : undefined;
  return catalog.entities.flatMap((crop): PlantingIdea[] => {
    if (crop.kind !== 'crops' || crop.perennial || typeof crop.numeric_id !== 'number') return [];
    const seasons = (crop.seasons ?? []) as string[];
    if (!seasons.includes(season) || !input.soils[crop.numeric_id]?.soils.some((soil) => soil === 1 || soil === 2)) return [];
    // A crop that also grows next season can ripen after the change; others must ripen before it.
    const days = seasons.includes(next) ? turnovers + DAYS_PER_SEASON : turnovers;
    if (!(Number(crop.growth_days) <= days)) return [];
    const seedId = (crop.seed_item_ids as string[] | undefined)?.[0], seed = seedId ? catalog.byId[seedId] : undefined;
    if (!seed) return [];
    const held = input.heldSeeds.get(numeric(seedId) ?? -1) ?? 0;
    const sale = seedAvailability(crop, catalog.entities, date.year, season);
    if (!held && !sale.available) return [];
    const options = cropProcessingOptions(crop, catalog, 'normal', days, true)
      .filter((option) => !option.process || (input.canProcess?.(Number(option.process.numeric_id)) ?? true));
    const best = options.reduce<CropProcessingResult | undefined>((top, option) => !top || option.net > top.net ? option : top, undefined);
    if (!best || best.net <= 0) return [];
    const harvested = ((crop.harvest_item_ids ?? []) as string[]).map(numeric);
    return [{
      crop, seed: { item: seed, held, buyable: sale.available, places: sale.locations }, harvests: best.harvestCount, best,
      direct: options.find((option) => !option.process), needed: harvested.reduce((sum: number, id) => sum + (id ? input.needs.get(id) ?? 0 : 0), 0),
    }];
  }).sort((a, b) => Number(b.needed > 0) - Number(a.needed > 0) || b.best.net - a.best.net);
}
