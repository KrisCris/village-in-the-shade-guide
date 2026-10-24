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

it('buys a shrub sapling once and picks it every two days through its season', () => {
  const {crop,catalog}=setup({perennial:{kind:'shrub',bearing_seasons:['summer'],rebear_points:200,rebear_days:2},growth_days:10,harvest_quantity:2});
  const direct=cropProcessingOptions(crop,catalog,'normal',28,true).find(row=>!row.process)!;
  expect(direct).toMatchObject({plantings:1,regrows:true,seedCost:10,harvestDays:[1,3,5,7,9,11,13,15,17,19,21,23,25,27],harvested:28,revenue:840,finishDay:27,
    perennial:{plantedAhead:true,laterNet:840,laterNetPerDay:840/27}});
  // Planted on day 1 instead, it is grown on day 10.
  expect(cropProcessingOptions(crop,catalog,'normal',28,true,false).find(row=>!row.process)).toMatchObject({harvestDays:[10,12,14,16,18,20,22,24,26,28],harvested:20,
    perennial:{plantedAhead:false,laterNet:840}});
});

it('models shrubs and fruit trees from the game data in their bearing season', () => {
  const catalog=getCatalog();
  const crop=(id:string)=>catalog.entities.find(e=>e.kind==='crops'&&e.id===id)!;
  const mulberry=cropProcessingOptions(crop('CROPS_ID_MULBERRY'),catalog,'normal',28,true);
  // Each mulberry pick gives 2 leaves and 2 berries; the berries are sold even when the leaves are processed.
  expect(mulberry.find(row=>!row.process)).toMatchObject({harvestCount:14,harvested:28,coProducts:[{itemId:'ITEM_ID_CROPS_MULBERRY',count:28,value:560}],revenue:700,seedCost:2000,net:-1300});
  expect(mulberry.find(row=>row.output.id==='ITEM_ID_RAW_SILK')).toMatchObject({batches:28,processingGain:28*(125-5),revenue:28*125+560});
  // An apple tree adds a fruit a day and holds 3, so it is shaken every third day and on the last day.
  const apple=cropProcessingOptions(crop('CROPS_ID_APPLE_TREE'),catalog,'normal',28,true).find(row=>!row.process)!;
  expect(apple).toMatchObject({harvestDays:[3,6,9,12,15,18,21,24,27,28],harvested:28,seedCost:3000,net:28*120-3000,perennial:{laterNet:28*120,laterNetPerDay:120}});
  const firstSpring=cropProcessingOptions(crop('CROPS_ID_APPLE_TREE'),catalog,'normal',28,true,false).find(row=>!row.process)!;
  expect(firstSpring).toMatchObject({harvestDays:[14,17,20,23,26,28],harvested:17,perennial:{plantedAhead:false,laterNet:28*120}});
  const blueberry=crop('CROPS_ID_BLUEBERRY');
  expect(blueberry.perennial).toBeNull();
  expect(cropProcessingOptions(blueberry,catalog,'normal',28,true).every(row=>row.perennial===null&&row.coProducts.length===0)).toBe(true);
});

it('records plantings, per-seed profit and merged machine runs for the timeline', () => {
  const {crop,catalog}=setup({growth_days:10,harvest_quantity:4},1,4320);
  expect(cropProcessingOptions(crop,catalog,'normal')[0]).toMatchObject({plantings:2,seedPrice:10,regrows:false,netPerSeed:190,harvestDays:[10,20],machineRuns:[[10,34]]});
  const regrowing=setup({regrow_days:7});
  expect(cropProcessingOptions(regrowing.crop,regrowing.catalog,'normal')[0]).toMatchObject({plantings:1,regrows:true,harvestDays:[7,14,21,28],machineRuns:[[7,8],[14,15],[21,22],[28,29]]});
});
