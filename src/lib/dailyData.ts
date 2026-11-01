import type { DailyPayload } from '../data/dailyPayload';
import type { Catalog, Entity } from '../data/types';
import { dataHref } from '../i18n/active';

/**
 * The daily planner's lookup tables (`daily-data.json`) and the profit
 * planner's crop and recipe entities (`planner-data.json`), fetched once a
 * save is open. The planner entities become a small catalog for the profit
 * maths the planting suggestions reuse.
 */
export interface DailyData { payload: DailyPayload; crops: Catalog }

let pending: Promise<DailyData> | null = null;

async function json<T>(path: string): Promise<T> {
  const response = await fetch(dataHref(path));
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

export function loadDailyData(): Promise<DailyData> {
  pending ??= Promise.all([json<DailyPayload>('/daily-data.json'), json<Entity[]>('/planner-data.json')]).then(([payload, entities]) => ({
    payload,
    crops: { buildId: '', generatedAt: '', entities, byId: Object.fromEntries(entities.map((entity) => [entity.id, entity])), counts: {} },
  })).catch((error) => { pending = null; throw error; });
  return pending;
}

/** Per-player choices on the daily page, kept in the browser beside the farm area. */
export interface DailySettings {
  /** Recipe per produce item; 0 to sell it raw. Items not listed follow the plan. */
  choices: Record<string, number>;
}
export const DEFAULT_SETTINGS: DailySettings = { choices: {} };
const SETTINGS_KEY = 'village-daily:settings:v1';

export function readSettings(storage: Storage | undefined, player: string): DailySettings {
  try {
    const all = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}') as Record<string, Partial<DailySettings>>;
    const saved = all?.[player];
    if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
    return { choices: Object.fromEntries(Object.entries(saved.choices ?? {}).filter(([, value]) => Number.isInteger(value))) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(storage: Storage | undefined, player: string, settings: DailySettings): boolean {
  if (!storage) return false;
  try {
    const all = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, DailySettings>;
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...(all && typeof all === 'object' ? all : {}), [player]: settings }));
    return true;
  } catch {
    try { storage.setItem(SETTINGS_KEY, JSON.stringify({ [player]: settings })); return true; } catch { return false; }
  }
}

/** Ticked-off tasks per player for one save, named by its date and time; any other save starts the list fresh. */
const DONE_KEY = 'village-daily:done:v1';

export function readDone(storage: Storage | undefined, player: string, save: string): string[] {
  try {
    const saved = (JSON.parse(storage?.getItem(DONE_KEY) ?? '{}') as Record<string, { save?: unknown; keys?: unknown }>)?.[player];
    return saved?.save === save && Array.isArray(saved.keys) ? saved.keys.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

export function writeDone(storage: Storage | undefined, player: string, save: string, keys: string[]): boolean {
  if (!storage) return false;
  const entry = { save, keys };
  try {
    const all = JSON.parse(storage.getItem(DONE_KEY) ?? '{}') as Record<string, unknown>;
    storage.setItem(DONE_KEY, JSON.stringify({ ...(all && typeof all === 'object' ? all : {}), [player]: entry }));
    return true;
  } catch {
    try { storage.setItem(DONE_KEY, JSON.stringify({ [player]: entry })); return true; } catch { return false; }
  }
}
