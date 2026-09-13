import {QUALITY_VALUES,QUALITY_LABELS} from '../../domain/quality';
import {useQuality} from './qualityPreference';
import {withBase} from '../../lib/sitePath';
export default function QualityButtons(){
  const [quality,setQuality]=useQuality();
  return <div className="setting-choices" role="group" aria-label="物品品质">{QUALITY_VALUES.map((value,index)=><button key={value} type="button" aria-pressed={quality===value} onClick={()=>setQuality(value)} title={QUALITY_LABELS[value]}>{index?<img src={withBase(`/icons/generated/ui/rank-${index}.webp`)} alt=""/>:<span className="setting-symbol">—</span>}<span>{QUALITY_LABELS[value].replace('★','')}</span></button>)}</div>;
}
