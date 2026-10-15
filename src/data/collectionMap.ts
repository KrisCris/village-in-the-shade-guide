import type { Locale } from '../i18n/locales';
/**
 * The village minimap covers the openworld map head. Build 25311578 renamed it
 * from map_0000_spr to map_0000_ver120_spr; other heads (map_2140 地下通路,
 * map_2150 迷い森, map_2160 藪, map_2170 峠) use their own coordinate spaces
 * and cannot be drawn on the minimap.
 */
export const isVillageMap = (map: string) => /(^|\/)map_0000(_ver\d+)?_spr\.ymwr/.test(map);

/** Village map with place names in the site language; built by tools/extract-map-markers.py. */
export const minimapImage = (locale: Locale) => `/maps/minimap_01_spr${({ 'zh-CN': '_sc', 'zh-TW': '_tc', ja: '' } as const)[locale]}.webp`;

export type MapArea = 'village' | 'subway' | 'lost-forest' | 'bush' | 'pass';
export type MapKind = 'book' | 'machine_part' | 'ghost_rat' | 'red_phone' | 'treasure' | 'turn_in' | 'shrine' | 'exchange';

const AREA_HEADS: Array<[RegExp, MapArea]> = [[/map_2140/, 'subway'], [/map_2150/, 'lost-forest'], [/map_2160/, 'bush'], [/map_2170/, 'pass']];
export function mapArea(map: string): MapArea {
  if (isVillageMap(map)) return 'village';
  const area = AREA_HEADS.find(([pattern]) => pattern.test(map))?.[1];
  if (!area) throw new Error(`Unknown map head: ${map}`);
  return area;
}

/** Anchors are unique except the one ghost rat each side area places at pop_ghostRat00. */
export const markerId = (kind: MapKind, area: MapArea, anchor: string) =>
  kind === 'ghost_rat' && area !== 'village' ? `${area}-${anchor}` : anchor;

/** Browser-only checklist of collected markers; ignores ids the page no longer has. */
export const COLLECTED_KEY = 'collection-map:collected';
export function parseCollected(raw: string | null, ids: ReadonlySet<string>): Set<string> {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && ids.has(id)) : []);
  } catch {
    return new Set();
  }
}

export type MinimapProjection = { offset_x: number; offset_y: number; scale_divisor: number };
/** World coordinates to minimap pixels (gamedefine.dat MINIMAP_ZOOM_RATE and offsets). */
export const projectMinimap = (point: { x: number; y: number }, projection: MinimapProjection) => ({
  x: point.x / projection.scale_divisor + projection.offset_x,
  y: point.y / projection.scale_divisor + projection.offset_y,
});
