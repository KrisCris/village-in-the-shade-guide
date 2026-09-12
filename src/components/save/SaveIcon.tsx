import { withBase } from '../../lib/sitePath';
import type { LookupKind } from '../../lib/saveModel';
import { lookupIcon, type SaveNameTables } from '../../lib/saveNames';

const FALLBACKS: Partial<Record<LookupKind, string>> = {
  items: '/icons/fallback/items.svg',
  crops: '/icons/fallback/crops.svg',
  livestock: '/icons/fallback/items.svg',
};

interface SaveIconProps {
  names: SaveNameTables;
  kind: LookupKind | undefined;
  value: string;
  size: number;
  className?: string;
}

/**
 * The catalog icon for an ID. Renders nothing when the catalog has no artwork
 * for that kind at all (weather, facilities), so callers can drop it in
 * unconditionally.
 */
export default function SaveIcon({ names, kind, value, size, className }: SaveIconProps) {
  const src = kind === 'livestock' && value !== '100' ? withBase(`/icons/generated/ui/livestock-${value}.webp`) : lookupIcon(names, kind, value);
  if (!src) return null;
  const fallback = FALLBACKS[kind as LookupKind];
  return <img
    className={className ? `save-icon ${className}` : 'save-icon'}
    src={src}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    decoding="async"
    onError={fallback
      ? (event) => { event.currentTarget.onerror = null; event.currentTarget.src = withBase(fallback); }
      : undefined}
  />;
}
