import {QUALITY_VALUES,QUALITY_LABELS} from '../../domain/quality';
import {useQuality} from './qualityPreference';
import {withBase} from '../../lib/sitePath';
export default function QualityButtons(){
  const [quality,setQuality]=useQuality();
  return <div className="setting-choices" role="group" aria-label="物品品质">{QUALITY_VALUES.map((value,index)=><button key={value} type="button" aria-pressed={quality===value} onClick={()=>setQuality(value)} title={QUALITY_LABELS[value]}>{index?<svg viewBox={index===4?'7 8 49 77':`7 ${index===3?8:9} 49 49`} aria-hidden="true"><image href={withBase(`/icons/generated/ui/rank-${index}.webp`)} width="128" height="128"/></svg>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/></svg>}<span>{QUALITY_LABELS[value].replace('★','')}</span></button>)}</div>;
}
