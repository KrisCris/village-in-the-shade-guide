export const SEASONS=['spring','summer','autumn','winter'] as const;
export function seasonFrame(scroll:number,stops:number[],transitionDistance=400) {
  let from=0;
  while(from<3&&scroll>=stops[from+1])from++;
  const to=Math.min(3,from+1);
  const distance=stops[to]-stops[from];
  // Hold the current season, then blend only as the next chapter enters view.
  const span=Math.max(0,Math.min(transitionDistance,distance*.5));
  const mix=to===from||span<=0?0:Math.max(0,Math.min(1,(scroll-(stops[to]-span))/span));
  return {from,to,mix};
}
export function resolveTheme(saved:string|null,darkSystem:boolean):'day'|'night' {
  return saved==='day'||saved==='night'?saved:darkSystem?'night':'day';
}
