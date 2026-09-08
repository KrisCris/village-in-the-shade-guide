import type {Entity} from '../../data/types';
import type {WorkflowNode,WorkflowEdge} from './types';

export function outputItems(node:WorkflowNode,entities:Entity[]):string[] {
 if(node.kind==='inventory'||node.kind==='purchase')return node.itemId?[node.itemId]:[];
 if(node.kind==='plant')return stringArray(entities.find(e=>e.id===node.cropId)?.harvest_item_ids);
 if(node.kind==='process') {
  const output=entities.find(e=>e.id===node.recipeId)?.output as {item_id?:unknown}|undefined;
  return typeof output?.item_id==='string'?[output.item_id]:[];
 }
 return [];
}
export function inputItems(node:WorkflowNode,entities:Entity[]):string[] {
 if(node.kind==='plant')return stringArray(entities.find(e=>e.id===node.cropId)?.seed_item_ids);
 if(node.kind==='process') {
  const inputs=entities.find(e=>e.id===node.recipeId)?.inputs;
  return Array.isArray(inputs)?inputs.map(i=>i?.item_id).filter((id):id is string=>typeof id==='string'):[];
 }
 if(node.kind==='reserve'||node.kind==='delivery')return (node.requirements??[]).map(a=>a.itemId);
 if(node.kind==='sale'||node.kind==='consume')return node.itemId?[node.itemId]:[];
 return [];
}
export function stringArray(value:unknown):string[] {return Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[];}
export function hasCycle(nodes:WorkflowNode[],edges:WorkflowEdge[]):boolean {
 const outgoing=new Map(nodes.map(n=>[n.id,[] as string[]]));
 const indegree=new Map(nodes.map(n=>[n.id,0]));
 for(const e of edges) {
  if(!outgoing.has(e.source)||!outgoing.has(e.target))return true;
  outgoing.get(e.source)!.push(e.target);indegree.set(e.target,indegree.get(e.target)!+1);
 }
 const ready=nodes.filter(n=>indegree.get(n.id)===0).map(n=>n.id);
 for(let i=0;i<ready.length;i++)for(const next of outgoing.get(ready[i])!) {
  indegree.set(next,indegree.get(next)!-1);if(indegree.get(next)===0)ready.push(next);
 }
 return ready.length!==nodes.length;
}
export function canConnect(nodes:WorkflowNode[],edges:WorkflowEdge[],source:string,target:string,entities:Entity[]):boolean {
 if(source===target||edges.some(e=>e.source===source&&e.target===target))return false;
 const from=nodes.find(n=>n.id===source),to=nodes.find(n=>n.id===target);
 if(!from||!to||!outputItems(from,entities).some(id=>inputItems(to,entities).includes(id)))return false;
 return !hasCycle(nodes,[...edges,{id:'candidate',source,target}]);
}
