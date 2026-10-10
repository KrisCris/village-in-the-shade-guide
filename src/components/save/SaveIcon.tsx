import { withBase } from '../../lib/sitePath';
import type { LookupKind } from '../../lib/saveModel';
import { lookupIcon, type SaveNameTables } from '../../lib/saveNames';
import { ITEM_RANKS } from '../../lib/saveRules';
import RankIcon from './RankIcon';
import { tr } from '../../i18n/active';

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
  rank?: number;
}

/**
 * The catalog icon for an ID. Renders nothing when the catalog has no artwork
 * for that kind at all (weather, facilities), so callers can drop it in
 * unconditionally.
 */
export default function SaveIcon({ names, kind, value, size, className, rank }: SaveIconProps) {
  const src = kind === 'livestock' && value !== '100' ? withBase(`/icons/generated/ui/livestock-${value}.webp`) : lookupIcon(names, kind, value);
  if (!src) return null;
  const fallback = FALLBACKS[kind as LookupKind];
  const icon = <img
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
  if (rank === undefined) return icon;
  const quality = ITEM_RANKS.find(entry => entry.value === rank);
  return <span className="save-ranked-icon" style={{ width: size, height: size }} title={quality?.label ?? tr('未知品质')}>
    {icon}
    <RankIcon className="save-rank-badge" rank={rank} />
  </span>;
}
