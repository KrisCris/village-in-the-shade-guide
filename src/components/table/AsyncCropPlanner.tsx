import {useEffect,useState} from 'react';
import type {Entity} from '../../data/types';
import CropPlanner from './CropPlanner';
import {I18nProvider,useI18n} from '../../i18n/react';
import type {Locale} from '../../i18n/locales';

export default function AsyncCropPlanner({locale}:{locale?:Locale}) {
  return <I18nProvider locale={locale}><PlannerLoader/></I18nProvider>;
}

function PlannerLoader() {
  const {t,data}=useI18n();
  const [entities,setEntities]=useState<Entity[]|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setError(false);
    fetch(data('/planner-data.json'),{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error(String(response.status));return response.json();})
      .then(setEntities).catch(error=>{if(error.name!=='AbortError')setError(true);});
    return ()=>controller.abort();
  },[attempt,data]);
  return entities?<CropPlanner entities={entities}/>:<div role="status" style={{minHeight:240}}>{error?<><p>{t('规划数据加载失败')}</p><button onClick={()=>setAttempt(attempt+1)}>{t('重试')}</button></>:t('正在加载种植与加工数据…')}</div>;
}
