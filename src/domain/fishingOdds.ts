/** fish.dat kinds: 0 trash, 1 fish, 2 white rare fish, 3 cursed fish. */
export const WHITE_FISH = 2;

export type CatchRow = { item: string; weight: number };

/**
 * Chance of each item on one bite with no bait, from one spot/season/period's fishing.dat rows in table order.
 *
 * village.exe build 25311578, catch roll 0x14021AC00–0x14021B2C0 (see tools/extract-curse-items.py): every row
 * weighs int(weight*100), but a white fish (kind 2) weighs the running total of the rows before it divided by 99
 * ((x + mulhi(x, 0xA57EB503)) >> 6), so it ends up near 1% wherever it sits last.
 */
export function catchChances(rows: CatchRow[], kinds: Record<string, number>) {
  const weights: [string, number][] = [];
  let total = 0;
  for (const row of rows) {
    const weight = kinds[row.item] === WHITE_FISH ? Math.trunc(total / 99) : Math.trunc(row.weight * 100);
    weights.push([row.item, weight]);
    total += weight;
  }
  const result = new Map<string, number>();
  for (const [item, weight] of weights) result.set(item, (result.get(item) ?? 0) + (total ? weight / total : 0));
  return result;
}
