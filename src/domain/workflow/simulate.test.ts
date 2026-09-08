import {expect,it} from 'vitest';
import {simulatePlan} from './simulate';
import {entities,node,plan} from './test-helpers';
const plant=(id='plant',fields:Parameters<typeof node>[2]={})=>node(id,'plant',{cropId:'crop',resourceId:'plot',autoBuy:true,...fields});
it('plants once by default and harvests exactly growth days later',()=>{
 const r=simulatePlan(plan([plant()]),entities);
 expect(r.events.filter(e=>e.kind==='plant').map(e=>e.day)).toEqual([5]);
 expect(r.events.filter(e=>e.kind==='harvest').map(e=>[e.day,e.quantity])).toEqual([[8,5]]);
 expect(r.events.filter(e=>e.kind==='purchase').map(e=>[e.day,e.quantity,e.amount])).toEqual([[5,1,10]]);
 expect(r.spending).toBe(10);expect(r.cash).toBe(90);
});
it('repeat buys on actual sow dates and uses land freed by that morning harvest',()=>{
 const r=simulatePlan(plan([plant('plant',{repeat:true})]),entities);
 expect(r.events.filter(e=>e.kind==='plant').map(e=>e.day)).toEqual([5,8,11,14]);
 expect(r.events.filter(e=>e.kind==='purchase').map(e=>e.day)).toEqual([5,8,11,14]);
 expect(r.inProgress).toEqual([{nodeId:'plant',finishDay:17,itemId:'crop-item',quantity:5}]);
});
it('regrowth keeps its plot without charging additional seeds',()=>{
 const es=entities.map(e=>e.id==='crop'?{...e,regrow_days:2}:e);
 const r=simulatePlan(plan([plant('plant',{repeat:true,endDay:12})]),es);
 expect(r.events.filter(e=>e.kind==='plant')).toHaveLength(1);
 expect(r.events.filter(e=>e.kind==='harvest').map(e=>e.day)).toEqual([8,10,12,14]);
 expect(r.spending).toBe(10);
});
it('shared plots block a fixed-day second planting without retrying it',()=>{
 const r=simulatePlan(plan([plant('a'),plant('b')]),entities);
 expect(r.events.filter(e=>e.kind==='plant').map(e=>e.nodeId)).toEqual(['a']);
 expect(r.events.some(e=>e.nodeId==='b'&&e.kind==='warning')).toBe(true);
});
it('queues two processors through a shared single slot',()=>{
 const r=simulatePlan(plan([node('pork','inventory',{itemId:'pork',quantity:2}),node('salt','inventory',{itemId:'salt',quantity:2}),node('a','process',{recipeId:'recipe',resourceId:'machine-resource'}),node('b','process',{recipeId:'recipe',resourceId:'machine-resource'})],[['pork','a'],['salt','a'],['pork','b'],['salt','b']]),entities);
 expect(r.events.filter(e=>e.kind==='process').map(e=>[e.nodeId,e.day])).toEqual([['a',5],['b',6]]);
 expect(r.events.filter(e=>e.kind==='complete').map(e=>e.day)).toEqual([6,7]);
});
it('does not spend pork when a complete recipe batch lacks salt',()=>{
 const r=simulatePlan(plan([node('stock','inventory',{itemId:'pork',quantity:3}),node('process','process',{recipeId:'recipe',resourceId:'machine-resource'})],[['stock','process']]),entities);
 expect(r.stock).toContainEqual({nodeId:'stock',itemId:'pork',quantity:3,reserved:false});
 expect(r.events.filter(e=>e.kind==='process')).toHaveLength(0);
});
it('reserves three from a five-item harvest and sells only the remaining two',()=>{
 const r=simulatePlan(plan([plant(),node('reserve','reserve',{requirements:[{itemId:'crop-item',quantity:3}]}),node('sale','sale',{itemId:'crop-item',quantity:0,repeat:true})],[['plant','reserve'],['plant','sale']]),entities);
 expect(r.demandProgress.reserve).toEqual([{itemId:'crop-item',quantity:3}]);
 expect(r.events.filter(e=>e.kind==='sale').map(e=>e.quantity)).toEqual([2]);
 expect(r.stock).toContainEqual({nodeId:'reserve',itemId:'crop-item',quantity:3,reserved:true});
 expect(r.income).toBe(40);
});
it('collects grouped delivery incrementally and consumes exactly once on the deadline',()=>{
 const r=simulatePlan(plan([node('p','inventory',{itemId:'pork',quantity:2}),node('s','inventory',{itemId:'salt',startDay:7,quantity:1}),node('delivery','delivery',{requirements:[{itemId:'pork',quantity:1},{itemId:'salt',quantity:1}],dueDay:8})],[['p','delivery'],['s','delivery']]),entities);
 expect(r.events.filter(e=>e.kind==='delivery').map(e=>e.day)).toEqual([8]);
 expect(r.stock).toEqual([{nodeId:'p',itemId:'pork',quantity:1,reserved:false}]);
 expect(r.demandProgress.delivery).toEqual([{itemId:'pork',quantity:1},{itemId:'salt',quantity:1}]);
});
it('cannot buy with unsettled sale income but can use the next-day receipt',()=>{
 const r=simulatePlan(plan([node('s','inventory',{itemId:'crop-item'}),node('sale','sale',{itemId:'crop-item',quantity:0}),node('buy','purchase',{itemId:'seed',repeat:true})],[['s','sale']],{initialCash:0,days:2}),entities);
 expect(r.days[0].cash).toBe(0);expect(r.days[0].pendingRevenue).toBe(20);
 expect(r.events.filter(e=>e.kind==='purchase').map(e=>e.day)).toEqual([6]);
 expect(r.cash).toBe(10);
});
it('keeps month-end completion and settlement on absolute dates',()=>{
 const r=simulatePlan(plan([node('p','inventory',{itemId:'pork',startDay:28}),node('s','inventory',{itemId:'salt',startDay:28}),node('process','process',{recipeId:'recipe',resourceId:'machine-resource',startDay:28}),node('sale','sale',{itemId:'bacon',quantity:0,startDay:28,repeat:true})],[['p','process'],['s','process'],['process','sale']],{startDay:28,days:2}),entities);
 expect(r.events.filter(e=>e.kind==='complete').map(e=>e.day)).toEqual([29]);
 expect(r.income).toBe(0);expect(r.pendingRevenue).toBe(160);
});
it('initial planted and processing work charges no inputs and occupies resources',()=>{
 const r=simulatePlan(plan([plant('grown',{remainingDays:2}),node('old','process',{recipeId:'recipe',resourceId:'machine-resource',remainingDays:1}),plant('new')]),entities);
 expect(r.spending).toBe(0);
 expect(r.events.filter(e=>e.kind==='complete').map(e=>e.day)).toEqual([6]);
 expect(r.events.filter(e=>e.kind==='harvest').map(e=>e.day)).toEqual([7]);
 expect(r.events.filter(e=>e.nodeId==='new'&&e.kind==='plant')).toHaveLength(0);
});
it.each([{startDay:27,remainingDays:3},{startDay:29,remainingDays:1}])('blocks existing crops outside their current allowed season: %j',({startDay,remainingDays})=>{
 const es=entities.map(e=>e.id==='crop'?{...e,seasons:['spring']}:e);
 const r=simulatePlan(plan([plant('existing',{startDay,remainingDays})],[],{startDay,days:8}),es);
 expect(r.events.filter(e=>e.kind==='harvest')).toEqual([]);
 expect(r.stock).toEqual([]);expect(r.inProgress).toEqual([]);expect(r.spending).toBe(0);
 expect(r.issues.some(i=>i.includes('季节'))).toBe(true);
});
it('does not let an invalid existing crop occupy another existing crop plot',()=>{
 const es=entities.map(e=>e.id==='crop'?{...e,seasons:['spring']}:e);
 const r=simulatePlan(plan([plant('a-invalid',{startDay:27,remainingDays:3}),plant('b-valid',{startDay:27,remainingDays:1})],[],{startDay:27,days:4}),es);
 expect(r.events.filter(e=>e.kind==='harvest').map(e=>[e.nodeId,e.day])).toEqual([['b-valid',28]]);
 expect(r.issues.some(i=>i.includes('容量'))).toBe(false);
 expect(r.spending).toBe(0);
});
it('finishes valid existing crops after their last allowed start date without buying seeds',()=>{
 const r=simulatePlan(plan([plant('existing',{startDay:5,endDay:5,remainingDays:3})]),entities);
 expect(r.events.filter(e=>e.kind==='harvest').map(e=>e.day)).toEqual([8]);
 expect(r.spending).toBe(0);expect(r.issues).toEqual([]);
});
it('allows existing processing work to complete across a season boundary',()=>{
 const r=simulatePlan(plan([node('old','process',{recipeId:'recipe',resourceId:'machine-resource',startDay:27,remainingDays:3})],[],{startDay:27,days:4}),entities);
 expect(r.events.filter(e=>e.kind==='complete').map(e=>[e.day,e.quantity])).toEqual([[30,2]]);
 expect(r.spending).toBe(0);expect(r.issues).toEqual([]);
});
it('returns explainable issues for cycles and invalid quantities',()=>{
 const cyclic=plan([node('a','process',{recipeId:'recipe'}),node('b','process',{recipeId:'recipe'})],[['a','b'],['b','a']]);
 expect(simulatePlan(cyclic,entities).issues.length).toBeGreaterThan(0);
 expect(simulatePlan(plan([plant('bad',{quantity:NaN})]),entities).issues.length).toBeGreaterThan(0);
 const r=simulatePlan(plan([plant()]),entities.map(e=>e.id==='crop'?{...e,growth_days:null}:e));
 expect(r.events.filter(e=>e.kind==='plant')).toHaveLength(0);expect(r.issues.length).toBeGreaterThan(0);
});
it('keeps regrowing land occupied after the final allowed start date',()=>{
 const es=entities.map(e=>e.id==='crop'?{...e,regrow_days:3}:e);
 const r=simulatePlan(plan([plant('regrow',{endDay:13}),plant('new',{startDay:12})]),es);
 expect(r.events.filter(e=>e.kind==='harvest').map(e=>e.day)).toEqual([8,11,14]);
 expect(r.events.filter(e=>e.nodeId==='new'&&e.kind==='plant')).toHaveLength(0);
});
it('does not silently deliver after a missed fixed deadline',()=>{
 const r=simulatePlan(plan([node('stock','inventory',{itemId:'pork',startDay:7}),node('delivery','delivery',{requirements:[{itemId:'pork',quantity:1}],dueDay:6})],[['stock','delivery']]),entities);
 expect(r.events.filter(e=>e.kind==='delivery')).toHaveLength(0);
 expect(r.stock).toContainEqual({nodeId:'delivery',itemId:'pork',quantity:1,reserved:true});
});
it('gracefully rejects malformed raw plans and unsafe finishing dates',()=>{
 expect(()=>simulatePlan({...plan([]),nodes:[null]} as never,entities)).not.toThrow();
 expect(simulatePlan({...plan([]),nodes:[null]} as never,entities).issues.length).toBeGreaterThan(0);
 const r=simulatePlan(plan([node('old','process',{recipeId:'recipe',resourceId:'machine-resource',remainingDays:Number.MAX_SAFE_INTEGER})]),entities);
 expect(r.inProgress).toHaveLength(0);expect(r.issues.length).toBeGreaterThan(0);
});
it('protects demand from a same-day purchase before starting a processor',()=>{
 const r=simulatePlan(plan([node('pork','inventory',{itemId:'pork'}),node('buy','purchase',{itemId:'salt'}),node('reserve','reserve',{requirements:[{itemId:'salt',quantity:1}]}),node('process','process',{recipeId:'recipe',resourceId:'machine-resource'})],[['buy','reserve'],['buy','process'],['pork','process']]),entities);
 expect(r.stock).toContainEqual({nodeId:'reserve',itemId:'salt',quantity:1,reserved:true});
 expect(r.events.filter(e=>e.kind==='process')).toHaveLength(0);
});
it('includes catalog-validation warnings in the first daily event list',()=>{
 const r=simulatePlan(plan([plant('bad',{cropId:'missing'})]),entities);
 expect(r.days[0].events.some(e=>e.kind==='warning'&&e.nodeId==='bad')).toBe(true);
});
it('uses safe own-property demand progress even for imported arbitrary node IDs',()=>{
 const r=simulatePlan(plan([node('__proto__','reserve',{requirements:[{itemId:'pork',quantity:1}]})]),entities);
 expect(Object.hasOwn(r.demandProgress,'__proto__')).toBe(true);
});
it('uses multiple connected source buffers in ID order without touching unconnected stock',()=>{
 const r=simulatePlan(plan([node('z','inventory',{itemId:'seed',quantity:2}),node('a','inventory',{itemId:'seed',quantity:1}),node('unused','inventory',{itemId:'seed',quantity:9}),plant('plant',{quantity:2,autoBuy:false})],[['z','plant'],['a','plant']],{plots:[{id:'plot',label:'田',capacity:2}]}),entities);
 expect(r.spending).toBe(0);
 expect(r.stock).toContainEqual({nodeId:'z',itemId:'seed',quantity:1,reserved:false});
 expect(r.stock).toContainEqual({nodeId:'unused',itemId:'seed',quantity:9,reserved:false});
 expect(r.stock.some(s=>s.nodeId==='a')).toBe(false);
});
it('queues a finite batch request across days and honors integer machine slots',()=>{
 const r=simulatePlan(plan([node('p','inventory',{itemId:'pork',quantity:3}),node('s','inventory',{itemId:'salt',quantity:3}),node('process','process',{recipeId:'recipe',resourceId:'machine-resource',quantity:3})],[['p','process'],['s','process']],{machines:[{id:'machine-resource',machineId:'machine',label:'两台',count:2,capacity:1}]}),entities);
 expect(r.events.filter(e=>e.kind==='process').map(e=>[e.day,e.quantity])).toEqual([[5,2],[6,1]]);
 expect(r.stock).toEqual([{nodeId:'process',itemId:'bacon',quantity:6,reserved:false}]);
});
it('never chains two short recipes to completion in one day',()=>{
 const es=entities.map(e=>e.id==='recipe'?{...e,duration_minutes:1}:e);
 const r=simulatePlan(plan([node('p','inventory',{itemId:'pork'}),node('s','inventory',{itemId:'salt'}),node('process','process',{recipeId:'recipe',resourceId:'machine-resource'})],[['p','process'],['s','process']],{days:1}),es);
 expect(r.events.filter(e=>e.kind==='complete')).toHaveLength(0);
 expect(r.inProgress).toEqual([{nodeId:'process',itemId:'bacon',quantity:2,finishDay:6}]);
});
it('respects season and year store availability and reports unverified unlock conditions',()=>{
 const es=entities.map(e=>e.id==='offer'?{...e,required_flags:[520,999999],conditions:['玩家解锁条件']}:e);
 expect(simulatePlan(plan([plant()]),es).spending).toBe(0);
 const r=simulatePlan(plan([plant('plant',{startDay:117})],[],{startDay:117,days:1}),es);
 expect(r.spending).toBe(10);expect(r.issues.some(i=>i.includes('条件'))).toBe(true);
 const noOffer=simulatePlan(plan([node('buy','purchase',{itemId:'seed'})]),entities.filter(e=>e.id!=='offer'));
 expect(noOffer.spending).toBe(0);expect(noOffer.issues.length).toBeGreaterThan(0);
});
it('fixed dates do not retry failed purchases but repeated planting can wait for cash',()=>{
 const nodes=[node('stock','inventory',{itemId:'crop-item'}),node('sale','sale',{itemId:'crop-item'}),plant('plant',{repeat:true,endDay:10}),node('buy','purchase',{itemId:'salt'})];
 const r=simulatePlan(plan(nodes,[['stock','sale']],{initialCash:0}),entities);
 expect(r.events.filter(e=>e.kind==='purchase').map(e=>[e.nodeId,e.day])).toEqual([['plant',6],['plant',9]]);
 expect(r.events.filter(e=>e.kind==='plant').map(e=>e.day)).toEqual([6,9]);
});
it('immediate settlement funds same-day sowing and quality changes sale price only',()=>{
 const r=simulatePlan(plan([node('stock','inventory',{itemId:'crop-item'}),node('sale','sale',{itemId:'crop-item'}),plant()],[['stock','sale']],{initialCash:0,days:1,settlementDays:0,quality:'gold'}),entities);
 expect(r.income).toBe(35);expect(r.spending).toBe(10);expect(r.cash).toBe(25);expect(r.pendingRevenue).toBe(0);
});
it('inventory and goods with unknown prices never invent income',()=>{
 const r=simulatePlan(plan([node('stock','inventory',{itemId:'seed',quantity:3}),node('sale','sale',{itemId:'seed',quantity:0})],[['stock','sale']]),entities);
 expect(r.income).toBe(0);expect(r.stock).toContainEqual({nodeId:'stock',itemId:'seed',quantity:3,reserved:false});
});
it('keeps daily stock snapshots independent from later sales and final results',()=>{
 const r=simulatePlan(plan([node('stock','inventory',{itemId:'crop-item',quantity:3}),node('sale','sale',{itemId:'crop-item',startDay:6,quantity:1})],[['stock','sale']],{days:3}),entities);
 expect(r.days.map(d=>d.stock[0].quantity)).toEqual([3,2,2]);
 r.stock[0].quantity=100;r.days[2].stock[0].quantity=200;
 expect(r.days[0].stock[0].quantity).toBe(3);expect(r.days[1].stock[0].quantity).toBe(2);
});
it('rejects oversized horizons and initial machine oversubscription explainably',()=>{
 expect(simulatePlan(plan([],[],{days:113}),entities).days).toEqual([]);
 const r=simulatePlan(plan([node('a','process',{recipeId:'recipe',resourceId:'machine-resource',remainingDays:2}),node('b','process',{recipeId:'recipe',resourceId:'machine-resource',remainingDays:2})]),entities);
 expect(r.events.filter(e=>e.kind==='complete').map(e=>e.nodeId)).toEqual(['a']);
 expect(r.issues.some(i=>i.includes('容量'))).toBe(true);
});
it('protects reserves before daily consumption and never consumes reserved stock',()=>{
 const r=simulatePlan(plan([node('stock','inventory',{itemId:'pork',quantity:5}),node('reserve','reserve',{requirements:[{itemId:'pork',quantity:2}]}),node('consume','consume',{itemId:'pork',quantity:1,repeat:true})],[['stock','reserve'],['stock','consume']]),entities);
 expect(r.events.filter(e=>e.kind==='consume').map(e=>e.day)).toEqual([5,6,7]);
 expect(r.stock).toEqual([{nodeId:'reserve',itemId:'pork',quantity:2,reserved:true}]);
});
it('rejects zero quantities outside sale and machine capacity beyond 500 simultaneous batches',()=>{
 expect(simulatePlan(plan([plant('zero',{quantity:0})]),entities).issues.length).toBeGreaterThan(0);
 expect(simulatePlan(plan([],[],{machines:[{id:'machine-resource',label:'机器',machineId:'machine',count:501,capacity:1}]}),entities).issues.length).toBeGreaterThan(0);
});
it('does not fabricate initial processing outputs from missing recipe data',()=>{
 const r=simulatePlan(plan([node('old','process',{recipeId:'recipe',resourceId:'machine-resource',remainingDays:0})]),entities.map(e=>e.id==='recipe'?{...e,output:{item_id:'bacon',quantity:null}}:e));
 expect(r.stock).toEqual([]);expect(r.inProgress).toEqual([]);expect(r.events.filter(e=>e.kind==='complete')).toHaveLength(0);
 expect(r.issues.length).toBeGreaterThan(0);
});
it('treats undated targets and future delivery deficits as pending progress without daily warnings',()=>{
 const r=simulatePlan(plan([node('reserve','reserve',{requirements:[{itemId:'pork',quantity:1}]}),node('undated','delivery',{requirements:[{itemId:'salt',quantity:1}]}),node('dated','delivery',{requirements:[{itemId:'salt',quantity:1}],dueDay:7})],[],{days:3}),entities);
 expect(r.events.filter(e=>e.kind==='warning').map(e=>[e.nodeId,e.day])).toEqual([['dated',7]]);
 expect(r.demandProgress.undated).toEqual([{itemId:'salt',quantity:0}]);
});
it.each([null,{},[null],[{}]].map(requirements=>({requirements})))('returns issues for connected malformed demand requirements %j',({requirements})=>{
 for(const kind of ['reserve','delivery'] as const) {
  const p=plan([node('source','inventory',{itemId:'pork'}),node('demand',kind,{requirements:requirements as never})],[['source','demand']]);
  expect(simulatePlan(p,entities).issues.length).toBeGreaterThan(0);
 }
});
it('allows planting on the final start date and harvests afterward without restarting',()=>{
 const r=simulatePlan(plan([plant('plant',{startDay:5,endDay:5,repeat:true})]),entities);
 expect(r.events.filter(e=>e.kind==='plant').map(e=>e.day)).toEqual([5]);
 expect(r.events.filter(e=>e.kind==='harvest').map(e=>e.day)).toEqual([8]);
 expect(r.spending).toBe(10);
});
it('continues new and existing regrowing crops after endDay through the season boundary',()=>{
 const es=entities.map(e=>e.id==='crop'?{...e,regrow_days:2}:e);
 const r=simulatePlan(plan([plant('new',{endDay:5}),plant('existing',{endDay:5,remainingDays:1})],[],{days:27,plots:[{id:'plot',label:'田',capacity:2}]}),es);
 expect(r.events.filter(e=>e.kind==='harvest'&&e.nodeId==='new').map(e=>e.day)).toEqual([8,10,12,14,16,18,20,22,24,26,28]);
 expect(r.events.filter(e=>e.kind==='harvest'&&e.nodeId==='existing').map(e=>e.day)).toEqual([6,8,10,12,14,16,18,20,22,24,26,28]);
 expect(r.spending).toBe(10);expect(r.inProgress).toEqual([]);
});
