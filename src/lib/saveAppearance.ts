import appearance from '../../data/sources/game-save-appearance.json';
export const APPEARANCE = appearance.tables;
export type AppearanceKind = keyof typeof APPEARANCE;
export const APPEARANCE_FIELDS: { kind: AppearanceKind; label: string; idPath: string; colorPath?: string }[] = [
  { kind: 'playerfronthairstyle', label: '前发型', idPath: 'pFrontHairStyle_/dataID' },
  { kind: 'playerbackhairstyle', label: '后发型', idPath: 'pBackHairStyle_/dataID' },
  { kind: 'playercrothing', label: '服装', idPath: 'pCrothing_/dataID', colorPath: 'crothingColor_' },
  { kind: 'playerheadaccessory', label: '头部饰品', idPath: 'pHeadAccessory_/dataID', colorPath: 'headAccessoryColor_' },
  { kind: 'playerneckaccessory', label: '颈部饰品', idPath: 'pNeckAccessory_/dataID', colorPath: 'neckAccessoryColor_' },
  { kind: 'playerbackaccessory', label: '背部饰品', idPath: 'pBackAccessory_/dataID', colorPath: 'backAccessoryColor_' },
];

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 1) + 1) % 1;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));
  const rgb = [5, 3, 1].map(n => {
    const k = (n + hue * 6) % 6;
    return Math.round((val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0');
  });
  return `#${rgb.join('')}`;
}

export function hexToHsv(hex: string): [number, number, number] {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error('无效颜色');
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const h = !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [h / 6, max ? delta / max : 0, max];
}

/** hsv.fxdat pixel shader: hue += x, saturation *= y, value *= z.
 * The save's (0, 1, 1) preserves the blonde source texture; it is not red. */
export function transformHairPixel(rgb: readonly number[], adjustment: readonly number[]): [number, number, number] {
  const [r, g, b] = rgb.map(channel => channel / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const h = ((hue / 6 + adjustment[0]) % 1 + 1) % 1;
  const s = (max ? delta / max : 0) * adjustment[1], v = max * adjustment[2];
  return [5, 3, 1].map(n => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  }) as [number, number, number];
}
