/** Rotate farming axes clockwise into the game's map-facing orientation.
 * Saved cells remain in extraction coordinates so old selections stay attached
 * to the same ground. This is a rotation, never a mirrored/recounted shape.
 */
export const mapCell = (
  x: number,
  y: number,
  height: number,
): [number, number] => [height - 1 - y, x];
export const sourceCell = (
  x: number,
  y: number,
  height: number,
): [number, number] => [y, height - 1 - x];
