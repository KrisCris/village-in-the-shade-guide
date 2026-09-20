import { QUALITY_VALUES, QUALITY_LABELS } from '../../domain/quality';
import { useQuality } from './qualityPreference';
import { useQualityLabels } from './qualityLabels';
import RankIcon from '../save/RankIcon';

export default function QualityButtons() {
  const [quality, setQuality] = useQuality();
  const [showLabels, setShowLabels] = useQualityLabels();
  return <>
    <div className="setting-choices quality-choices" role="group" aria-label="物品品质">{QUALITY_VALUES.map((value, index) => <button key={value} type="button" aria-label={QUALITY_LABELS[value]} aria-pressed={quality === value} onClick={() => setQuality(value)} title={QUALITY_LABELS[value]}>
      <span className="quality-choice-art"><RankIcon rank={index} decorative showNormal /></span>
      {showLabels && <span>{QUALITY_LABELS[value].replace('★', '')}</span>}
    </button>)}</div>
    <button type="button" className="quality-label-toggle" aria-pressed={showLabels} onClick={() => setShowLabels(!showLabels)}>星级文字：{showLabels ? '显示在下方' : '隐藏'}</button>
  </>;
}
