import { describe, it, expect } from 'vitest';
import { compactItemRow } from './itemList';
import type { Entity } from './types';
import { entityMetrics } from '../domain/entitySort';
import {plannerPayload} from './plannerPayload';
import {getCatalog} from './repository';
import {cropProcessingOptions} from '../domain/cropProcessing';
import {seedAvailability} from '../domain/seedAvailability';
import {QUALITY_VALUES} from '../domain/quality';

const row = {id:'crop',kind:'crops',name:{zh_hans:'水稻',zh_hant:'水稻',ja:'稲',internal:'crop',aliases:[],review_status:''},searchText:'水稻 shuidao',buy_price:10,sell_price:30,growth_days:4,harvest_quantity:3,seasons:['summer'],harvest_item_ids:['rice'],evidence:{huge:'not needed in a list'}} as Entity;
describe('compact list payload',()=>{
  it('retains every planner result and seed unlock condition from the game catalog',()=>{
    const full=getCatalog();
    const entities=plannerPayload(full);
    const compact={...full,entities,byId:Object.fromEntries(entities.filter(e=>e.kind==='items').map(e=>[e.id,e]))};
    const numbers=(rows:ReturnType<typeof cropProcessingOptions>)=>rows.map(({crop,process,output,...values})=>({crop:crop.id,process:process?.id,output:output.id,...values}));
    for(const crop of full.entities.filter(e=>e.kind==='crops')) {
      const small=entities.find(e=>e.kind==='crops'&&e.id===crop.id)!;
      for(const quality of QUALITY_VALUES)expect(numbers(cropProcessingOptions(small,compact,quality,28,true))).toEqual(numbers(cropProcessingOptions(crop,full,quality,28,true)));
      for(const season of ['spring','summer','autumn','winter'])expect(seedAvailability(small,entities,2,season)).toEqual(seedAvailability(crop,full.entities,2,season));
    }
    expect(JSON.stringify(entities).length).toBeLessThan(JSON.stringify(full.entities).length/5);
  });
  it('preserves crop filters and harvest quantity for correct profits',()=>{
    const compact=compactItemRow(row);
    expect(compact.seasons).toEqual(['summer']);
    expect(compact.harvest_item_ids).toEqual(['rice']);
    expect(entityMetrics(compact,'normal').profit).toBe(20);
    expect(compact.evidence).toBeUndefined();
  });
  it('preserves grouped recipe prices without full recipe detail data',()=>{
    const variant={...row,kind:'processes',inputs:[{item_id:'rice',quantity:2}],output:{item_id:'vinegar',quantity:1},duration_minutes:1440};
    const compact=compactItemRow({...row,source_kind:'processes',variants:[variant],variant_count:1,machine_ids:['barrel']});
    expect(entityMetrics(compact,'normal',{rice:{sell_price:30},vinegar:{sell_price:100}})).toEqual({buy:60,sell:100,profit:40});
    expect(compact.machine_ids).toEqual(['barrel']);
    expect((compact.variants as Entity[])[0].evidence).toBeUndefined();
  });
});
