import type {Catalog, Entity} from '../data/types';
import {bearingHarvests, shrubCoProducts, type Harvest} from './perennial';
import {qualityPrice, type Quality} from './quality';

export type CropProcessingResult = {crop: Entity; process: Entity | null; output: Entity; harvestCount: number; harvested: number; batches: number; seedCost: number; revenue: number; net: number; processingGain: number; machineDays: number; finishDay: number; netPerDay: number; soldWithinMonth: number; monthNet: number;
  /** Seeds sown on the plot: one for regrowing crops and perennials, one per harvest otherwise. */
  plantings: number; seedPrice: number; regrows: boolean; netPerSeed: number;
  /** Days after planting (for perennials, after the bearing season starts) on which the plot is harvested. */
  harvestDays: number[];
  /** Merged [start, end] spans in days while the machine is processing. */
  machineRuns: Array<[number, number]>;
  /** Items picked together with the modelled harvest and sold as they are, such as mulberry's berries. */
  coProducts: Array<{itemId: string; count: number; value: number}>;
  perennial: PerennialPlan | null};

/** Shrubs and fruit trees stay planted: the sapling is bought once and bears only in its own season. */
export type PerennialPlan = {
  /** Planted the season before, so it is grown on day 1; otherwise planted on day 1 and bearing once grown. */
  plantedAhead: boolean;
  /** A later bearing season, when the plant is already grown and no sapling is bought. */
  laterNet: number; laterNetPerDay: number};

type Extra = {itemId: string; quantity: number; price: number};
type Recipe = {inputs: number; outputs: number; price: number; batchDays: number};

/** One plot, one machine, planting on day 1; no fertiliser or machine purchase costs.
 * A perennial's month is its bearing season; planted ahead, it is grown when the season starts. */
// netPerDay spreads the whole batch's net over planting → harvest → processing → last sale.
const perDay = (net: number, finishDay: number) => finishDay > 0 ? net / finishDay : 0;

function schedule(crop: Entity, days: number, plantedAhead: boolean): {harvests: Harvest[]; plantings: number; regrows: boolean} | null {
  const growth = Number(crop.growth_days);
  const quantity = Number(crop.harvest_quantity);
  const perennial = crop.perennial;
  if (!growth) return null;
  if (!perennial) {
    if (!quantity) return null;
    const harvests: Harvest[] = [];
    const regrow = Number(crop.regrow_days) || 0;
    for (let day = growth; day <= days; day += regrow || growth) harvests.push({day, quantity});
    // Long-growing crops retain a first-cycle estimate, but no fictitious monthly sale.
    if (!harvests.length) harvests.push({day: growth, quantity});
    return {harvests, plantings: regrow ? 1 : harvests.length, regrows: regrow > 0};
  }
  const harvests = bearingHarvests(perennial, quantity, plantedAhead ? 1 : growth, days);
  return harvests?.length ? {harvests, plantings: 1, regrows: true} : null;
}

function coHarvest(crop: Entity, harvestId: string, catalog: Catalog, quality: Quality): Extra[] {
  return shrubCoProducts(crop, harvestId).flatMap(({itemId, quantity}) => {
    const item = catalog.byId[itemId];
    const price = item && qualityPrice(item.sell_price, item.quality_eligible === true, quality)?.value;
    return price == null ? [] : [{itemId, quantity, price}];
  });
}

function sell(harvests: Harvest[], days: number, rawPrice: number, extras: Extra[], recipe: Recipe | null) {
  const harvested = harvests.reduce((sum, harvest) => sum + harvest.quantity, 0);
  const lastDay = harvests[harvests.length - 1].day;
  const within = harvests.filter(harvest => harvest.day <= days);
  const extraValue = extras.reduce((sum, extra) => sum + extra.quantity * extra.price, 0);
  if (!recipe) {
    const soldWithinMonth = within.reduce((sum, harvest) => sum + harvest.quantity, 0);
    return {harvested, batches: 0, revenue: harvested * rawPrice + harvests.length * extraValue, finishDay: lastDay, soldWithinMonth,
      monthRevenue: soldWithinMonth * rawPrice + within.length * extraValue, machineRuns: [] as Array<[number, number]>};
  }
  let stored = 0, batches = 0, finishDay = 0, soldWithinMonth = 0;
  const machineRuns: Array<[number, number]> = [];
  for (const {day, quantity} of harvests) {
    stored += quantity;
    while (stored >= recipe.inputs) {
      stored -= recipe.inputs;
      const start = Math.max(finishDay, day);
      finishDay = start + recipe.batchDays;
      const last = machineRuns[machineRuns.length - 1];
      if (last && start <= last[1]) last[1] = finishDay;
      else machineRuns.push([start, finishDay]);
      batches++;
      if (finishDay <= days) soldWithinMonth += recipe.outputs;
    }
  }
  if (!batches) return null;
  return {harvested, batches, revenue: batches * recipe.outputs * recipe.price + stored * rawPrice + harvests.length * extraValue, finishDay, soldWithinMonth,
    monthRevenue: soldWithinMonth * recipe.price + (lastDay <= days ? stored * rawPrice : 0) + within.length * extraValue, machineRuns};
}

export function cropProcessingOptions(crop: Entity, catalog: Catalog, quality: Quality, days = 28, includeDirectSale = false, plantedAhead = true): CropProcessingResult[] {
  const harvestId = (crop.harvest_item_ids as string[] | undefined)?.[0];
  const seedId = (crop.seed_item_ids as string[] | undefined)?.[0];
  const seed = seedId ? catalog.byId[seedId] : undefined;
  const harvest = harvestId ? catalog.byId[harvestId] : undefined;
  const plot = schedule(crop, days, plantedAhead);
  if (!plot || !harvestId || !seed || seed.buy_price == null || !harvest) return [];
  const rawPrice = qualityPrice(harvest.sell_price, harvest.quality_eligible === true, quality)?.value;
  if (rawPrice == null) return [];
  const seedPrice = Number(seed.buy_price);
  const seedCost = seedPrice * plot.plantings;
  const extras = coHarvest(crop, harvestId, catalog, quality);
  const direct = sell(plot.harvests, days, rawPrice, extras, null)!;
  const later = crop.perennial ? schedule(crop, days, true) : null;
  const result = (process: Entity | null, output: Entity, recipe: Recipe | null): CropProcessingResult[] => {
    const sale = sell(plot.harvests, days, rawPrice, extras, recipe);
    if (!sale) return [];
    const net = sale.revenue - seedCost;
    const after = (later && sell(later.harvests, days, rawPrice, extras, recipe)) ?? sale;
    return [{crop, process, output, harvestCount: plot.harvests.length, harvested: sale.harvested, batches: sale.batches, seedCost, revenue: sale.revenue, net,
      processingGain: sale.revenue - direct.revenue, machineDays: recipe ? sale.batches * recipe.batchDays : 0, finishDay: sale.finishDay, netPerDay: perDay(net, sale.finishDay),
      soldWithinMonth: sale.soldWithinMonth, monthNet: sale.monthRevenue - seedCost,
      plantings: plot.plantings, seedPrice, regrows: plot.regrows, netPerSeed: net / plot.plantings, harvestDays: plot.harvests.map(harvest => harvest.day), machineRuns: sale.machineRuns,
      coProducts: extras.map(extra => ({itemId: extra.itemId, count: extra.quantity * plot.harvests.length, value: extra.quantity * extra.price * plot.harvests.length})),
      perennial: crop.perennial ? {plantedAhead, laterNet: after.revenue, laterNetPerDay: perDay(after.revenue, after.finishDay)} : null}];
  };
  const options = catalog.entities.flatMap(process => {
    if (process.kind !== 'processes') return [];
    const inputs = (process.inputs ?? []) as Array<{item_id: string; quantity: number}>;
    const out = process.output as {item_id: string; quantity: number};
    if (inputs.length !== 1 || inputs[0].item_id !== harvestId || !(inputs[0].quantity > 0) || !out?.item_id || !(out.quantity > 0)) return [];
    const output = catalog.byId[out.item_id];
    const price = output && qualityPrice(output.sell_price, output.quality_eligible === true, quality)?.value;
    if (price == null || !(Number(process.duration_minutes) > 0)) return [];
    return result(process, output, {inputs: inputs[0].quantity, outputs: out.quantity, price, batchDays: Number(process.duration_minutes) / 1440});
  });
  if (includeDirectSale) options.push(...result(null, harvest, null));
  return options;
}
