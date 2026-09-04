import { findCatalogEntity } from '../data/entityLookup';
import type { Catalog, Entity } from '../data/types';

export type ProcessProductRow = Entity & {
  source_kind: 'processes';
  variant_ids: string[];
  variants: Entity[];
  variant_count: number;
  machine_ids: string[];
  net_profit: number | null;
  duration_max_minutes: number | null;
};

type VariantMetrics = { inputCost: number | null; outputValue: number | null; net: number | null; perDay: number | null };

function normalMetrics(process: Entity, catalog: Catalog): VariantMetrics {
  const inputs = (process.inputs ?? []) as Array<{ item_id: string; quantity?: number }>;
  const inputValues = inputs.map((input) => {
    const item = findCatalogEntity(catalog, input.item_id, 'items');
    return typeof item?.sell_price === 'number' ? item.sell_price * Number(input.quantity ?? 1) : null;
  });
  const output = process.output as { item_id?: string; quantity?: number } | undefined;
  const outputItem = findCatalogEntity(catalog, output?.item_id ?? '', 'items');
  const inputCost = inputValues.some((value) => value == null) ? null : inputValues.reduce<number>((sum, value) => sum + Number(value), 0);
  const outputValue = typeof outputItem?.sell_price === 'number' ? outputItem.sell_price * Number(output?.quantity ?? 1) : null;
  const net = inputCost == null || outputValue == null ? null : outputValue - inputCost;
  const days = typeof process.duration_minutes === 'number' ? process.duration_minutes / 1440 : null;
  return { inputCost, outputValue, net, perDay: net != null && days && days > 0 ? net / days : null };
}

function minimum(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? Math.min(...known) : null;
}

function maximum(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? Math.max(...known) : null;
}

export function groupProcessesByOutput(processes: Entity[], catalog: Catalog): ProcessProductRow[] {
  const grouped = new Map<string, Entity[]>();
  for (const process of processes) {
    const outputId = (process.output as { item_id?: string } | undefined)?.item_id ?? `__process__:${process.id}`;
    grouped.set(outputId, [...(grouped.get(outputId) ?? []), process]);
  }

  return [...grouped].map(([outputId, variants]) => {
    const outputItem = outputId.startsWith('__process__:')
      ? variants[0]
      : findCatalogEntity(catalog, outputId, 'items') ?? variants[0];
    const metrics = variants.map((variant) => normalMetrics(variant, catalog));
    const durations = variants
      .map((variant) => typeof variant.duration_minutes === 'number' ? variant.duration_minutes : null)
      .filter((value): value is number => value != null);
    return {
      ...outputItem,
      source_kind: 'processes',
      variant_ids: variants.map((variant) => variant.id),
      variants,
      variant_count: variants.length,
      machine_ids: [...new Set(variants.flatMap((variant) => (variant.machine_ids as string[] | undefined) ?? []))],
      buy_price: minimum(metrics.map((metric) => metric.inputCost)),
      sell_price: maximum(metrics.map((metric) => metric.outputValue)),
      net_profit: maximum(metrics.map((metric) => metric.net)),
      profit_per_day: maximum(metrics.map((metric) => metric.perDay)),
      duration_minutes: durations.length ? Math.min(...durations) : null,
      duration_max_minutes: durations.length ? Math.max(...durations) : null,
    };
  });
}
