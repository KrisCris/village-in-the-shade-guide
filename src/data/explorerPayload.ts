import type {Catalog} from './types';
import {visibleRowsForKind} from './catalogViews';
import {groupProcessesByOutput} from '../domain/processGroups';
import {compactItemRow} from './itemList';

export function explorerPayload(catalog:Catalog,kind:string,category?:string) {
  const rawRows=category?catalog.entities.filter(e=>e.kind==='items'&&e.category_id===category):visibleRowsForKind(catalog,kind);
  const rows=kind==='processes'?groupProcessesByOutput(rawRows,catalog):rawRows;
  const machineOptions=kind==='processes'?catalog.entities.filter(e=>e.kind==='machines').map(e=>({id:e.id,name:e.name.zh_hans})):[];
  const itemIds=kind==='processes'?new Set(rawRows.flatMap(e=>[
    ...((e.inputs??[]) as {item_id:string}[]).map(input=>input.item_id),
    ...((e.output as {item_id?:string}|undefined)?.item_id?[(e.output as {item_id:string}).item_id]:[]),
  ])):new Set<string>();
  const priceIndex=Object.fromEntries([...itemIds].flatMap(id=>{
    const item=catalog.byId[id];
    return item?[[id,{sell_price:item.sell_price,quality_eligible:item.quality_eligible}]]:[];
  }));
  const fishingLocationOptions=kind==='fish'?[...new Map(rows.flatMap(row=>((row.locations??[]) as {location_id:string;name:{zh_hans:string}}[]).map(place=>[place.location_id,{id:place.location_id,name:place.name.zh_hans}] as const))).values()].sort((a,b)=>a.id.localeCompare(b.id)):[];
  const itemCategoryOptions=kind==='items'&&!category?[...new Map([...rows].sort((a,b)=>Number(a.category_numeric_id)-Number(b.category_numeric_id)).flatMap(row=>row.category_id&&row.category_name?[[row.category_id,{id:row.category_id,name:row.category_name.zh_hans}] as const]:[])).values()]:[];
  return {rows:rows.map(compactItemRow),kind,machineOptions,priceIndex,fishingLocationOptions,itemCategoryOptions};
}
