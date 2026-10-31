import { format, msg, type Translate } from '../i18n/translate';

export const QUALITY_VALUES = ['normal', 'copper', 'silver', 'gold', 'brand'] as const;
export type Quality = typeof QUALITY_VALUES[number];

export const QUALITY_MULTIPLIERS: Record<Quality, number> = {
  normal: 1,
  copper: 1.25,
  silver: 1.5,
  gold: 1.75,
  brand: 2,
};

/** Translation keys; display with t(). */
export const QUALITY_LABELS: Record<Quality, string> = {
  normal: msg('无星'),
  copper: msg('铜★'),
  silver: msg('银★'),
  gold: msg('金★'),
  brand: msg('品牌'),
};

export type QualityPrice = {
  value: number;
  exact: boolean;
  multiplier: number;
  quality: Quality;
  fixed: boolean;
};

export function parseQuality(value: string | null | undefined): Quality {
  return QUALITY_VALUES.includes(value as Quality) ? value as Quality : 'normal';
}

export function qualityLabel(quality: Quality, t: Translate = format): string {
  return t(QUALITY_LABELS[quality]);
}

export function qualityPrice(basePrice: number | null | undefined, eligible: boolean, quality: Quality): QualityPrice | null {
  if (typeof basePrice !== 'number') return null;
  const multiplier = eligible ? QUALITY_MULTIPLIERS[quality] : 1;
  const value = basePrice * multiplier;
  return { value, exact: Number.isInteger(value), multiplier, quality, fixed: !eligible };
}

export function formatQualityPrice(result: QualityPrice | null, t: Translate = format): string {
  if (!result) return t('数据不足');
  return `${result.exact ? '' : '≈'}${Number.isInteger(result.value) ? result.value : result.value.toFixed(2)}`;
}

/** A crop's harvest-count target, from data/sources/game-crop-quality.json (item.dat needValue × gamedefine HARVEST_COUNT_RATE_*).
 * The save keeps the count in pHarvestStatus_ under count_item_numeric_id; the crop's harvests come out at the best grade whose count is reached. */
export type QualityTarget = {seed_item_id: string; count_item_id: string; count_item_numeric_id: number; need: number; copper: number; silver: number; gold: number};
export const TARGET_QUALITIES = ['copper', 'silver', 'gold'] as const satisfies readonly Quality[];
export type TargetQuality = typeof TARGET_QUALITIES[number];
export type QualityTargetStep = {quality: TargetQuality; count: number; remaining: number; seeds: number | null};

/** How many more pieces to harvest before harvests come out at each grade, and the seeds that takes.
 * `harvested` is the save's count; `perSeed` is what one seed adds to it (cropProcessing's seasonCountPerSeed), null when unknown.
 * A harvest takes the grade of the count before it, so once remaining is 0 the next harvest is that grade. */
export function qualityTargetSteps(target: QualityTarget, perSeed: number | null, harvested = 0): QualityTargetStep[] {
  return TARGET_QUALITIES.map(quality => {
    const remaining = Math.max(0, target[quality] - harvested);
    return {quality, count: target[quality], remaining, seeds: perSeed != null && perSeed > 0 ? Math.ceil(remaining / perSeed) : null};
  });
}
