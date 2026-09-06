export const SEASONS=['spring','summer','autumn','winter'] as const;
export function seasonFrame(scroll:number,stops:number[]) {
  let from=0;
  while(from<3&&scroll>=stops[from+1])from++;
  const to=Math.min(3,from+1);
  const distance=stops[to]-stops[from];
  const mix=to===from||distance<=0?0:Math.max(0,Math.min(1,(scroll-stops[from])/distance));
  return {from,to,mix};
}
export function resolveTheme(saved:string|null,darkSystem:boolean):'day'|'night' {
  return saved==='day'||saved==='night'?saved:darkSystem?'night':'day';
}
