import {useEffect,useState} from 'react';
import {chooseSeason,fixedSeason,type SeasonPreference} from '../../lib/seasonPreference';
import {I18nProvider,useI18n} from '../../i18n/react';
import type {Locale} from '../../i18n/locales';
import {SEASON_GLYPHS} from './seasonGlyphs';
export default function SeasonSelector({locale}:{locale?:Locale}){
  return <I18nProvider locale={locale}><SeasonChoices/></I18nProvider>;
}
function SeasonChoices(){
  const {t}=useI18n();
  const [value,setValue]=useState<SeasonPreference>('auto');
  useEffect(()=>{const sync=()=>setValue(fixedSeason());sync();window.addEventListener('season-preference-change',sync);return()=>window.removeEventListener('season-preference-change',sync);},[]);
  const options=[['auto',t('自动'),t('自动切换季节')],['spring',t('春'),t('固定春季')],['summer',t('夏'),t('固定夏季')],['autumn',t('秋'),t('固定秋季')],['winter',t('冬'),t('固定冬季')]] as const;
  return <div className="setting-choices" role="group" aria-label={t('主题季节')}>{options.map(([season,label,title])=><button key={season} type="button" aria-pressed={value===season} onClick={()=>chooseSeason(season)} title={title}>{season==='auto'?<span className="setting-symbol">↻</span>:<svg viewBox="-24 -24 48 48" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">{SEASON_GLYPHS[season].map((shape,i)=><path key={i} d={shape.d} fill={shape.fill ?? 'none'} stroke={shape.stroke} strokeWidth={shape.strokeWidth} transform={shape.transform}/>)}</svg>}<span>{label}</span></button>)}</div>;
}
