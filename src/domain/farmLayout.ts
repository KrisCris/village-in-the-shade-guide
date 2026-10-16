/** A farmland plot in farming axes, as in data/sources/game-farmland.json. */
export type FarmPlot = { width: number; height: number; cells: number[][] };

/**
 * Place non-overlapping size×size squares that lie entirely on farmland, scanning
 * row by row from the plot's corner. Greedy, so the count is a lower bound rather
 * than the best packing.
 */
export function packSquares(plot: FarmPlot, size: number): Array<[number, number]> {
  const farmland = new Set(plot.cells.map(([x, y]) => `${x},${y}`));
  const used = new Set<string>();
  const placed: Array<[number, number]> = [];
  for (let y = 0; y + size <= plot.height; y++) {
    for (let x = 0; x + size <= plot.width; x++) {
      const square: string[] = [];
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) square.push(`${x + dx},${y + dy}`);
      if (square.every((cell) => farmland.has(cell) && !used.has(cell))) {
        square.forEach((cell) => used.add(cell));
        placed.push([x, y]);
      }
    }
  }
  return placed;
}

/** A sprinkler in the middle of each square waters the other size² − 1 cells. */
export function sprinklerCoverage(plot: FarmPlot, size: number) {
  const squares = packSquares(plot, size).length;
  const watered = squares * (size * size - 1);
  return { squares, watered, share: plot.cells.length ? watered / plot.cells.length : 0 };
}
