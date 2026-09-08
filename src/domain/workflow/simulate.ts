import type {Entity} from '../../data/types';
import {QUALITY_VALUES,qualityPrice} from '../quality';
import {seedAvailability} from '../seedAvailability';
import {seasonAt,yearAt} from './date';
import {canConnect,hasCycle,stringArray} from './graph';
import type {Amount,PlanEvent,StockRow,WorkflowNode,WorkflowPlan,SimulationResult} from './types';

type Job = {nodeId:string;resourceId:string;kind:'plant'|'process';finishDay:number;itemId:string;quantity:number;slots:number;regrow:number;lastDay:number;holding?:boolean};
type Crop = {seedIds:string[];itemId:string;growth:number;regrow:number;yield:number;seasons:string[]};
type Recipe = {inputs:Amount[];itemId:string;yield:number;duration:number;machineIds:string[]};
const whole = (n:unknown,min=0):n is number => typeof n==='number'&&Number.isSafeInteger(n)&&n>=min;
const finite = (n:unknown):n is number => typeof n==='number'&&Number.isFinite(n)&&n>=0;
const ordered = (a:WorkflowNode,b:WorkflowNode) => a.priority-b.priority||(a.id<b.id?-1:a.id>b.id?1:0);
const empty = ():SimulationResult => ({days:[],events:[],issues:[],income:0,spending:0,cash:0,pendingRevenue:0,stock:[],inProgress:[],demandProgress:Object.create(null)});

function grouped(amounts:Amount[]):Amount[] {
 const totals=new Map<string,number>();
 for(const a of amounts)totals.set(a.itemId,(totals.get(a.itemId)??0)+a.quantity);
 return [...totals].map(([itemId,quantity])=>({itemId,quantity}));
}

/** Bounded, deterministic daily simulation. Each buffer belongs to exactly one node. */
export function simulatePlan(plan:WorkflowPlan,entities:Entity[]):SimulationResult {
 const result=empty();
 const invalid=(message:string)=>{result.issues.push(message);return result;};
 if(!plan||plan.version!==1||!whole(plan.startDay,1)||!whole(plan.days,1)||plan.days>112||!Number.isSafeInteger(plan.startDay+plan.days)||!finite(plan.initialCash)||!whole(plan.settlementDays)||plan.settlementDays>7||!QUALITY_VALUES.includes(plan.quality))return invalid('方案日期、天数、现金、品质或结算延迟无效。');
 if(!Array.isArray(plan.nodes)||!Array.isArray(plan.edges)||!Array.isArray(plan.plots)||!Array.isArray(plan.machines)||plan.nodes.length>200||plan.edges.length>500)return invalid('方案资源无效，或超过 200 个节点 / 500 条连线限制。');
 if([...plan.nodes,...plan.edges,...plan.plots,...plan.machines].some(value=>!value||typeof value!=='object'))return invalid('节点、连线和资源必须是有效对象。');
 result.cash=plan.initialCash;
 const nodes=[...plan.nodes].sort(ordered),byNode=new Map(nodes.map(n=>[n.id,n]));
 if(byNode.size!==nodes.length||nodes.some(n=>typeof n.id!=='string'||!n.id||!['inventory','purchase','plant','process','reserve','delivery','consume','sale'].includes(n.kind)||!whole(n.quantity)||!whole(n.startDay,1)||!Number.isFinite(n.priority)||n.endDay!==undefined&&(!whole(n.endDay,1)||n.endDay<n.startDay)||n.dueDay!==undefined&&!whole(n.dueDay,1)||n.remainingDays!==undefined&&(!whole(n.remainingDays)||!whole(n.remainingDays+plan.startDay))))return invalid('节点编号、数量或日期无效。数量必须是非负整数。');
 if(nodes.some(n=>n.quantity===0&&n.kind!=='sale'))return invalid('非出售节点的数量必须大于零。');
 if(plan.plots.some(r=>!r.id||!whole(r.capacity))||plan.machines.some(r=>!r.id||!whole(r.count)||!whole(r.capacity)||!whole(r.count*r.capacity))||new Set([...plan.plots,...plan.machines].map(r=>r.id)).size!==plan.plots.length+plan.machines.length)return invalid('土地或机器资源容量无效，或资源编号重复。');
 if(plan.machines.reduce((sum,r)=>sum+r.count*r.capacity,0)>500)return invalid('最多同时安排 500 批加工。');
 if(nodes.some(n=>(n.kind==='reserve'||n.kind==='delivery')&&(!Array.isArray(n.requirements)||!n.requirements.length||n.requirements.some(a=>!a||typeof a.itemId!=='string'||!a.itemId||!whole(a.quantity,1)))))return invalid('留货 / 交付需求必须包含有效物品和正整数数量。');
 if(hasCycle(nodes,plan.edges))return invalid('连线包含循环，或连接了不存在的节点。');
 const accepted:typeof plan.edges=[];
 for(const edge of plan.edges) {
  if(!canConnect(nodes,accepted,edge.source,edge.target,entities))return invalid('连线物品不兼容，或存在重复、自环、无效来源 / 目标。');
  accepted.push(edge);
 }
 const byEntity=new Map(entities.map(e=>[e.id,e]));
 const buffers=new Map(nodes.map(n=>[n.id,new Map<string,number>()]));
 const sources=new Map(nodes.map(n=>[n.id,plan.edges.filter(e=>e.target===n.id).map(e=>e.source).sort()]));
 const jobs:Job[]=[],receipts:Array<{day:number;nodeId:string;itemId:string;quantity:number;amount:number}>=[];
 const started=new Map<string,number>(),delivered=new Set<string>(),disabled=new Set<string>(),initialized=new Set<string>();
 const requirements=new Map<string,Amount[]>(),crops=new Map<string,Crop>(),recipes=new Map<string,Recipe>();
 let day=plan.startDay;
 const issueSet=new Set<string>();
 const emit=(node:WorkflowNode,kind:PlanEvent['kind'],message:string,extra:Partial<PlanEvent>={})=>result.events.push({day,nodeId:node.id,kind,message,...extra});
 const warn=(node:WorkflowNode,message:string)=>{
  const full=`${node.label || node.id}：${message}`;
  if(!issueSet.has(full)){issueSet.add(full);result.issues.push(full);}
  emit(node,'warning',message);
 };
 const stop=(node:WorkflowNode,message:string)=>{warn(node,message);disabled.add(node.id);};
 const name=(id:string)=>byEntity.get(id)?.name?.zh_hans||id;
 const put=(nodeId:string,itemId:string,quantity:number)=>{
  const buffer=buffers.get(nodeId)!;buffer.set(itemId,(buffer.get(itemId)??0)+quantity);
 };
 const available=(node:WorkflowNode,itemId:string)=>sources.get(node.id)!.reduce((sum,id)=>sum+(buffers.get(id)!.get(itemId)??0),0);
 const take=(node:WorkflowNode,itemId:string,quantity:number)=>{
  let remaining=quantity;
  for(const sourceId of sources.get(node.id)!) {
   const buffer=buffers.get(sourceId)!,stock=buffer.get(itemId)??0,used=Math.min(stock,remaining);
   if(used){buffer.set(itemId,stock-used);remaining-=used;}
   if(!remaining)break;
  }
 };
 const stock=():StockRow[]=>nodes.flatMap(n=>[...buffers.get(n.id)!].filter(([,q])=>q>0).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([itemId,quantity])=>({nodeId:n.id,itemId,quantity,reserved:n.kind==='reserve'||n.kind==='delivery'})));
 const occupied=(resourceId:string)=>jobs.filter(j=>j.resourceId===resourceId).reduce((sum,j)=>sum+j.slots,0);
 const active=(n:WorkflowNode)=>day>=n.startDay&&(n.endDay===undefined||day<=n.endDay)&&!disabled.has(n.id);
 const fixedOrRepeat=(n:WorkflowNode)=>active(n)&&(n.repeat||day===n.startDay);
 const purchase=(node:WorkflowNode,itemId:string,quantity:number):boolean=>{
  if(!quantity)return true;
  const item=byEntity.get(itemId),price=item?.buy_price;
  if(!finite(price)||!finite(price*quantity)){warn(node,`${name(itemId)} 缺少有效买价。`);return false;}
  const availability=seedAvailability({...item!,seed_item_ids:[itemId]},entities,yearAt(day),seasonAt(day));
  if(!availability.available){warn(node,`${name(itemId)} 当日没有已知商店供应。`);return false;}
  if(price*quantity>result.cash){warn(node,`现金不足：购买 ${quantity} 个${name(itemId)} 需要 ${price*quantity}，可用 ${result.cash}。`);return false;}
  const offers=entities.filter(e=>e.kind==='store-offers'&&e.item_id===itemId&&(!stringArray(e.seasons).length||stringArray(e.seasons).includes(seasonAt(day))));
  const unknown=offers.some(e=>Array.isArray(e.required_flags)&&e.required_flags.some(f=>![520,521,522,523,524,525,526,527].includes(f))||Array.isArray(e.excluded_flags)&&e.excluded_flags.length);
  if(availability.conditions.length||unknown)warn(node,`商店解锁条件需玩家确认：${availability.conditions.join('；')||'存在尚未识别的条件'}。`);
  const amount=price*quantity;result.cash-=amount;result.spending+=amount;
  emit(node,'purchase',`购买 ${quantity} 个${name(itemId)}，支出 ${amount}。`,{itemId,quantity,amount});
  return true;
 };
 // Validate catalog fields once; missing data blocks only the affected node.
 for(const n of nodes) {
  if(['inventory','purchase','consume','sale'].includes(n.kind)&&(!n.itemId||!byEntity.has(n.itemId))){stop(n,'尚未选择有效物品。');continue;}
  if(n.kind==='reserve'||n.kind==='delivery') {
   if(!Array.isArray(n.requirements)||!n.requirements.length||n.requirements.some(a=>!a||!byEntity.has(a.itemId)||!whole(a.quantity,1))){stop(n,'留货 / 交付需求缺少有效物品或数量。');continue;}
   const req=grouped(n.requirements);
   if(req.some(a=>!whole(a.quantity,1))){stop(n,'需求数量超过安全整数范围。');continue;}
   requirements.set(n.id,req);result.demandProgress[n.id]=req.map(a=>({...a,quantity:0}));
  }
  if(n.kind==='plant') {
   const crop=byEntity.get(n.cropId??''),seedIds=stringArray(crop?.seed_item_ids),outputs=stringArray(crop?.harvest_item_ids),seasons=stringArray(crop?.seasons);
   const growth=crop?.growth_days,regrow=crop?.regrow_days??0,yieldCount=crop?.harvest_quantity;
   if(!crop||!whole(growth,1)||!whole(regrow)||!whole(yieldCount,1)||!whole(yieldCount*n.quantity)||outputs.length!==1||!byEntity.has(outputs[0])||!seedIds.length||!seedIds.every(id=>byEntity.has(id))||!seasons.length){stop(n,'作物生长天数、收获数量、种子、季节或唯一收获物数据不完整。');continue;}
   if(!plan.plots.some(r=>r.id===n.resourceId)){stop(n,'请选择有效土地资源。');continue;}
   crops.set(n.id,{seedIds,itemId:outputs[0],growth,regrow,yield:yieldCount,seasons});
  }
  if(n.kind==='process') {
   const recipe=byEntity.get(n.recipeId??''),inputs=recipe?.inputs as Array<{item_id:string;quantity:number}>|undefined,output=recipe?.output as {item_id:string;quantity:number}|undefined,duration=recipe?.duration_minutes;
   if(!recipe||!Array.isArray(inputs)||!inputs.length||inputs.some(a=>!a||!byEntity.has(a.item_id)||!whole(a.quantity,1))||!output||!byEntity.has(output.item_id)||!whole(output.quantity,1)||!whole(output.quantity*n.quantity)||!finite(duration)||!whole(plan.startDay+plan.days+Math.ceil(duration/1440))) {stop(n,'配方原料、产出数量或加工时长数据不完整。');continue;}
   const amounts=grouped(inputs.map(a=>({itemId:a.item_id,quantity:a.quantity})));
   if(amounts.some(a=>!whole(a.quantity*n.quantity))){stop(n,'配方数量超过安全整数范围。');continue;}
   const resource=plan.machines.find(r=>r.id===n.resourceId),machineIds=stringArray(recipe.machine_ids);
   if(!resource||!machineIds.includes(resource.machineId)){stop(n,'机器资源与配方不兼容。');continue;}
   recipes.set(n.id,{inputs:amounts,itemId:output.item_id,yield:output.quantity,duration:Math.max(1,Math.ceil(duration/1440)),machineIds});
  }
 }
 // Existing work occupies capacity before any newly requested work can start.
 for(const n of nodes.filter(n=>n.remainingDays!==undefined&&!disabled.has(n.id))) {
  if(n.kind!=='plant'&&n.kind!=='process')continue;
  const crop=crops.get(n.id),recipe=recipes.get(n.id);
  const resource=n.kind==='plant'?plan.plots.find(r=>r.id===n.resourceId)!:plan.machines.find(r=>r.id===n.resourceId)!;
  const capacity=n.kind==='plant'?resource.capacity:plan.machines.find(r=>r.id===n.resourceId)!.count*resource.capacity;
  if(occupied(resource.id)+n.quantity>capacity){stop(n,'已有作物 / 在制品超过资源容量。');continue;}
  const itemId=crop?.itemId??recipe!.itemId,yieldCount=crop?.yield??recipe!.yield;
  jobs.push({nodeId:n.id,resourceId:resource.id,kind:n.kind,finishDay:plan.startDay+n.remainingDays!,itemId,quantity:n.quantity*yieldCount,slots:n.quantity,regrow:crop?.regrow??0,lastDay:Math.ceil(plan.startDay/28)*28});
  initialized.add(n.id);started.set(n.id,n.quantity);
 }
 const protectDemands=(reportDeficits:boolean)=>{
  for(const n of nodes)if((n.kind==='reserve'||n.kind==='delivery')&&active(n)&&!delivered.has(n.id)) {
   const req=requirements.get(n.id)!,progress=result.demandProgress[n.id];
   for(let i=0;i<req.length;i++) {
    const amount=req[i],missing=amount.quantity-progress[i].quantity,count=Math.min(missing,available(n,amount.itemId));
    if(count>0){take(n,amount.itemId,count);put(n.id,amount.itemId,count);progress[i].quantity+=count;emit(n,'reserve',`留存 ${count} 个${name(amount.itemId)}。`,{itemId:amount.itemId,quantity:count});}
   }
   if(n.kind==='delivery'&&n.dueDay!==undefined&&day>=n.dueDay) {
    if(day===n.dueDay&&req.every((a,i)=>progress[i].quantity>=a.quantity)) {
     buffers.get(n.id)!.clear();delivered.add(n.id);emit(n,'delivery','需求已全部交付。');
    } else if(reportDeficits)warn(n,day>n.dueDay?'已错过交付日期，货物继续保留；请调整日期后重新计算。':'已到交付日期，需求尚未全部备齐。');
   }
  }
 };
 for(day=plan.startDay;day<plan.startDay+plan.days;day++) {
  const eventStart=day===plan.startDay?0:result.events.length,incomeBefore=result.income,spendingBefore=result.spending;
  for(let i=receipts.length-1;i>=0;i--)if(receipts[i].day<=day) {
   const r=receipts.splice(i,1)[0];result.cash+=r.amount;result.income+=r.amount;
   emit(byNode.get(r.nodeId)!,'receipt',`出货款到账 ${r.amount}。`,{itemId:r.itemId,quantity:r.quantity,amount:r.amount});
  }
  for(let i=jobs.length-1;i>=0;i--)if(jobs[i].finishDay<=day) {
   const job=jobs.splice(i,1)[0],n=byNode.get(job.nodeId)!;
   if(job.holding)continue;
   put(n.id,job.itemId,job.quantity);
   emit(n,job.kind==='plant'?'harvest':'complete',`${job.kind==='plant'?'收获':'加工完成'} ${job.quantity} 个${name(job.itemId)}。`,{itemId:job.itemId,quantity:job.quantity});
   if(job.kind==='plant'&&job.regrow>0) {
    if(day+job.regrow<=job.lastDay)jobs.push({...job,finishDay:day+job.regrow});
    else jobs.push({...job,finishDay:job.lastDay+1,holding:true});
   }
  }
  for(const n of nodes)if(n.kind==='inventory'&&!disabled.has(n.id)&&day===Math.max(n.startDay,plan.startDay))put(n.id,n.itemId!,n.quantity);
  protectDemands(false);
  for(const n of nodes.filter(n=>n.kind==='consume'))if(fixedOrRepeat(n)) {
   const count=available(n,n.itemId!);
   if(count<n.quantity){warn(n,`${name(n.itemId!)} 不足：需要 ${n.quantity}，可用 ${count}。`);continue;}
   take(n,n.itemId!,n.quantity);emit(n,'consume',`消耗 ${n.quantity} 个${name(n.itemId!)}。`,{itemId:n.itemId,quantity:n.quantity});
  }
  for(const n of nodes.filter(n=>n.kind==='sale'))if(fixedOrRepeat(n)) {
   const item=byEntity.get(n.itemId!)!,price=qualityPrice(item.sell_price,item.quality_eligible??false,plan.quality);
   if(!price||!finite(price.value)){warn(n,`${name(n.itemId!)} 缺少有效售价。`);continue;}
   const count=available(n,n.itemId!),quantity=n.quantity===0?count:Math.min(count,n.quantity);
   if(!quantity){if(n.quantity>0)warn(n,`${name(n.itemId!)} 无可售库存。`);continue;}
   const amount=price.value*quantity;
   if(!finite(amount)){warn(n,'销售金额超过可计算范围。');continue;}
   take(n,n.itemId!,quantity);emit(n,'sale',`出售 ${quantity} 个${name(n.itemId!)}，应收 ${amount}。`,{itemId:n.itemId,quantity,amount});
   if(plan.settlementDays===0){result.cash+=amount;result.income+=amount;emit(n,'receipt',`出货款到账 ${amount}。`,{itemId:n.itemId,quantity,amount});}
   else receipts.push({day:day+plan.settlementDays,nodeId:n.id,itemId:n.itemId!,quantity,amount});
  }
  for(const n of nodes.filter(n=>n.kind==='purchase'))if(fixedOrRepeat(n)&&purchase(n,n.itemId!,n.quantity))put(n.id,n.itemId!,n.quantity);
  // Purchases arrive after sales; protect their stock before any production consumes it.
  protectDemands(true);
  for(const n of nodes)if(active(n)&&n.quantity>0) {
   if(n.kind==='plant') {
    if(jobs.some(j=>j.nodeId===n.id)||!n.repeat&&(day!==n.startDay||started.has(n.id)||initialized.has(n.id)))continue;
    const crop=crops.get(n.id)!,lastDay=Math.ceil(day/28)*28;
    if(!crop.seasons.includes(seasonAt(day))||day+crop.growth>lastDay){warn(n,'当前日期无法在允许季节内完成首轮收获。');continue;}
    const resource=plan.plots.find(r=>r.id===n.resourceId)!;
    if(occupied(resource.id)+n.quantity>resource.capacity){warn(n,`土地容量不足：需要 ${n.quantity} 格，可用 ${resource.capacity-occupied(resource.id)} 格。`);continue;}
    // Alternative seed IDs represent equivalent seeds; consume connected stock in stable order.
    let missing=n.quantity;
    const uses=crop.seedIds.map(itemId=>{const quantity=Math.min(missing,available(n,itemId));missing-=quantity;return {itemId,quantity};});
    if(missing>0&&!n.autoBuy){warn(n,`种子不足，仍缺 ${missing} 个；可连接库存或开启自动补买。`);continue;}
    if(missing>0&&!purchase(n,crop.seedIds[0],missing))continue;
    for(const use of uses)take(n,use.itemId,use.quantity);
    jobs.push({nodeId:n.id,kind:'plant',resourceId:resource.id,finishDay:day+crop.growth,itemId:crop.itemId,quantity:n.quantity*crop.yield,slots:n.quantity,regrow:crop.regrow,lastDay});started.set(n.id,n.quantity);
    emit(n,'plant',`播种 ${n.quantity} 格，预计第 ${day+crop.growth} 日收获。`,{itemId:crop.seedIds[0],quantity:n.quantity});
   }
   if(n.kind==='process') {
    const remaining=n.repeat?n.quantity:n.quantity-(started.get(n.id)??0);
    if(remaining<=0)continue;
    const recipe=recipes.get(n.id)!,resource=plan.machines.find(r=>r.id===n.resourceId)!;
    let batches=Math.min(remaining,resource.count*resource.capacity-occupied(resource.id));
    if(batches<=0){warn(n,'机器容量已占满，等待空位。');continue;}
    for(const input of recipe.inputs)batches=Math.min(batches,Math.floor(available(n,input.itemId)/input.quantity));
    if(batches<=0){warn(n,`原料不足：${recipe.inputs.filter(a=>available(n,a.itemId)<a.quantity).map(a=>`${name(a.itemId)} 缺 ${a.quantity-available(n,a.itemId)}`).join('；')}。`);continue;}
    for(const input of recipe.inputs)take(n,input.itemId,input.quantity*batches);
    jobs.push({nodeId:n.id,kind:'process',resourceId:resource.id,finishDay:day+recipe.duration,itemId:recipe.itemId,quantity:recipe.yield*batches,slots:batches,regrow:0,lastDay:Infinity});started.set(n.id,(started.get(n.id)??0)+batches);
    emit(n,'process',`启动 ${batches} 批加工，预计第 ${day+recipe.duration} 日完成。`,{itemId:recipe.itemId,quantity:batches});
   }
  }
  result.pendingRevenue=receipts.reduce((sum,r)=>sum+r.amount,0);
  result.days.push({day,cash:result.cash,income:result.income-incomeBefore,spending:result.spending-spendingBefore,pendingRevenue:result.pendingRevenue,events:result.events.slice(eventStart),stock:stock()});
 }
 result.stock=stock();
 result.inProgress=jobs.filter(j=>!j.holding).map(({nodeId,finishDay,itemId,quantity})=>({nodeId,finishDay,itemId,quantity})).sort((a,b)=>a.finishDay-b.finishDay||(a.nodeId<b.nodeId?-1:1));
 return result;
}
