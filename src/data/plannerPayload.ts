import type {Catalog, Entity} from './types';
import {compactItemRow} from './itemList';

export function plannerPayload(catalog:Catalog):Entity[] {
  const crops=catalog.entities.filter(e=>e.kind==='crops');
  const harvestIds=new Set(crops.flatMap(e=>(e.harvest_item_ids??[]) as string[]));
  const seeds=new Set(crops.flatMap(e=>(e.seed_item_ids??[]) as string[]));
  const processes=catalog.entities.filter(e=>e.kind==='processes' && (e.inputs as {item_id:string}[]|undefined)?.some(input=>harvestIds.has(input.item_id)));
  const itemIds=new Set([...harvestIds,...seeds,...processes.flatMap(e=>[
    ...(e.inputs as {item_id:string}[]).map(input=>input.item_id),
    (e.output as {item_id:string}).item_id,
  ])]);
  return [...crops,...processes,...catalog.entities.filter(e=>
    e.kind==='items'?itemIds.has(e.id):e.kind==='store-offers'&&seeds.has(String(e.item_id))
  )].map(compactItemRow);
}
