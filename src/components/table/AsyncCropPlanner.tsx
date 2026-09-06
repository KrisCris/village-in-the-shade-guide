import {useEffect,useState} from 'react';
import type {Entity} from '../../data/types';
import {withBase} from '../../lib/sitePath';
import CropPlanner from './CropPlanner';

export default function AsyncCropPlanner() {
  const [entities,setEntities]=useState<Entity[]|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setError(false);
    fetch(withBase('/planner-data.json'),{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error(String(response.status));return response.json();})
      .then(setEntities).catch(error=>{if(error.name!=='AbortError')setError(true);});
    return ()=>controller.abort();
  },[attempt]);
  return entities?<CropPlanner entities={entities}/>:<div role="status" style={{minHeight:240}}>{error?<><p>规划数据加载失败</p><button onClick={()=>setAttempt(attempt+1)}>重试</button></>:'正在加载种植与加工数据…'}</div>;
}
