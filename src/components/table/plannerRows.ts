import type {Entity} from '../../data/types';
import type {CropProcessingResult} from '../../domain/cropProcessing';

export type PlannerSortKey = 'name' | 'netPerDay' | 'netPerSeed' | 'finishDay' | 'monthNet';
export type PlannerGroup = {crop: CropProcessingResult['crop']; options: CropProcessingResult[]};

/** Direction a column starts in: names A–Z, sell-out time shortest first, money largest first. */
export const firstDirection = (key: PlannerSortKey): 'asc' | 'desc' => key === 'name' || key === 'finishDay' ? 'asc' : 'desc';

/** Shrubs and fruit trees are listed in the season they bear in, not the seasons their sapling can go in. */
export const listedIn = (crop: Entity, season: string) => crop.perennial ? crop.perennial.bearing_seasons.includes(season) : ((crop.seasons ?? []) as string[]).includes(season);

/** The game starts on the first day of spring, so nothing can be planted the season before. */
export const canPlantAhead = (year: number, season: string) => !(year === 1 && season === 'spring');

export const optionKey = (row: CropProcessingResult) => row.crop.id + ':' + (row.process?.id ?? 'direct-sale');

/** Groups a crop's options under its best one for the active sort, then orders crops by that option. */
export function groupPlannerRows(rows: CropProcessingResult[], sort: PlannerSortKey, direction: 'asc' | 'desc', lang: string): PlannerGroup[] {
  const compare = (a: CropProcessingResult, b: CropProcessingResult) => {
    const diff = sort === 'name' ? a.crop.name.zh_hans.localeCompare(b.crop.name.zh_hans, lang) || b.netPerDay - a.netPerDay : a[sort] - b[sort];
    return direction === 'asc' ? diff : -diff;
  };
  const groups = new Map<string, PlannerGroup>();
  for (const row of rows) {
    const group = groups.get(row.crop.id) ?? {crop: row.crop, options: []};
    group.options.push(row);
    groups.set(row.crop.id, group);
  }
  // Within a crop, names tie, so name sorting keeps the most profitable option first.
  for (const group of groups.values()) group.options.sort(sort === 'name' ? (a, b) => b.netPerDay - a.netPerDay : compare);
  return [...groups.values()].sort((a, b) => compare(a.options[0], b.options[0]));
}
