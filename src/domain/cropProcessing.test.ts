import {expect, it} from 'vitest';
import type {Catalog, Entity} from '../data/types';
import {cropProcessingOptions} from './cropProcessing';

function setup(extra: Record<string, unknown> = {}, inputQuantity = 1, minutes = 1440) {
  const crop: Entity = {id:'crop',kind:'crops',name:{zh_hans:'作物',zh_hant:'作物',ja:'',internal:'crop',aliases:[],review_status:'test'},searchText:'作物',growth_days:7,harvest_quantity:1,seed_item_ids:['seed'],harvest_item_ids:['raw'],...extra};
  const entities = [crop,
    {id:'seed',kind:'items',buy_price:10},
    {id:'raw',kind:'items',sell_price:30,quality_eligible:true},
    {id:'out',kind:'items',sell_price:50,quality_eligible:true},
    {id:'process',kind:'processes',inputs:[{item_id:'raw',quantity:inputQuantity}],output:{item_id:'out',quantity:1},duration_minutes:minutes},
  ] as Entity[];
  const catalog = {entities,byId:Object.fromEntries(entities.map(e=>[e.id,e]))} as Catalog;
  return {crop,catalog};
}

it('separates processing increment from whole-chain profit without double counting seeds', () => {
  const {crop,catalog}=setup();
  expect(cropProcessingOptions(crop,catalog,'normal')[0]).toMatchObject({
    harvestCount:4,seedCost:40,revenue:200,processingGain:80,net:160,monthNet:110,finishDay:29,
  });
});

it('repurchases no seed for regrowing crops and changes output prices with quality', () => {
  const {crop,catalog}=setup({regrow_days:7});
  expect(cropProcessingOptions(crop,catalog,'silver')[0]).toMatchObject({seedCost:10,processingGain:120,net:290,monthNet:215});
});

it('sells unusable batch remainder raw at month end instead of dropping its value', () => {
  const {crop,catalog}=setup({growth_days:10,harvest_quantity:2},3);
  expect(cropProcessingOptions(crop,catalog,'normal')[0]).toMatchObject({harvested:4,batches:1,revenue:80,net:60,monthNet:60});
});

it('does not count a future harvest or unfinished processing as current-month sales', () => {
  const {crop,catalog}=setup({growth_days:50,harvest_quantity:10},3);
  expect(cropProcessingOptions(crop,catalog,'normal')[0]).toMatchObject({seedCost:10,soldWithinMonth:0,monthNet:-10,finishDay:53});
});

it('excludes unknown harvest quantities', () => {
  const {crop,catalog}=setup({harvest_quantity:null});
  expect(cropProcessingOptions(crop,catalog,'normal')).toEqual([]);
});

it('offers direct sale without inventing a machine or processing gain', () => {
  const {crop,catalog}=setup();
  catalog.entities=catalog.entities.filter(e=>e.kind!=='processes');
  expect(cropProcessingOptions(crop,catalog,'normal',28,true)).toContainEqual(expect.objectContaining({
    process:null,harvestCount:4,harvested:4,seedCost:40,revenue:120,net:80,monthNet:80,processingGain:0,machineDays:0,finishDay:28,
  }));
});

it('retains seed expense but no cash revenue for direct sales after month end', () => {
  const {crop,catalog}=setup({growth_days:50});
  expect(cropProcessingOptions(crop,catalog,'normal',28,true)).toContainEqual(expect.objectContaining({process:null,net:20,monthNet:-10,finishDay:50}));
});
