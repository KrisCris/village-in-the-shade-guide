import {SEASONS} from '../domain/scenery';
import {crossfadeRoot} from './rootCrossfade';
export type SeasonPreference='auto'|typeof SEASONS[number];
export function parseSeason(value:unknown):SeasonPreference {
  return SEASONS.includes(value as typeof SEASONS[number])?value as SeasonPreference:'auto';
}
export function fixedSeason():SeasonPreference {return parseSeason(document.documentElement.dataset.seasonPreference);}
export function chooseSeason(value:unknown){
  const preference=parseSeason(value),root=document.documentElement;
  try{localStorage.setItem('village-season',preference);}catch{/* Optional preference. */}
  const apply=()=>{
    root.dataset.seasonPreference=preference;
    if(preference!=='auto')root.dataset.season=preference;
    window.dispatchEvent(new Event('season-preference-change'));
  };
  if(preference!=='auto'&&preference!==root.dataset.season)crossfadeRoot(apply);else apply();
}
