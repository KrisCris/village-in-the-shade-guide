import type { Catalog, Entity } from '../data/types';
import type { Quality } from './quality';
import { qualityPrice } from './quality';

export type ProfitResult = {
  inputCost: number;
  outputValue: number;
  net: number;
  durationDays: number | null;
  perDay: number | null;
  harvests?: number;
};

function itemPrice(catalog: Catalog, itemId: string | undefined, field: 'buy_price' | 'sell_price', quality: Quality): number | null {
  const item = itemId ? catalog.byId[itemId] : undefined;
  if (!item) return null;
  return qualityPrice(item[field], item.quality_eligible === true, quality)?.value ?? null;
}

export function calculateEntityProcessProfit(entity: Entity, catalog: Catalog, quality: Quality): ProfitResult | null {
  if (entity.kind !== 'processes') return null;
  const inputs = (entity.inputs ?? []) as Array<{ item_id?: string; quantity?: number }>;
  const output = entity.output as { item_id?: string; quantity?: number } | undefined;
  if (!output?.item_id) return null;
  let inputCost = 0;
  for (const input of inputs) {
    const value = itemPrice(catalog, input.item_id, 'sell_price', quality);
    if (value == null) return null;
    inputCost += value * Number(input.quantity ?? 1);
  }
  const unitOutput = itemPrice(catalog, output.item_id, 'sell_price', quality);
  if (unitOutput == null) return null;
  return calculateProcessProfit({ inputCost, outputValue: unitOutput * Number(output.quantity ?? 1), durationMinutes: typeof entity.duration_minutes === 'number' ? entity.duration_minutes : null });
}

export function calculateEntityCropProfit(entity: Entity, catalog: Catalog, quality: Quality): ProfitResult | null {
  if (entity.kind !== 'crops') return null;
  const growthDays = typeof entity.growth_days === 'number' ? entity.growth_days : null;
  if (growthDays == null || growthDays <= 0) return null;
  const seedId = (entity.seed_item_ids as string[] | undefined)?.[0];
  const harvestId = (entity.harvest_item_ids as string[] | undefined)?.[0];
  const seedCost = itemPrice(catalog, seedId, 'buy_price', 'normal');
  const harvestValue = itemPrice(catalog, harvestId, 'sell_price', quality);
  if (seedCost == null || harvestValue == null) return null;
  return calculateCropProfit({ seedCost, harvestValue, growthDays, regrowDays: typeof entity.regrow_days === 'number' ? entity.regrow_days : null });
}

export function calculateProcessProfit(input: {
  inputCost: number;
  outputValue: number;
  durationMinutes?: number | null;
}): ProfitResult {
  const durationDays = input.durationMinutes == null ? null : input.durationMinutes / 1440;
  const net = input.outputValue - input.inputCost;
  return {
    inputCost: input.inputCost,
    outputValue: input.outputValue,
    net,
    durationDays,
    perDay: durationDays && durationDays > 0 ? net / durationDays : null,
  };
}

export function calculateCropProfit(input: { seedCost: number; harvestValue: number; harvests?: number; growthDays?: number | null; regrowDays?: number | null; seasonDays?: number }): ProfitResult {
  const seasonDays = input.seasonDays ?? 28;
  const fittedHarvests = input.growthDays
    ? input.regrowDays
      ? 1 + Math.max(0, Math.floor((seasonDays - input.growthDays) / input.regrowDays))
      : Math.max(1, Math.floor(seasonDays / input.growthDays))
    : 1;
  const harvests = Math.max(1, input.harvests ?? fittedHarvests);
  const outputValue = input.harvestValue * harvests;
  const inputCost = input.seedCost * (input.regrowDays ? 1 : harvests);
  const net = outputValue - inputCost;
  return { inputCost, outputValue, net, durationDays: input.growthDays ?? null, perDay: input.growthDays ? net / seasonDays : null, harvests };
}
