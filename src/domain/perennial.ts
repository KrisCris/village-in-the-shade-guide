import type {Entity, Perennial} from '../data/types';

export type Harvest = {day: number; quantity: number};
type Stage = {state: number; item_id: string; quantity: number};

/** Harvests of one grown perennial over the bearing days first..last (inclusive), or null when its data is incomplete.
 * A shrub is picked on `first` and then every rebear_days; `pick` is its harvest_quantity.
 * A tree adds fruit_per_day each day up to its capacity and is shaken when full and on `last`. */
export function bearingHarvests(perennial: Perennial, pick: number | null | undefined, first: number, last: number): Harvest[] | null {
  const harvests: Harvest[] = [];
  if (perennial.kind === 'shrub') {
    if (!pick || !(pick > 0) || !(perennial.rebear_days > 0)) return null;
    for (let day = first; day <= last; day += perennial.rebear_days) harvests.push({day, quantity: pick});
    return harvests;
  }
  const {fruit_per_day: fruit, fruit_capacity: capacity} = perennial;
  if (!(fruit > 0) || capacity == null || !(capacity > 0)) return null;
  const every = Math.max(1, Math.floor(capacity / fruit));
  let shaken = first - 1;
  for (let day = shaken + every; day <= last; day += every) {harvests.push({day, quantity: fruit * (day - shaken)}); shaken = day;}
  if (first <= last && shaken < last) harvests.push({day: last, quantity: fruit * (last - shaken)});
  return harvests;
}

/** Items a shrub pick drops besides `harvestId`, per plant; mulberry gives leaves and berries together. */
export function shrubCoProducts(crop: Entity, harvestId: string): Array<{itemId: string; quantity: number}> {
  if (crop.perennial?.kind !== 'shrub') return [];
  return ((crop.harvest_stages ?? []) as Stage[]).filter(stage => stage.state === 5 && stage.item_id !== harvestId)
    .map(stage => ({itemId: stage.item_id, quantity: stage.quantity}));
}
