import type {Entity} from '../data/types';
const seasons=['spring','summer','autumn','winter'];
// storesales predicates join to gameflag's named year/season release flags.
const release:Record<number,[number,number]>={520:[2,0],521:[3,0],522:[1,1],523:[2,1],524:[3,1],525:[1,2],526:[2,2],527:[1,3]};
export function seedAvailability(crop:Entity,entities:Entity[],year:number,season:string) {
 const seedIds=(crop.seed_item_ids ?? []) as string[];
 const date=(year-1)*4+seasons.indexOf(season);
 const offers=entities.filter(e=>e.kind==='store-offers'&&seedIds.includes(String(e.item_id)));
 const available=offers.filter(e=>{
  const saleSeasons=(e.seasons ?? []) as string[];
  return (!saleSeasons.length||saleSeasons.includes(season))&&((e.required_flags ?? []) as number[]).every(flag=>{
   const start=release[flag];return !start||date >= (start[0]-1)*4+start[1];
  });
 });
 return {available:available.length>0,conditions:[...new Set(available.flatMap(e=>(e.conditions ?? []) as string[]))],locations:[...new Set(available.map(e=>String(e.location ?? '商店')))]};
}
