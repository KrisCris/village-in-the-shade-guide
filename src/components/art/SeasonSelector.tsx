import {useEffect,useState} from 'react';
import {chooseSeason,fixedSeason,type SeasonPreference} from '../../lib/seasonPreference';
export default function SeasonSelector(){
  const [value,setValue]=useState<SeasonPreference>('auto');
  useEffect(()=>{const sync=()=>setValue(fixedSeason());sync();window.addEventListener('season-preference-change',sync);return()=>window.removeEventListener('season-preference-change',sync);},[]);
  const options=[['auto','自动'],['spring','春'],['summer','夏'],['autumn','秋'],['winter','冬']] as const;
  return <div className="setting-choices" role="group" aria-label="主题季节">{options.map(([season,label])=><button key={season} type="button" aria-pressed={value===season} onClick={()=>chooseSeason(season)} title={season==='auto'?'自动切换季节':`固定${label}季`}>{season==='auto'?<span className="setting-symbol">↻</span>:<svg viewBox="-24 -24 48 48" aria-hidden="true">{season==='spring'?<path fill="#efb1c8" d="M0 17C-17 6-17-13-5-15Q-1-14 0-8Q4-16 9-13C20-4 10 11 0 17"/>:season==='summer'?<><path fill="#70974e" d="M-17 0C-8-15 10-12 17 0C4 11-7 12-17 0"/><path stroke="#dde5a9" d="M-17 0H15"/></>:season==='autumn'?<path fill="#c74f3f" d="M0-20 5-9 9-13 9-3 18-7 15 1 20 3 7 10 3 10 1 18-1 18-2 10-9 11-19 3-14 1-18-7-8-3-9-13-4-9Z"/>:<g stroke="#8faebb" strokeWidth="2" strokeLinecap="round">{Array.from({length:6},(_,i)=><path key={i} transform={`rotate(${i*60})`} d="M0 0V-17M0-10-4-14M0-10 4-14"/>)}</g>}</svg>}<span>{label}</span></button>)}</div>;
}
