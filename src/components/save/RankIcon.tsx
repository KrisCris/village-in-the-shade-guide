import { ITEM_RANKS } from '../../lib/saveRules';
import { withBase } from '../../lib/sitePath';

/** Native textures are 128px tiles; the visible star occupies only their top-left 44px. */
export default function RankIcon({ rank, className, decorative = false }: { rank: number; className?: string; decorative?: boolean }) {
  const quality = ITEM_RANKS.find(entry => entry.value === rank);
  if (!quality || rank === 0) return null;
  return <svg className={className ? `save-rank-icon ${className}` : 'save-rank-icon'}
    viewBox={rank === 4 ? '10 11 44 72' : '10 11 44 44'} width="24" height={rank === 4 ? 24 * 72 / 44 : 24}
    role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : quality.label} aria-hidden={decorative || undefined}>
    <image href={withBase(`/icons/generated/ui/rank-${rank}.webp`)} width="128" height="128" />
  </svg>;
}
