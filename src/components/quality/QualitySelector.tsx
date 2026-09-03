import { useId } from 'react';
import { QUALITY_LABELS, QUALITY_VALUES } from '../../domain/quality';
import { useQuality } from './qualityPreference';

export default function QualitySelector() {
  const id = useId();
  const [quality, setQuality] = useQuality();

  return (
    <div className="quality-selector">
      <label htmlFor={id}>品质</label>
      <select id={id} value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}>
        {QUALITY_VALUES.map((value) => <option key={value} value={value}>{QUALITY_LABELS[value]}</option>)}
      </select>
    </div>
  );
}
