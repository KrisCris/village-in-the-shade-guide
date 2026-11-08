/**
 * Quarry floors as the game builds them (village.exe build 25640656; trace in
 * tools/extract-quarry.py).
 *
 * A layout's rock cells are the YMWR cells flagged 0x10. A floor's rock density
 * is the percent of those cells that get a rock, and each rock type's weight is
 * its percent of that total. Every type on the list gets at least one rock, so
 * small totals over-represent rare rocks. The game does this sum in single
 * precision; Math.fround follows it.
 */
export type RockWeight = { rock: number; weight: number };
export type FloorKind = 'normal' | 'rest' | 'bottom';

const f32 = Math.fround;
/** Copper, iron and gold deposit rocks take the shrine ability's weight bonus. */
export const BONUS_ROCKS = new Set([1307, 1308, 1309]);

/** Rocks per type for one layout, in list order. `bonus` is the shrine ability's extra weight. */
export function rockCounts(rows: RockWeight[], density: number, cells: number, bonus = 0): number[] {
  const scaled = f32(f32(f32(f32(density) / 100) * f32(cells)) + 0.5);
  const total = Math.trunc(scaled);
  if (total <= 0) return rows.map(() => 0);
  // Each type is filled to its target in list order; the total only decides whether
  // to try again after placements that did not fit, which this model leaves out.
  return rows.map(row => Math.trunc(Math.max(1, f32(f32(f32((row.weight + (BONUS_ROCKS.has(row.rock) ? bonus : 0)) / 100) * scaled) + 0.5))));
}

/** Average rocks per type over equally likely layouts. */
export function expectedRockCounts(rows: RockWeight[], density: number, layoutCells: number[], bonus = 0): number[] {
  const sums = rows.map(() => 0);
  for (const cells of layoutCells) rockCounts(rows, density, cells, bonus).forEach((count, index) => { sums[index] += count; });
  return sums.map(sum => layoutCells.length ? sum / layoutCells.length : 0);
}

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Floors 1–40 use the first tileset, 41–80 the second, 81 and deeper the third (from the layout key suffix). */
export const tilesetOf = (layout: string) => Number(/_dg0(\d)$/.exec(layout)?.[1] ?? 0);
