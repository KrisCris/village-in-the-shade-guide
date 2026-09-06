import {useEffect,useState,type ComponentProps} from 'react';
import {withBase} from '../../lib/sitePath';
import EntityExplorer from './EntityExplorer';

export default function LazyEntityExplorer({source}:{source:string}) {
  const [data,setData]=useState<ComponentProps<typeof EntityExplorer>|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setFailed(false);setData(null);
    fetch(withBase(source),{signal:controller.signal}).then(response=>{
      if(!response.ok)throw new Error(String(response.status));
      return response.json();
    }).then(setData).catch(error=>{if(error.name!=='AbortError')setFailed(true);});
    return ()=>controller.abort();
  },[source,attempt]);
  return data?<EntityExplorer {...data}/>:<div role="status" style={{minHeight:240}}>{failed?<><p>列表数据加载失败</p><button onClick={()=>setAttempt(attempt+1)}>重试</button></>:'正在加载列表…'}</div>;
}
