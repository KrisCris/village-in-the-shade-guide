import {useEffect,useRef,useState} from 'react';
import {MAP_HOME,clampMap,zoomMap,type MapView} from '../lib/mapViewport';
import '../styles/collection-map.css';
export type MapMarker={anchor:string;kind:string;label:string;shortLabel:string;x:number;y:number;px:number;py:number;detail:string;href:string;icon?:string;description?:string};
const kinds=[['book','图书','#ffe28a'],['shrine','神社','#db5034'],['treasure','玉手箱','#79b6ff'],['exchange','交换怪异','#bd91e8']];
export default function CollectionMap({markers,image}:{markers:MapMarker[];image:string}){
  const root=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
  const [view,setView]=useState<MapView>(MAP_HOME),[selected,setSelected]=useState<MapMarker|null>(null);
  const [enabled,setEnabled]=useState(kinds.map(k=>k[0])),[full,setFull]=useState(false),[fallback,setFallback]=useState(false);
  const bubble=useRef<HTMLDivElement>(null);
  const [bubblePosition,setBubblePosition]=useState({left:16,top:16});
  const [mapSize,setMapSize]=useState({width:900,height:650});
  useEffect(()=>{const el=svg.current!;const observer=new ResizeObserver(()=>setMapSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
  const unit=Math.max(view.width/mapSize.width,view.height/mapSize.height);
  useEffect(()=>{
    if(!selected||!svg.current||!bubble.current)return;
    const place=()=>{const el=svg.current!,box=bubble.current!;const rect=el.getBoundingClientRect();const point=new DOMPoint(selected.px,selected.py).matrixTransform(el.getScreenCTM()!);const x=point.x-rect.left,y=point.y-rect.top;setBubblePosition({left:Math.max(12,Math.min(rect.width-box.offsetWidth-12,x+18)),top:Math.max(12,Math.min(rect.height-box.offsetHeight-12,y-box.offsetHeight-18))});};
    const observer=new ResizeObserver(place);observer.observe(svg.current);observer.observe(bubble.current);place();return()=>observer.disconnect();
  },[selected,view,full,fallback]);
  const pointers=useRef(new Map<number,{x:number;y:number}>()),moved=useRef(false);
  const coordinates=(x:number,y:number)=>{const el=svg.current!;const p=new DOMPoint(x,y).matrixTransform(el.getScreenCTM()!.inverse());return p;};
  const zoom=(factor:number,x?:number,y?:number)=>setView(current=>{
    const p=x===undefined?null:coordinates(x,y!);
    return zoomMap(current,factor,p?(p.x-current.x)/current.width:.5,p?(p.y-current.y)/current.height:.5);
  });
  useEffect(()=>{const el=svg.current!;const wheel=(e:WheelEvent)=>{e.preventDefault();zoom(Math.exp(Math.max(-150,Math.min(150,e.deltaY))*.003),e.clientX,e.clientY);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
  useEffect(()=>{const sync=()=>setFull(document.fullscreenElement===root.current);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected(null);setFallback(false);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
  useEffect(()=>{if(!fallback)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[fallback]);
  const fullscreen=async()=>{if(fallback){setFallback(false);return;}try{if(full)await document.exitFullscreen();else if(root.current?.requestFullscreen)await root.current.requestFullscreen();else setFallback(true);}catch{setFallback(true);}};
  const toggle=(kind:string)=>{setEnabled(old=>old.includes(kind)?old.filter(k=>k!==kind):[...old,kind]);if(selected?.kind===kind)setSelected(null);};
  return <div ref={root} className={`collection-map-shell ${fallback?'map-fullscreen':''}`}>
    <div className="map-filters" aria-label="地图图层">{kinds.map(([kind,label,color])=><button key={kind} type="button" aria-pressed={enabled.includes(kind)} onClick={()=>toggle(kind)}><i style={{background:color}}/>{label}</button>)}</div>
    <div className="collection-map-stage">
      <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="收集地图，可拖拽和缩放" tabIndex={0}
        onKeyDown={e=>{if((e.target as Element).closest('[data-map-marker]'))return;const shift=view.width*.1;if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoom(.8);else if(e.key==='-')zoom(1.25);else if(e.key==='Home')setView(MAP_HOME);else if(e.key.startsWith('Arrow'))setView(v=>clampMap({...v,x:v.x+(e.key==='ArrowLeft'?-shift:e.key==='ArrowRight'?shift:0),y:v.y+(e.key==='ArrowUp'?-shift:e.key==='ArrowDown'?shift:0)}));}}
        onPointerDown={e=>{if(e.button!==0)return;if(!pointers.current.size)moved.current=false;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});}}
        onPointerMove={e=>{const old=pointers.current.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;if(!moved.current&&Math.hypot(dx,dy)<4)return;moved.current=true;svg.current?.setPointerCapture(e.pointerId);const other=[...pointers.current.entries()].find(([id])=>id!==e.pointerId)?.[1];if(other){const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(after>1)zoom(before/after,(e.clientX+other.x)/2,(e.clientY+other.y)/2);}else{const a=coordinates(old.x,old.y),b=coordinates(e.clientX,e.clientY);setView(v=>clampMap({...v,x:v.x+a.x-b.x,y:v.y+a.y-b.y}));}pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});}}
        onPointerUp={e=>pointers.current.delete(e.pointerId)} onPointerCancel={e=>pointers.current.delete(e.pointerId)} onLostPointerCapture={e=>pointers.current.delete(e.pointerId)} onPointerLeave={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))pointers.current.delete(e.pointerId);}}
        onClick={()=>{if(!moved.current)setSelected(null);}}>
        <image href={image} width="4096" height="4096"/>
        {markers.filter(m=>enabled.includes(m.kind)).map(m=><g key={m.anchor} data-map-marker={m.anchor} role="button" tabIndex={0} aria-label={m.label} aria-pressed={selected?.anchor===m.anchor} onClick={e=>{e.stopPropagation();if(!moved.current)setSelected(m);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(m);}}}>
          <circle cx={m.px} cy={m.py} r={14*unit} fill="transparent"/>
          <circle cx={m.px} cy={m.py} r={(m.kind==='book'?5:7)*unit} fill={kinds.find(k=>k[0]===m.kind)?.[2]} stroke={selected?.anchor===m.anchor?'#fff':'#282b21'} strokeWidth={1.5*unit}/>
          <text x={m.px+8*unit} y={m.py+4*unit} fontSize={11*unit} fontWeight="bold" fill="#22251d" stroke="#fff5d9" strokeWidth={2*unit} paintOrder="stroke">{m.shortLabel}</text>
        </g>)}
      </svg>
      <button className="map-fullscreen-toggle" type="button" onClick={fullscreen} aria-label={full||fallback?'退出地图全屏':'地图全屏'} title={full||fallback?'退出全屏':'全屏'}>{full||fallback?'↙':'⛶'}</button>
      <div className="map-zoom-bar" aria-label="地图缩放"><button type="button" aria-label="放大地图" disabled={view.width<=MAP_HOME.width/6} onClick={()=>zoom(.8)}>＋</button><span>{Math.round(MAP_HOME.width/view.width*100)}%</span><button type="button" aria-label="缩小地图" disabled={view.width>=MAP_HOME.width} onClick={()=>zoom(1.25)}>−</button><button type="button" aria-label="重置地图" onClick={()=>setView(MAP_HOME)}>↺</button></div>
      {selected&&<div ref={bubble} className="map-bubble" style={bubblePosition} role="dialog" aria-label={selected.label}>
        <button className="map-bubble-close" type="button" aria-label="关闭地点详情" onClick={()=>setSelected(null)}>×</button>
        <small>{kinds.find(k=>k[0]===selected.kind)?.[1]} · {selected.x}, {selected.y}</small>
        <h3>{selected.icon&&<img src={selected.icon} alt="" width="40" height="40"/>}{selected.label}</h3>{selected.description&&<p>{selected.description}</p>}<p>{selected.detail}</p>
        {selected.href&&<a href={selected.href}>查看完整资料 ↗</a>}
      </div>}
    </div>
    <p className="map-help">滚轮缩放 · 按住拖拽 · 点击标记查看详情 · 手机双指缩放</p>
  </div>;
}
