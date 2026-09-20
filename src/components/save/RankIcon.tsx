import { ITEM_RANKS } from '../../lib/saveRules';
import { withBase } from '../../lib/sitePath';

/** Native textures are 128px tiles; the visible star occupies only their top-left 44px. */
export default function RankIcon({ rank, className, decorative = false, showNormal = false }: { rank: number; className?: string; decorative?: boolean; showNormal?: boolean }) {
  const quality = ITEM_RANKS.find(entry => entry.value === rank);
  if (!quality || (rank === 0 && !showNormal)) return null;
  if (rank === 0) return <svg className={className ? `save-rank-icon ${className}` : 'save-rank-icon'} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : quality.label} aria-hidden={decorative || undefined}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" /></svg>;
  return <svg className={className ? `save-rank-icon ${className}` : 'save-rank-icon'}
    viewBox={rank === 4 ? '10 11 44 72' : '10 11 44 44'} width="24" height={rank === 4 ? 24 * 72 / 44 : 24}
    role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : quality.label} aria-hidden={decorative || undefined}>
    <image href={withBase(`/icons/generated/ui/rank-${rank}.webp`)} width="128" height="128" />
  </svg>;
}
