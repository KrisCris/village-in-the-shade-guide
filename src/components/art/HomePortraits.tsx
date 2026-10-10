import {useEffect,useRef,useState} from 'react';
import AnimatedPortrait from './AnimatedPortrait';
import {portraits} from './portraitCatalog';
import {I18nProvider,useI18n} from '../../i18n/react';
import type {Locale} from '../../i18n/locales';

export default function HomePortraits({locale}:{locale?:Locale}){
  return <I18nProvider locale={locale}><PortraitCarousel/></I18nProvider>;
}

function PortraitCarousel(){
  const {t,href}=useI18n();
  const root=useRef<HTMLDivElement>(null);
  const [index,setIndex]=useState(0),[ready,setReady]=useState(-1),[previous,setPrevious]=useState<number|null>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{const observer=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));observer.observe(root.current!);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(ready!==index||previous===null)return;const timer=setTimeout(()=>setPrevious(null),1200);return()=>clearTimeout(timer);},[ready,index,previous]);
  useEffect(()=>{if(!visible||ready!==index)return;const timer=setInterval(()=>{if(!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){setPrevious(index);setIndex((index+1)%portraits.length);}},10000);return()=>clearInterval(timer);},[visible,ready,index]);
  const step=(delta:number)=>{if(ready!==index)return;setPrevious(index);setIndex((index+delta+portraits.length)%portraits.length);};
  return <div ref={root} className="home-portraits">
    {[...new Set([previous,index].filter((n):n is number=>n!==null))].map(n=><div key={n} className="home-portrait-slide" style={{opacity:n===index?(ready===index?1:0):(ready===index?0:1)}} aria-hidden={n!==index}>
      <AnimatedPortrait portrait={portraits[n]} onReady={()=>{if(n===index)setReady(n);}} onError={()=>{if(n===index)setReady(n);}}/>
    </div>)}
    <div className="home-portrait-nav"><button onClick={()=>step(-1)} aria-label={t('上一位角色')}>‹</button><a href={href(`/data/characters/${portraits[index].id}/`)}>{t(portraits[index].name)} ↗</a><button onClick={()=>step(1)} aria-label={t('下一位角色')}>›</button></div>
  </div>;
}
