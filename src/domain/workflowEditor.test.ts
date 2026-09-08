import {expect,it} from 'vitest';
import {createPlan,createDemandNodes,copySelection,parsePlan} from './workflowEditor';
import type {Entity} from '../data/types';
it('copies only internal edges and gives every copy a fresh id',()=>{
 const p=createPlan([]);p.nodes=[{id:'a',kind:'inventory',label:'a',quantity:1,startDay:1,repeat:false,autoBuy:false,priority:10,position:{x:0,y:0}},{id:'b',kind:'sale',label:'b',quantity:0,startDay:1,repeat:true,autoBuy:false,priority:10,position:{x:200,y:0}},{id:'c',kind:'sale',label:'c',quantity:0,startDay:1,repeat:true,autoBuy:false,priority:10,position:{x:400,y:0}}];p.edges=[{id:'ab',source:'a',target:'b'},{id:'bc',source:'b',target:'c'}];
 const copied=copySelection(p,['a','b']);expect(copied.nodes).toHaveLength(2);expect(copied.edges).toHaveLength(1);expect(copied.nodes.every(n=>!['a','b'].includes(n.id))).toBe(true);expect(copied.edges[0].source).toBe(copied.nodes[0].id);expect(copied.edges[0].target).toBe(copied.nodes[1].id);expect(copied.nodes[0].position.x).toBe(40);
});
it('generates grouped seasonal reserves without inventing deadlines or restoring deleted nodes on calculation',()=>{
 const entities=[{id:'BUNDLE_ID_SPRING_A',kind:'activities',name:{zh_hans:'春季供奉'},inputs:[{item_id:'a',quantity:3},{item_id:'b',quantity:2}]},{id:'BUNDLE_ID_SUMMER_A',kind:'activities',name:{zh_hans:'夏季供奉'},inputs:[{item_id:'c',quantity:1}]}] as unknown as Entity[];
 const n=createDemandNodes(entities,1);expect(n).toHaveLength(1);expect(n[0].requirements).toEqual([{itemId:'a',quantity:3},{itemId:'b',quantity:2}]);expect(n[0].dueDay).toBeUndefined();expect(createDemandNodes(entities,1,[n[0].sourceId!])).toEqual([]);
 const p=createPlan(entities);p.nodes=[];expect(parsePlan(JSON.stringify(p)).nodes).toEqual([]);
});
it('rejects invalid imports, duplicate ids, oversized counts and dangling edges',()=>{
 const p=createPlan([]);expect(parsePlan(JSON.stringify(p)).version).toBe(1);
 expect(()=>parsePlan(JSON.stringify({...p,days:100000}))).toThrow();expect(()=>parsePlan(JSON.stringify({...p,initialCash:-1}))).toThrow();expect(()=>parsePlan(JSON.stringify({...p,edges:[{id:'bad',source:'missing',target:'missing2'}]}))).toThrow();expect(()=>parsePlan('{')).toThrow();
});
