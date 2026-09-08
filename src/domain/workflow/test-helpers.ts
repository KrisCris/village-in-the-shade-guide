import type {Entity} from '../../data/types';
import type {WorkflowNode,WorkflowPlan} from './types';
export const entity = (id:string,kind:string,fields:Record<string,unknown>={}):Entity => ({id,kind,name:{zh_hans:id,zh_hant:id,ja:id,internal:id,aliases:[],review_status:'verified'},searchText:id,...fields});
export const entities:Entity[] = [
  entity('seed','items',{buy_price:10}),entity('crop-item','items',{sell_price:20,quality_eligible:true}),
  entity('pork','items',{sell_price:30}),entity('salt','items',{buy_price:3}),entity('bacon','items',{sell_price:80}),
  entity('crop','crops',{seed_item_ids:['seed'],harvest_item_ids:['crop-item'],growth_days:3,regrow_days:null,harvest_quantity:5,seasons:['spring','summer']}),
  entity('offer','store-offers',{item_id:'seed',seasons:['spring','summer'],required_flags:[]}),
  entity('salt-offer','store-offers',{item_id:'salt',seasons:[],required_flags:[]}),
  entity('machine','machines'),entity('recipe','processes',{inputs:[{item_id:'pork',quantity:1},{item_id:'salt',quantity:1}],output:{item_id:'bacon',quantity:2},machine_ids:['machine'],duration_minutes:1440}),
];
export const node = (id:string,kind:WorkflowNode['kind'],fields:Partial<WorkflowNode>={}):WorkflowNode => ({id,kind,label:id,position:{x:0,y:0},quantity:1,startDay:5,repeat:false,autoBuy:false,priority:0,...fields});
export const plan = (nodes:WorkflowNode[],pairs:string[][]=[],fields:Partial<WorkflowPlan>={}):WorkflowPlan => ({version:1,name:'test',startDay:5,days:10,initialCash:100,quality:'normal',settlementDays:1,plots:[{id:'plot',label:'田',capacity:1}],machines:[{id:'machine-resource',label:'机器',machineId:'machine',count:1,capacity:1}],nodes,edges:pairs.map(([source,target],i)=>({id:String(i),source,target})),...fields});
