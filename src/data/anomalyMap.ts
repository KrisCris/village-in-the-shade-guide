import { projectMinimap, type MinimapProjection } from './collectionMap';

/** Side length of the village minimap image in pixels. */
export const MINIMAP_SIZE = 4096;

export type MapShape = 'number' | 'dot' | 'square' | 'star';
export interface MapLayer {
  label: string;
  /** Marker fill; markers get a dark outline so any fill reads on the map. */
  color: string;
  shape: MapShape;
  /** World coordinates from data/sources/game-anomalies.json map_points. */
  points: Array<{ x: number; y: number }>;
  /** First number for 'number' layers (default 1), so several layers can share one sequence. */
  start?: number;
}
export interface MapPin { left: number; top: number; color: string; shape: MapShape; text?: string }
export interface MapFrame { x: number; y: number; width: number; height: number }

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Crop of the minimap around every point, padded, at least `minWidth` wide and between
 * 1:1 and 16:9 so a single point still shows its surroundings. Stays inside the image.
 */
export function mapFrame(points: Array<{ x: number; y: number }>, pad = 70, minWidth = 380): MapFrame {
  if (!points.length) throw new Error('mapFrame needs at least one point');
  let x0 = Math.min(...points.map((p) => p.x)) - pad, x1 = Math.max(...points.map((p) => p.x)) + pad;
  let y0 = Math.min(...points.map((p) => p.y)) - pad, y1 = Math.max(...points.map((p) => p.y)) + pad;
  const grow = (a: number, b: number, size: number): [number, number] => {
    const extra = (size - (b - a)) / 2;
    return extra > 0 ? [a - extra, b + extra] : [a, b];
  };
  [x0, x1] = grow(x0, x1, minWidth);
  [x0, x1] = grow(x0, x1, y1 - y0);
  [y0, y1] = grow(y0, y1, (x1 - x0) * 9 / 16);
  const fit = (a: number, b: number): [number, number] => {
    const size = Math.min(b - a, MINIMAP_SIZE);
    const start = Math.max(0, Math.min(a, MINIMAP_SIZE - size));
    return [start, start + size];
  };
  [x0, x1] = fit(x0, x1);
  [y0, y1] = fit(y0, y1);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}

/** Pins as percentages of the frame; numbered layers count up in the given order. */
export function mapPins(layers: MapLayer[], projection: MinimapProjection) {
  const projected = layers.map((layer) => layer.points.map((p) => projectMinimap(p, projection)));
  const frame = mapFrame(projected.flat());
  const pins: MapPin[] = layers.flatMap((layer, i) => projected[i].map((p, n) => ({
    left: round((p.x - frame.x) / frame.width * 100),
    top: round((p.y - frame.y) / frame.height * 100),
    color: layer.color,
    shape: layer.shape,
    ...(layer.shape === 'number' && { text: String((layer.start ?? 1) + n) }),
  })));
  return { frame, pins };
}
