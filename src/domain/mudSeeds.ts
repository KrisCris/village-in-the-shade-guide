import { DAYS_PER_SEASON } from './dailyDigest';

/**
 * Dorotabo Seed (泥の種) timing, from data/sources/game-curse-items.json
 * (tools/extract-curse-items.py traced the rules in village.exe):
 * - The seed grows into its pick after one watered night on either soil.
 * - The pick starts at its first stage's growth points, then gains 100 a
 *   watered night on its preferred soil and `other_soil` on the other one.
 * - It turns cursed, or tries for a giant, the night it reaches `points[1]`.
 *   The season check runs first that night, so it has to get there by the
 *   last day of the season.
 */
export type MudOutcome = 'cursed' | 'giant' | 'season_end' | 'none';
export type MudEntry = {
  crop: string;
  outcome: MudOutcome | string;
  ridge: boolean;
  points: number[];
  other_soil: number;
  item?: string;
  giant?: string;
};
export type MudGrowth = { preferred_soil: number; seed_nights: number };
export type Soil = 'tilled' | 'ridge';
export const SOILS: readonly Soil[] = ['tilled', 'ridge'];

/** Outcomes that give a cursed item. */
export const yieldsCursed = (entry: MudEntry) => entry.outcome !== 'none' && !!entry.item;

/** Watered nights from planting until the pick ripens on this soil. */
export function mudSeedNights(entry: MudEntry, soil: Soil, growth: MudGrowth): number {
  const [first, ripe] = entry.points;
  const speed = entry.ridge === (soil === 'ridge') ? growth.preferred_soil : entry.other_soil;
  return growth.seed_nights + Math.ceil((ripe - first) / speed);
}

export type SoilPlan = {
  soil: Soil;
  /** Latest day of the season to plant so every cursed outcome ripens by the last day. */
  lastDay: Record<Soil, number>;
  /** Nights for each cursed outcome, in pool order. */
  rows: Array<{ entry: MudEntry; nights: Record<Soil, number> }>;
};

/**
 * The soil for one season: the one whose slowest cursed outcome ripens
 * soonest (so planting can start latest), then the one with fewer nights in
 * total; tilled soil wins a full tie.
 */
export function mudSeedSoil(pool: MudEntry[], growth: MudGrowth, seasonDays = DAYS_PER_SEASON): SoilPlan {
  const rows = pool.filter(yieldsCursed).map((entry) => ({
    entry,
    nights: { tilled: mudSeedNights(entry, 'tilled', growth), ridge: mudSeedNights(entry, 'ridge', growth) },
  }));
  const slowest = (soil: Soil) => Math.max(...rows.map((row) => row.nights[soil]));
  const total = (soil: Soil) => rows.reduce((sum, row) => sum + row.nights[soil], 0);
  const soil = slowest('ridge') < slowest('tilled') || (slowest('ridge') === slowest('tilled') && total('ridge') < total('tilled')) ? 'ridge' : 'tilled';
  return { soil, lastDay: { tilled: seasonDays - slowest('tilled'), ridge: seasonDays - slowest('ridge') }, rows };
}
