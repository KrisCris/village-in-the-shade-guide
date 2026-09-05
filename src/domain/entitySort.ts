import type { Entity } from '../data/types';
import type { Quality } from './quality';
import { qualityPrice } from './quality';
import { calculateCropProfit, calculateProcessProfit } from './profit';

export type SortField = 'name' | 'buy' | 'sell' | 'duration' | 'profit';
export type SortDirection = 'asc' | 'desc';
export type PriceIndex = Record<string, Pick<Entity, 'sell_price' | 'quality_eligible'>>;

export type EntityMetrics = {
  buy: number | null;
  sell: number | null;
  profit: number | null;
};

function indexedSellPrice(prices: PriceIndex, itemId: string | undefined, quantity: number, quality: Quality): number | null {
  const item = itemId ? prices[itemId] : undefined;
  if (!item || typeof item.sell_price !== 'number') return null;
  const price = qualityPrice(item.sell_price, item.quality_eligible === true, quality);
  return price ? price.value * quantity : null;
}

export function entityMetrics(row: Entity, quality: Quality, prices: PriceIndex = {}): EntityMetrics {
  if (row.source_kind === 'processes') {
    const variants = (row.variants ?? []) as Entity[];
    const metrics = variants.map((variant) => entityMetrics(variant, quality, prices));
    const known = (field: keyof EntityMetrics) => metrics.map((metric) => metric[field]).filter((value): value is number => value != null);
    const buys = known('buy');
    const sells = known('sell');
    const profits = known('profit');
    return {
      buy: buys.length ? Math.min(...buys) : typeof row.buy_price === 'number' ? row.buy_price : null,
      sell: sells.length ? Math.max(...sells) : qualityPrice(row.sell_price, row.quality_eligible === true, quality)?.value ?? null,
      profit: profits.length ? Math.max(...profits) : typeof row.profit_per_day === 'number' ? row.profit_per_day : null,
    };
  }
  if (row.kind === 'processes') {
    const inputs = (row.inputs ?? []) as Array<{ item_id?: string; quantity?: number }>;
    const output = row.output as { item_id?: string; quantity?: number } | undefined;
    const inputValues = inputs.map((input) => indexedSellPrice(prices, input.item_id, Number(input.quantity ?? 1), quality));
    const buy = inputValues.some((value) => value == null) ? null : inputValues.reduce<number>((sum, value) => sum + Number(value), 0);
    const sell = indexedSellPrice(prices, output?.item_id, Number(output?.quantity ?? 1), quality);
    const result = buy == null || sell == null
      ? null
      : calculateProcessProfit({ inputCost: buy, outputValue: sell, durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null });
    return { buy, sell, profit: result?.perDay ?? null };
  }

  const buy = typeof row.buy_price === 'number' ? row.buy_price : null;
  const sell = qualityPrice(row.sell_price, row.quality_eligible === true, quality)?.value ?? null;
  if (row.kind === 'crops' && buy != null && sell != null) {
    const result = calculateCropProfit({
      seedCost: buy,
      harvestValue: sell * Number(row.harvest_quantity ?? 1),
      growthDays: typeof row.growth_days === 'number' ? row.growth_days : null,
      regrowDays: typeof row.regrow_days === 'number' ? row.regrow_days : null,
    });
    return { buy, sell, profit: result.perDay };
  }
  return { buy, sell, profit: typeof row.profit_per_day === 'number' ? row.profit_per_day : null };
}

function sortValue(row: Entity, field: SortField, quality: Quality, prices: PriceIndex): string | number | null {
  if (field === 'name') return row.name.zh_hans;
  if (field === 'duration') {
    if (typeof row.duration_minutes === 'number') return row.duration_minutes;
    return typeof row.growth_days === 'number' ? row.growth_days * 1440 : null;
  }
  return entityMetrics(row, quality, prices)[field];
}

export function sortEntities(rows: Entity[], field: SortField, direction: SortDirection, quality: Quality, prices: PriceIndex = {}): Entity[] {
  const factor = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(row, field, quality, prices) }))
    .sort((a, b) => {
      if (a.value == null || b.value == null) {
        if (a.value == null && b.value == null) return a.index - b.index;
        return a.value == null ? 1 : -1;
      }
      const compared = typeof a.value === 'string'
        ? a.value.localeCompare(String(b.value), 'zh-CN')
        : a.value - Number(b.value);
      return compared === 0 ? a.index - b.index : compared * factor;
    })
    .map(({ row }) => row);
}
