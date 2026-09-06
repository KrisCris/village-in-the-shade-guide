import {useEffect,useRef,useState,useId} from 'react';
import {withBase} from '../../lib/sitePath';
import SearchableSelect from '../controls/SearchableSelect';
import {portraitNotice,type PortraitDefinition} from './portraitCatalog';
import {defaultFace,poseOptions,type Model} from './portraitData';
import {portraitLabel} from './portraitLabels';
import './portraits.css';

export default function AnimatedPortrait({portrait,controls=false,onReady,onError}:{portrait:PortraitDefinition;controls?:boolean;onReady?:()=>void;onError?:()=>void}){
  const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const player=useRef<Awaited<ReturnType<typeof import('./portraitRenderer')['createPortraitRenderer']>>|null>(null);
  const notify=useRef(onReady);notify.current=onReady;
  const failed=useRef(onError);failed.current=onError;
  const [visible,setVisible]=useState(false),[model,setModel]=useState<Model|null>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const [entered,setEntered]=useState(false),[attempt,setAttempt]=useState(0);
  const [pose,setPose]=useState(controls?10:portrait.pose),[face,setFace]=useState(controls?1000:portrait.face);
  const current=useRef({pose,face,visible});current.current={pose,face,visible};
  const id=useId();
  useEffect(()=>{const observer=new IntersectionObserver(([entry])=>{setVisible(entry.isIntersecting);if(entry.isIntersecting)setEntered(true);});observer.observe(root.current!);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!entered)return;
    const abort=new AbortController();let disposed=false,raf=0,renderer:typeof player.current=null;
    const start=async()=>{
      try{
        const response=await fetch(withBase(`/art/portraits/${portrait.resource}.json`),{signal:abort.signal});if(!response.ok)throw new Error('立绘数据加载失败');
        const data:Model=await response.json();
        const images=new Map<number,HTMLImageElement>();
        await Promise.all([...new Set(data.keys.filter(k=>k.resource>=244).map(k=>k.resource))].map(async resource=>{
          const response=await fetch(withBase(`/art/portraits/tex-${resource}.webp`),{signal:abort.signal});if(!response.ok)throw new Error('立绘贴图加载失败');
          const url=URL.createObjectURL(await response.blob());
          try{const im=new Image();im.src=url;await im.decode();images.set(resource,im);}
          finally{URL.revokeObjectURL(url);}
        }));
        const {createPortraitRenderer}=await import('./portraitRenderer');if(disposed)return;
        renderer=createPortraitRenderer(canvas.current!,data,images);player.current=renderer;
        const c=current.current;renderer.fit(c.pose,c.face);renderer.draw(c.pose,c.face,0);setModel(data);setLoaded(true);notify.current?.();
        let previous=0,time=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
        const tick=(now:number)=>{if(disposed)return;const c=current.current;
          if(c.visible&&!document.hidden&&!reduced.matches){time+=previous?Math.min(now-previous,100)*.06:0;renderer!.draw(c.pose,c.face,time);}
          previous=now;raf=requestAnimationFrame(tick);
        };raf=requestAnimationFrame(tick);
      }catch(e){if(!disposed&&!(e instanceof DOMException&&e.name==='AbortError')){setError(e instanceof Error?e.message:'立绘加载失败');failed.current?.();}}
    };void start();
    return()=>{disposed=true;abort.abort();cancelAnimationFrame(raf);renderer?.dispose();player.current=null;};
  },[entered,portrait.resource,attempt]);
  useEffect(()=>{if(player.current){player.current.fit(pose,face);player.current.draw(pose,face,0);}},[pose,face]);
  return <div ref={root} className={`animated-portrait ${controls?'with-controls':''}`}>
    <canvas ref={canvas} width="720" height="960" role="img" aria-label={`${portrait.name}动态立绘`} style={{opacity:loaded?1:0}}/>
    {!loaded&&<span className="portrait-status" role="status">{error||'立绘加载中…'}{error&&<button type="button" onClick={()=>{setError('');setAttempt(n=>n+1);}}>重试</button>}</span>}
    {controls&&<div className="portrait-options">
      <label htmlFor={`${id}-pose`}>姿势<SearchableSelect id={`${id}-pose`} value={pose} onChange={e=>{const p=Number(e.target.value);setPose(p);if(model)setFace(defaultFace(model,p));}}>{(model?poseOptions(model):[10]).map(p=><option key={p} value={p}>{p}{model?.options.poses[p]?.label?` · ${portraitLabel(model.options.poses[p].label)}`:''}</option>)}</SearchableSelect></label>
      <label htmlFor={`${id}-face`}>表情<SearchableSelect id={`${id}-face`} value={face} onChange={e=>setFace(Number(e.target.value))}>{(model?model.animations.map(a=>a[0]&65535).filter(n=>n>=1000):[1000]).map(f=><option key={f} value={f}>{f}{model?.options.faces[f]?.name?` · ${portraitLabel(model.options.faces[f].name)}`:''}</option>)}</SearchableSelect></label>
      <small>{portraitNotice}</small>
    </div>}
  </div>;
}
