export const QUALITY_VALUES = ['normal', 'copper', 'silver', 'gold', 'brand'] as const;
export type Quality = typeof QUALITY_VALUES[number];

export const QUALITY_MULTIPLIERS: Record<Quality, number> = {
  normal: 1,
  copper: 1.25,
  silver: 1.5,
  gold: 1.75,
  brand: 2,
};

export const QUALITY_LABELS: Record<Quality, string> = {
  normal: '无星',
  copper: '铜★',
  silver: '银★',
  gold: '金★',
  brand: '品牌',
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

export function qualityLabel(quality: Quality): string {
  return QUALITY_LABELS[quality];
}

export function qualityPrice(basePrice: number | null | undefined, eligible: boolean, quality: Quality): QualityPrice | null {
  if (typeof basePrice !== 'number') return null;
  const multiplier = eligible ? QUALITY_MULTIPLIERS[quality] : 1;
  const value = basePrice * multiplier;
  return { value, exact: Number.isInteger(value), multiplier, quality, fixed: !eligible };
}

export function formatQualityPrice(result: QualityPrice | null): string {
  if (!result) return '数据不足';
  return `${result.exact ? '' : '≈'}${Number.isInteger(result.value) ? result.value : result.value.toFixed(2)}`;
}
