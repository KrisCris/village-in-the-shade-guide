import { heartFill, SAVE_RULES } from '../../lib/saveRules';
import { withBase } from '../../lib/sitePath';
import { tr } from '../../i18n/active';

export default function FriendshipInput({ value, onChange, label, thresholds = SAVE_RULES.npcHearts }: { value: number; onChange: (value: string) => void; label: string; thresholds?: number[] }) {
  const fill = heartFill(value, thresholds);
  return <div className="save-friendship">
    <div className="save-hearts" aria-hidden="true">{fill.map((amount, index) => <span className="save-heart" key={index}>
      <img src={withBase('/icons/generated/ui/friendship.webp')} alt="" />
      <img src={withBase('/icons/generated/ui/friendship.webp')} alt="" style={{ clipPath: `inset(0 ${(1 - amount) * 100}% 0 0)` }} />
    </span>)}</div>
    <input type="range" min={0} max={thresholds.at(-1)} step={1} value={value} aria-label={label} aria-valuetext={tr('{hearts} 心，{points} 好感', { hearts: fill.filter(amount => amount === 1).length, points: value })} onChange={event => onChange(event.target.value)} />
    <small>{value} / {thresholds.at(-1)}{thresholds.length === 5 && tr(' · 每心 {points} 点', { points: thresholds[0] })}</small>
  </div>;
}
