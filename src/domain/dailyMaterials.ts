import { bestRecipe, itemSources, type ItemSource, type SourceContext } from './dailySources';

/**
 * Materials still missing for one of each machine the plan cannot build yet;
 * deliveries have already set theirs aside. When a short material is made in a
 * machine (bars from ore, charcoal), the inputs for the missing batches are
 * planned too, one level deep.
 */
export interface MaterialLine {
  itemId: number;
  need: number;
  /** Held and free after deliveries. */
  held: number;
  short: number;
  sources: ItemSource[];
  /** Set on inputs planned for making a short material in a machine. */
  for?: number;
}

export function planMaterials(needs: Array<[itemId: number, count: number]>, free: ReadonlyMap<number, number>, context: SourceContext): MaterialLine[] {
  const left = new Map<number, number>();
  const spare = (itemId: number) => left.get(itemId) ?? free.get(itemId) ?? 0;
  const lines: MaterialLine[] = [];
  const add = (itemId: number, need: number, parent?: number) => {
    const usable = spare(itemId), short = Math.max(0, need - usable);
    left.set(itemId, Math.max(0, usable - need));
    const line: MaterialLine = { itemId, need, held: free.get(itemId) ?? 0, short, sources: short ? itemSources(itemId, context) : [], ...(parent ? { for: parent } : {}) };
    lines.push(line);
    return line;
  };
  for (const [itemId, need] of needs.sort((a, b) => a[0] - b[0])) {
    const line = add(itemId, need);
    const recipe = line.short ? bestRecipe(itemId, context) : undefined;
    if (!recipe) continue;
    const batches = Math.ceil(line.short / recipe.count);
    for (const [input, count] of recipe.inputs) add(input, count * batches, itemId);
  }
  return lines;
}
