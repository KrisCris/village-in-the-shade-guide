import { ITEM_RANKS } from '../../lib/saveRules';
import RankIcon from './RankIcon';

export default function RankPicker({ value, onChange, label = '材料品质' }: { value: number; onChange: (rank: number) => void; label?: string }) {
  return <fieldset className="save-rank-picker"><legend>{label}</legend>
    {ITEM_RANKS.map(rank => <button type="button" key={rank.value} aria-pressed={value === rank.value} onClick={() => onChange(rank.value)}>
      <RankIcon rank={rank.value} decorative />{rank.label}
    </button>)}
  </fieldset>;
}
