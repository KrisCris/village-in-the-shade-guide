import { withBase } from '../../lib/sitePath';
import {useEffect,useState} from 'react';
import type {Entity} from '../../data/types';
import EntityExplorer from './EntityExplorer';

let pending:Promise<Entity[]>|undefined;
function loadRows() {
 return pending??=fetch(withBase('/item-list.json')).then(response=>{
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<Entity[]>;
 }).catch(error=>{pending=undefined;throw error;});
}
export default function ItemExplorer({itemCategoryOptions}:{itemCategoryOptions:Array<{id:string;name:string}>}) {
 const [rows,setRows]=useState<Entity[]|null>(null);
 const [failed,setFailed]=useState(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;
  setFailed(false);
  loadRows().then(data=>{if(active)setRows(data);}).catch(()=>{if(active)setFailed(true);});
  return ()=>{active=false;};
 },[attempt]);
 if(!rows)return <div role="status" aria-live="polite" style={{minHeight:240,padding:'1rem'}}>{failed?<>列表读取失败。<button onClick={()=>setAttempt(n=>n+1)}>重试</button></>:'正在加载物品列表…'}</div>;
 return <EntityExplorer rows={rows} kind="items" itemCategoryOptions={itemCategoryOptions}/>;
}
