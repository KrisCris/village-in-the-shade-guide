import type { DailyCell } from './saveDaily';

/**
 * The cells a player means to farm. Saves forget empty farmland: about half
 * of the empty tilled soil and ridges turn back into plain ground each night.
 * So the area is remembered in the browser and grows with every save loaded;
 * cells the player removed by hand stay out even while they are tilled.
 */
export interface FarmArea { include: number[]; exclude: number[] }

export const FARM_AREA_KEY = 'village-daily:farm-area:v1';
export const emptyFarmArea = (): FarmArea => ({ include: [], exclude: [] });

const sortedUnique = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => a - b);

/** Add every tilled, ridge or paddy cell in the save, except cells removed by hand. */
export function learnFarmArea(area: FarmArea, cells: DailyCell[]): FarmArea {
  const excluded = new Set(area.exclude);
  return { include: sortedUnique([...area.include, ...cells.filter((cell) => cell.soil && !excluded.has(cell.id)).map((cell) => cell.id)]), exclude: area.exclude };
}

export function addToFarmArea(area: FarmArea, ids: number[]): FarmArea {
  const added = new Set(ids);
  return { include: sortedUnique([...area.include, ...ids]), exclude: area.exclude.filter((id) => !added.has(id)) };
}

export function removeFromFarmArea(area: FarmArea, ids: number[]): FarmArea {
  const removed = new Set(ids);
  return { include: area.include.filter((id) => !removed.has(id)), exclude: sortedUnique([...area.exclude, ...ids]) };
}

const validIds = (value: unknown): value is number[] => Array.isArray(value) && value.every((id) => Number.isSafeInteger(id) && id > 0);

/** Areas are kept per player name, so slots with different farms do not mix. Storage may be missing or blocked. */
export function readFarmArea(storage: Storage | undefined, player: string): FarmArea | null {
  try {
    const all = JSON.parse(storage?.getItem(FARM_AREA_KEY) ?? '{}') as Record<string, Partial<FarmArea>>;
    const area = all[player];
    return area && validIds(area.include) && validIds(area.exclude) ? { include: area.include, exclude: area.exclude } : null;
  } catch {
    return null;
  }
}

export function writeFarmArea(storage: Storage | undefined, player: string, area: FarmArea): boolean {
  if (!storage) return false;
  let all: Record<string, FarmArea> = {};
  try {
    const stored = JSON.parse(storage.getItem(FARM_AREA_KEY) ?? '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) all = stored;
  } catch { /* An unreadable value is replaced. */ }
  try {
    storage.setItem(FARM_AREA_KEY, JSON.stringify({ ...all, [player]: area }));
    return true;
  } catch {
    return false;
  }
}
