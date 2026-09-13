import {SEASONS} from '../domain/scenery';
export type SeasonPreference='auto'|typeof SEASONS[number];
export function parseSeason(value:unknown):SeasonPreference {
  return SEASONS.includes(value as typeof SEASONS[number])?value as SeasonPreference:'auto';
}
export function fixedSeason():SeasonPreference {return parseSeason(document.documentElement.dataset.seasonPreference);}
export function chooseSeason(value:unknown){
  const preference=parseSeason(value);
  document.documentElement.dataset.seasonPreference=preference;
  if(preference!=='auto')document.documentElement.dataset.season=preference;
  try{localStorage.setItem('village-season',preference);}catch{/* Optional preference. */}
  window.dispatchEvent(new Event('season-preference-change'));
}
