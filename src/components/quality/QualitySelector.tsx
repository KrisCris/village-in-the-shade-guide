import SearchableSelect from '../controls/SearchableSelect';
import { useId } from 'react';
import { QUALITY_LABELS, QUALITY_VALUES } from '../../domain/quality';
import { useQuality } from './qualityPreference';
import { useI18n } from '../../i18n/react';

export default function QualitySelector() {
  const id = useId();
  const [quality, setQuality] = useQuality();
  const { t } = useI18n();

  return (
    <div className="quality-selector">
      <label htmlFor={id}>{t('品质')}</label>
      <SearchableSelect id={id} value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}>
        {QUALITY_VALUES.map((value) => <option key={value} value={value}>{t(QUALITY_LABELS[value])}</option>)}
      </SearchableSelect>
    </div>
  );
}
