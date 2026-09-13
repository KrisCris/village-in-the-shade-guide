import {useEffect,useState} from 'react';
import SearchableSelect from '../controls/SearchableSelect';
import {chooseSeason,fixedSeason,type SeasonPreference} from '../../lib/seasonPreference';
export default function SeasonSelector(){
  const [value,setValue]=useState<SeasonPreference>('auto');
  useEffect(()=>{const sync=()=>setValue(fixedSeason());sync();window.addEventListener('season-preference-change',sync);return()=>window.removeEventListener('season-preference-change',sync);},[]);
  return <div className="season-selector"><label htmlFor="season-choice" className="sr-only">主题季节</label><SearchableSelect id="season-choice" value={value} onChange={e=>chooseSeason(e.target.value)}><option value="auto">四季自动</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option></SearchableSelect></div>;
}
