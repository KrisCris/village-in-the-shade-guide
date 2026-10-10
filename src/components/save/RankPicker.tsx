import { ITEM_RANKS } from '../../lib/saveRules';
import { useQualityLabels } from '../quality/qualityLabels';
import RankIcon from './RankIcon';
import { tr } from '../../i18n/active';

export default function RankPicker({ value, onChange, label = tr('材料品质') }: { value: number; onChange: (rank: number) => void; label?: string }) {
  const [showLabels] = useQualityLabels();
  return <fieldset className="save-rank-picker"><legend>{label}</legend>
    {ITEM_RANKS.map(rank => <button type="button" key={rank.value} title={rank.label} aria-label={rank.label} aria-pressed={value === rank.value} onClick={() => onChange(rank.value)}>
      <span className="save-rank-choice-art"><RankIcon rank={rank.value} decorative showNormal /></span>
      {showLabels && <span className="save-rank-choice-label">{rank.label}</span>}
    </button>)}
  </fieldset>;
}
