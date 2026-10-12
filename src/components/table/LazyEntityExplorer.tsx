import {useEffect,useState,type ComponentProps} from 'react';
import EntityExplorer from './EntityExplorer';
import {I18nProvider,useI18n} from '../../i18n/react';
import type {Locale} from '../../i18n/locales';

/** `source` is a site path (e.g. /list-data/kind-crops.json); it is fetched in the page language. */
export default function LazyEntityExplorer({source,locale}:{source:string;locale?:Locale}) {
  return <I18nProvider locale={locale}><ExplorerLoader source={source}/></I18nProvider>;
}

function ExplorerLoader({source}:{source:string}) {
  const {t,href}=useI18n();
  const [data,setData]=useState<ComponentProps<typeof EntityExplorer>|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setFailed(false);setData(null);
    fetch(href(source),{signal:controller.signal}).then(response=>{
      if(!response.ok)throw new Error(String(response.status));
      return response.json();
    }).then(setData).catch(error=>{if(error.name!=='AbortError')setFailed(true);});
    return ()=>controller.abort();
  },[source,attempt,href]);
  return data?<EntityExplorer {...data}/>:<div role="status" style={{minHeight:240}}>{failed?<><p>{t('列表数据加载失败')}</p><button onClick={()=>setAttempt(attempt+1)}>{t('重试')}</button></>:t('正在加载列表…')}</div>;
}
