import type {Catalog, Entity} from '../data/types';
import {qualityPrice, type Quality} from './quality';

export type CropProcessingResult = {crop: Entity; process: Entity | null; output: Entity; harvestCount: number; harvested: number; batches: number; seedCost: number; revenue: number; net: number; processingGain: number; machineDays: number; finishDay: number; soldWithinMonth: number; monthNet: number};

/** One plot, one machine, planting on day 1; no fertiliser or machine purchase costs. */
export function cropProcessingOptions(crop: Entity, catalog: Catalog, quality: Quality, days = 28, includeDirectSale = false): CropProcessingResult[] {
  const growth = Number(crop.growth_days);
  const quantity = Number(crop.harvest_quantity);
  const harvestId = (crop.harvest_item_ids as string[] | undefined)?.[0];
  const seedId = (crop.seed_item_ids as string[] | undefined)?.[0];
  const seed = seedId ? catalog.byId[seedId] : undefined;
  const harvest = harvestId ? catalog.byId[harvestId] : undefined;
  if (!growth || !quantity || !seed || seed.buy_price == null || !harvest) return [];
  const rawPrice = qualityPrice(harvest.sell_price, harvest.quality_eligible === true, quality)?.value;
  if (rawPrice == null) return [];
  const regrow = Number(crop.regrow_days) || 0;
  const dates: number[] = [];
  for (let day = growth; day <= days; day += regrow || growth) dates.push(day);
  // Long-growing crops retain a first-cycle estimate, but no fictitious monthly sale.
  if (!dates.length) dates.push(growth);
  const seedCost = Number(seed.buy_price) * (regrow ? 1 : dates.length);
  const options:CropProcessingResult[] = catalog.entities.flatMap((process) => {
    if (process.kind !== 'processes') return [];
    const inputs = (process.inputs ?? []) as Array<{item_id: string; quantity: number}>;
    const out = process.output as {item_id: string; quantity: number};
    if (inputs.length !== 1 || inputs[0].item_id !== harvestId || !(inputs[0].quantity > 0) || !out?.item_id || !(out.quantity > 0)) return [];
    const output = catalog.byId[out.item_id];
    const price = output && qualityPrice(output.sell_price, output.quality_eligible === true, quality)?.value;
    if (price == null || !(Number(process.duration_minutes) > 0)) return [];
    let stored = 0, batches = 0, finishDay = 0, soldWithinMonth = 0;
    const batchDays = Number(process.duration_minutes) / 1440;
    for (const day of dates) {
      stored += quantity;
      while (stored >= inputs[0].quantity) {
        stored -= inputs[0].quantity;
        finishDay = Math.max(finishDay, day) + batchDays;
        batches++;
        if (finishDay <= days) soldWithinMonth += out.quantity;
      }
    }
    if (!batches) return [];
    const revenue = batches * out.quantity * price + stored * rawPrice;
    const harvested = quantity * dates.length;
    return [{crop,process,output,harvestCount:dates.length,harvested,batches,seedCost,revenue,net:revenue-seedCost,
      processingGain:revenue-harvested*rawPrice,machineDays:batches*batchDays,finishDay,
      soldWithinMonth,monthNet:soldWithinMonth*price+(dates[dates.length-1]<=days?stored*rawPrice:0)-seedCost}];
  });
  if (includeDirectSale) {
    const harvested=quantity*dates.length;
    const revenue=harvested*rawPrice;
    const soldWithinMonth=dates.filter(day=>day<=days).length*quantity;
    options.push({crop,process:null,output:harvest,harvestCount:dates.length,harvested,batches:0,seedCost,revenue,net:revenue-seedCost,processingGain:0,machineDays:0,finishDay:dates[dates.length-1],soldWithinMonth,monthNet:soldWithinMonth*rawPrice-seedCost});
  }
  return options;
}
