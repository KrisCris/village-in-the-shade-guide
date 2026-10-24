import {expect, it} from 'vitest';
import type {Catalog, Entity} from '../data/types';
import {cropProcessingOptions} from './cropProcessing';
import {getCatalog} from '../data/repository';

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
    harvestCount:4,seedCost:40,revenue:200,processingGain:80,net:160,monthNet:110,finishDay:29,netPerDay:160/29,
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
    process:null,harvestCount:4,harvested:4,seedCost:40,revenue:120,net:80,monthNet:80,processingGain:0,machineDays:0,finishDay:28,netPerDay:80/28,
  }));
});

it('retains seed expense but no cash revenue for direct sales after month end', () => {
  const {crop,catalog}=setup({growth_days:50});
  expect(cropProcessingOptions(crop,catalog,'normal',28,true)).toContainEqual(expect.objectContaining({process:null,net:20,monthNet:-10,finishDay:50,netPerDay:0.4}));
});

it('spreads daily profit over growth, processing queue and the last sale', () => {
  const {crop,catalog}=setup({growth_days:10,harvest_quantity:4},1,4320);
  // Harvests on days 10 and 20 queue eight three-day batches; the last finishes on day 34.
  expect(cropProcessingOptions(crop,catalog,'normal')[0]).toMatchObject({batches:8,finishDay:34,net:380,netPerDay:380/34});
});

it('leaves perennial shrubs out instead of rebuying the sapling every harvest', () => {
  const {crop,catalog}=setup({perennial:{kind:'shrub',bearing_seasons:['summer'],rebear_points:200,rebear_days:2},growth_days:10,harvest_quantity:2});
  expect(cropProcessingOptions(crop,catalog,'normal',28,true)).toEqual([]);
});

it('does not rank shrubs or fruit trees, which stay planted and bear only in season', () => {
  const catalog=getCatalog();
  for (const [id,kind,season] of [['CROPS_ID_MULBERRY','shrub','summer'],['CROPS_ID_TEA_TREE','shrub','spring'],['CROPS_ID_APPLE_TREE','fruit_tree','autumn']]) {
    const crop=catalog.entities.find(e=>e.kind==='crops'&&e.id===id)!;
    expect(crop.perennial).toMatchObject({kind,bearing_seasons:[season]});
    expect(crop.profit_per_day).toBeNull();
    expect(cropProcessingOptions(crop,catalog,'normal',28,true)).toEqual([]);
  }
  const blueberry=catalog.entities.find(e=>e.kind==='crops'&&e.id==='CROPS_ID_BLUEBERRY')!;
  expect(blueberry.perennial).toBeNull();
  expect(cropProcessingOptions(blueberry,catalog,'normal',28,true).length).toBeGreaterThan(0);
});
