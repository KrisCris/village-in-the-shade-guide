import type {Catalog, Entity} from '../data/types';
import {qualityPrice, type Quality} from './quality';

export type HarvestOption = {item: Entity; firstPoints: number; regrowPoints: number; quantity: number;
  /** Sale value per day at 100 growth points a day, once the plant is regrowing; null without a price. */
  perDay: number | null};

type Stage = {state: number; growth_points: number; item_id: string; quantity: number};

/** Items a regrowing plant can be picked for at different growth points (豌豆 gives 荷兰豆 early), earliest first. */
export function harvestOptions(crop: Entity, catalog: Catalog, quality: Quality): HarvestOption[] {
  const stages = (crop.harvest_stages ?? []) as Stage[];
  const regrowth = stages.filter(stage => stage.state === 4);
  if (new Set(regrowth.map(stage => stage.item_id)).size < 2) return [];
  return regrowth.flatMap(stage => {
    const first = stages.find(row => row.state === 1 && row.item_id === stage.item_id);
    const item = catalog.byId[stage.item_id];
    if (!first || !item || !(stage.growth_points > 0)) return [];
    const price = qualityPrice(item.sell_price, item.quality_eligible === true, quality)?.value;
    return [{item, firstPoints: first.growth_points, regrowPoints: stage.growth_points, quantity: stage.quantity,
      perDay: price == null ? null : stage.quantity * price * 100 / stage.growth_points}];
  }).sort((a, b) => a.firstPoints - b.firstPoints);
}
