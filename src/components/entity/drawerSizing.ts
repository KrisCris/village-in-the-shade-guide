export const DRAWER_WIDTH_KEY = 'entity-drawer-width';
export const DRAWER_MIN_WIDTH = 480;
export const DRAWER_DEFAULT_WIDTH = 720;
export const DRAWER_MOBILE_BREAKPOINT = 700;

export function clampDrawerWidth(width: number, viewportWidth: number) {
  if (viewportWidth <= DRAWER_MOBILE_BREAKPOINT) return viewportWidth;
  return Math.min(Math.max(width, DRAWER_MIN_WIDTH), Math.floor(viewportWidth * 0.9));
}

export function storedDrawerWidth(value: string | null, viewportWidth: number) {
  const parsed = Number(value);
  return clampDrawerWidth(Number.isFinite(parsed) && parsed > 0 ? parsed : DRAWER_DEFAULT_WIDTH, viewportWidth);
}
