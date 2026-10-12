import { QUALITY_VALUES, QUALITY_LABELS } from '../../domain/quality';
import { useQuality } from './qualityPreference';
import { useQualityLabels } from './qualityLabels';
import RankIcon from '../save/RankIcon';
import { I18nProvider, useI18n } from '../../i18n/react';
import type { Locale } from '../../i18n/locales';

export default function QualityButtons({ locale }: { locale?: Locale }) {
  return <I18nProvider locale={locale}><QualityChoices /></I18nProvider>;
}

function QualityChoices() {
  const { t } = useI18n();
  const [quality, setQuality] = useQuality();
  const [showLabels, setShowLabels] = useQualityLabels();
  return <>
    <div className="setting-choices quality-choices" role="group" aria-label={t('物品品质')}>{QUALITY_VALUES.map((value, index) => <button key={value} type="button" aria-label={t(QUALITY_LABELS[value])} aria-pressed={quality === value} onClick={() => setQuality(value)} title={t(QUALITY_LABELS[value])}>
      <span className="quality-choice-art"><RankIcon rank={index} decorative showNormal /></span>
      {showLabels && <span>{t(QUALITY_LABELS[value]).replace('★', '')}</span>}
    </button>)}</div>
    <button type="button" className="quality-label-toggle" aria-pressed={showLabels} onClick={() => setShowLabels(!showLabels)}>{showLabels ? t('星级文字：显示在下方') : t('星级文字：隐藏')}</button>
  </>;
}
