import {useEffect,useMemo,useRef,useState} from 'react';
import {MAP_HOME,clampMap,focusMap,zoomMap,type MapView} from '../lib/mapViewport';
import {COLLECTED_KEY,parseCollected,type MapArea,type MapKind} from '../data/collectionMap';
import {normalizeSearch} from '../data/clientSearch';
import '../styles/collection-map.css';
import {msg} from '../i18n/translate';
import {I18nProvider,useI18n} from '../i18n/react';
import type {Locale} from '../i18n/locales';

export type MapMarker={
  id:string;kind:MapKind;area:MapArea;
  /** Full name for the list and details; `short` is the label drawn on the map. */
  label:string;short:string;
  /** Area name for markers outside the village map. */
  place:string;
  /** Index into the shared `details` texts; most markers of a kind share one. */
  note:string;detail:number;href:string;icon?:string;search:string;
  px?:number;py?:number;
};
type Shape='circle'|'square'|'diamond';
type KindStyle={kind:MapKind;label:string;color:string;shape:Shape;track?:boolean};
export const MAP_KINDS:KindStyle[]=[
  {kind:'book',label:msg('遗失图书'),color:'#ffd75e',shape:'circle',track:true},
  {kind:'machine_part',label:msg('机械部件'),color:'#4fd6c4',shape:'circle',track:true},
  {kind:'ghost_rat',label:msg('幽灵老鼠'),color:'#ff9ccc',shape:'circle',track:true},
  {kind:'red_phone',label:msg('鲜红的手机'),color:'#ff5a4f',shape:'circle'},
  {kind:'treasure',label:msg('玉手箱'),color:'#79b6ff',shape:'circle'},
  {kind:'turn_in',label:msg('交付地点'),color:'#fff6dc',shape:'square'},
  {kind:'shrine',label:msg('狐狸神社'),color:'#f08a3c',shape:'diamond'},
  {kind:'exchange',label:msg('交换怪异'),color:'#bd91e8',shape:'diamond'},
];
const style=(kind:MapKind)=>MAP_KINDS.find(k=>k.kind===kind)!;
type Props={markers:MapMarker[];details:string[];image:string};
export default function CollectionMap({locale,...props}:Props&{locale?:Locale}){
  return <I18nProvider locale={locale}><MapView {...props}/></I18nProvider>;
}

function Mark({m,unit,selected,done}:{m:MapMarker;unit:number;selected:boolean;done:boolean}){
  const k=style(m.kind),r=(selected?9:m.kind==='book'?5.5:6.5)*unit,x=m.px!,y=m.py!;
  const paint={fill:k.color,stroke:selected?'#fff':'#262a20',strokeWidth:(selected?2.5:1.5)*unit,opacity:done&&!selected?.4:1};
  if(k.shape==='square')return <rect x={x-r} y={y-r} width={r*2} height={r*2} rx={1.5*unit} {...paint}/>;
  if(k.shape==='diamond')return <path d={`M${x} ${y-r*1.3}L${x+r*1.3} ${y}L${x} ${y+r*1.3}L${x-r*1.3} ${y}Z`} {...paint}/>;
  return <circle cx={x} cy={y} r={r} {...paint}/>;
}

function MapView({markers,details,image}:Props){
  const {t}=useI18n();
  const root=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),bubble=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null);
  const [view,setView]=useState<MapView>(MAP_HOME),[selectedId,setSelectedId]=useState<string|null>(null);
  const [enabled,setEnabled]=useState<MapKind[]>(MAP_KINDS.map(k=>k.kind)),[query,setQuery]=useState('');
  const [collected,setCollected]=useState<Set<string>>(()=>new Set()),[hideDone,setHideDone]=useState(false),[confirmReset,setConfirmReset]=useState(false);
  const [openGroups,setOpenGroups]=useState<Set<MapKind>>(()=>new Set(MAP_KINDS.map(k=>k.kind)));
  const [full,setFull]=useState(false),[fallback,setFallback]=useState(false);
  const [bubblePosition,setBubblePosition]=useState({left:16,top:16});
  const [mapSize,setMapSize]=useState({width:900,height:650});
  const byId=useMemo(()=>new Map(markers.map(m=>[m.id,m])),[markers]);
  const selected=selectedId?byId.get(selectedId)??null:null;
  const unit=Math.max(view.width/mapSize.width,view.height/mapSize.height);
  const zoomLevel=MAP_HOME.width/view.width;

  // Checklist lives in this browser only.
  useEffect(()=>{try{setCollected(parseCollected(localStorage.getItem(COLLECTED_KEY),new Set(byId.keys())));}catch{/* storage blocked */}},[byId]);
  const saveCollected=(next:Set<string>)=>{setCollected(next);try{localStorage.setItem(COLLECTED_KEY,JSON.stringify([...next]));}catch{/* keeps working for this visit */}};
  const toggleCollected=(id:string)=>{const next=new Set(collected);if(next.has(id))next.delete(id);else next.add(id);saveCollected(next);};
  useEffect(()=>{if(!confirmReset)return;const timer=setTimeout(()=>setConfirmReset(false),4000);return()=>clearTimeout(timer);},[confirmReset]);

  const select=(m:MapMarker|null,{focus=true,hash=true}={})=>{
    setSelectedId(m?.id??null);
    if(m&&focus&&m.px!==undefined)setView(v=>focusMap(v,m.px!,m.py!));
    if(hash)try{history.replaceState(null,'',m?`#${m.id}`:location.pathname+location.search);}catch{/* hash is optional */}
  };
  // Entity pages link here with #anchor; open that marker.
  useEffect(()=>{
    const open=()=>{const m=byId.get(decodeURIComponent(location.hash.slice(1)));if(!m)return;setEnabled(old=>old.includes(m.kind)?old:[...old,m.kind]);setOpenGroups(old=>new Set(old).add(m.kind));select(m,{hash:false});root.current?.scrollIntoView({block:'start'});};
    open();window.addEventListener('hashchange',open);return()=>window.removeEventListener('hashchange',open);
  },[byId]);

  // Keep the selected row visible inside the list without scrolling the page.
  useEffect(()=>{
    const box=list.current,row=selectedId?box?.querySelector<HTMLElement>(`li[id="${CSS.escape(selectedId)}"]`):null;
    if(!box||!row)return;
    const top=row.offsetTop,bottom=top+row.offsetHeight;
    if(top<box.scrollTop+40||bottom>box.scrollTop+box.clientHeight)box.scrollTo({top:top-box.clientHeight/3,behavior:'smooth'});
  },[selectedId,full,fallback]);
  useEffect(()=>{const el=svg.current!;const observer=new ResizeObserver(()=>setMapSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!selected||!svg.current||!bubble.current)return;
    const place=()=>{
      const el=svg.current!,box=bubble.current!;const rect=el.getBoundingClientRect();
      if(selected.px===undefined){setBubblePosition({left:12,top:12});return;}
      const point=new DOMPoint(selected.px,selected.py).matrixTransform(el.getScreenCTM()!);const x=point.x-rect.left,y=point.y-rect.top;
      const above=y-box.offsetHeight-18,top=above>=12?above:y+22;
      setBubblePosition({left:Math.max(12,Math.min(rect.width-box.offsetWidth-68,x-box.offsetWidth/2)),top:Math.max(12,Math.min(rect.height-box.offsetHeight-12,top))});
    };
    const observer=new ResizeObserver(place);observer.observe(svg.current);observer.observe(bubble.current);place();return()=>observer.disconnect();
  },[selected,view,full,fallback]);

  const pointers=useRef(new Map<number,{x:number;y:number}>()),moved=useRef(false);
  const coordinates=(x:number,y:number)=>new DOMPoint(x,y).matrixTransform(svg.current!.getScreenCTM()!.inverse());
  const zoom=(factor:number,x?:number,y?:number)=>setView(current=>{
    const p=x===undefined?null:coordinates(x,y!);
    return zoomMap(current,factor,p?(p.x-current.x)/current.width:.5,p?(p.y-current.y)/current.height:.5);
  });
  useEffect(()=>{const el=svg.current!;const wheel=(e:WheelEvent)=>{e.preventDefault();zoom(Math.exp(Math.max(-150,Math.min(150,e.deltaY))*.003),e.clientX,e.clientY);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
  useEffect(()=>{const sync=()=>setFull(document.fullscreenElement===root.current);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){select(null);setFallback(false);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
  useEffect(()=>{if(!fallback)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[fallback]);
  const fullscreen=async()=>{if(fallback){setFallback(false);return;}try{if(full)await document.exitFullscreen();else if(root.current?.requestFullscreen)await root.current.requestFullscreen();else setFallback(true);}catch{setFallback(true);}};
  const toggleKind=(kind:MapKind)=>{setEnabled(old=>old.includes(kind)?old.filter(k=>k!==kind):[...old,kind]);if(selected?.kind===kind)select(null);};

  const visible=(m:MapMarker)=>enabled.includes(m.kind)&&!(hideDone&&collected.has(m.id)&&m.id!==selectedId);
  const needle=normalizeSearch(query);
  const groups=MAP_KINDS.filter(k=>enabled.includes(k.kind)).map(k=>{
    const all=markers.filter(m=>m.kind===k.kind);
    return {...k,all,rows:all.filter(m=>visible(m)&&(!needle||m.search.includes(needle))),done:all.filter(m=>collected.has(m.id)).length};
  }).filter(g=>!needle||g.rows.length);
  const onMap=markers.filter(m=>m.px!==undefined&&visible(m));
  const markerLabel=(m:MapMarker)=>t(style(m.kind).label);

  return <div ref={root} className={`collection-map-shell ${fallback?'map-fullscreen':''}`}>
    <div className="map-toolbar">
      <div className="map-filters" role="group" aria-label={t('显示哪些标记')}>
        {MAP_KINDS.map(k=>{const count=markers.filter(m=>m.kind===k.kind).length;return <button key={k.kind} type="button" aria-pressed={enabled.includes(k.kind)} onClick={()=>toggleKind(k.kind)}><i className={`map-swatch ${k.shape}`} style={{background:k.color}}/>{t(k.label)}<span>{count}</span></button>;})}
      </div>
      <button className="map-hide-done" type="button" aria-pressed={hideDone} onClick={()=>setHideDone(v=>!v)}>{t('隐藏已收集')}</button>
    </div>
    <div className="map-body">
      <div ref={stage} className="collection-map-stage">
        <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="application" aria-label={t('村庄地图：拖动平移，滚轮或双指缩放，方向键平移，加减号缩放')} tabIndex={0}
          onKeyDown={e=>{if((e.target as Element).closest('[data-map-marker]'))return;const shift=view.width*.1;if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoom(.8);else if(e.key==='-')zoom(1.25);else if(e.key==='Home')setView(MAP_HOME);else if(e.key.startsWith('Arrow'))setView(v=>clampMap({...v,x:v.x+(e.key==='ArrowLeft'?-shift:e.key==='ArrowRight'?shift:0),y:v.y+(e.key==='ArrowUp'?-shift:e.key==='ArrowDown'?shift:0)}));}}
          onPointerDown={e=>{if(e.button!==0)return;if(!pointers.current.size)moved.current=false;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});}}
          onPointerMove={e=>{const old=pointers.current.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;if(!moved.current&&Math.hypot(dx,dy)<4)return;moved.current=true;svg.current?.setPointerCapture(e.pointerId);const other=[...pointers.current.entries()].find(([id])=>id!==e.pointerId)?.[1];if(other){const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(after>1)zoom(before/after,(e.clientX+other.x)/2,(e.clientY+other.y)/2);}else{const a=coordinates(old.x,old.y),b=coordinates(e.clientX,e.clientY);setView(v=>clampMap({...v,x:v.x+a.x-b.x,y:v.y+a.y-b.y}));}pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});}}
          onPointerUp={e=>pointers.current.delete(e.pointerId)} onPointerCancel={e=>pointers.current.delete(e.pointerId)} onLostPointerCapture={e=>pointers.current.delete(e.pointerId)} onPointerLeave={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))pointers.current.delete(e.pointerId);}}
          onClick={()=>{if(!moved.current)select(null);}}>
          <image href={image} width="4096" height="4096"/>
          {onMap.map(m=>{const isSelected=m.id===selectedId;return <g key={m.id} data-map-marker={m.id} className={`map-marker kind-${m.kind}`} role="button" tabIndex={0} aria-label={`${markerLabel(m)} · ${m.label}`} aria-pressed={isSelected} onClick={e=>{e.stopPropagation();if(!moved.current)select(m,{focus:false});}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(m,{focus:false});}}}>
            <circle cx={m.px} cy={m.py} r={14*unit} fill="transparent"/>
            <Mark m={m} unit={unit} selected={isSelected} done={collected.has(m.id)}/>
            {(zoomLevel>=2||isSelected)&&<text x={m.px!+10*unit} y={m.py!+4*unit} fontSize={11*unit} fontWeight="bold" fill="#22251d" stroke="#fff5d9" strokeWidth={2.5*unit} paintOrder="stroke">{m.short}</text>}
          </g>;})}
        </svg>
        <button className="map-fullscreen-toggle" type="button" onClick={fullscreen} aria-label={full||fallback?t('退出地图全屏'):t('地图全屏')} title={full||fallback?t('退出全屏'):t('全屏')}>{full||fallback?'↙':'⛶'}</button>
        <div className="map-zoom-bar" role="group" aria-label={t('地图缩放')}><button type="button" aria-label={t('放大地图')} disabled={view.width<=MAP_HOME.width/6} onClick={()=>zoom(.8)}>＋</button><span>{Math.round(zoomLevel*100)}%</span><button type="button" aria-label={t('缩小地图')} disabled={view.width>=MAP_HOME.width} onClick={()=>zoom(1.25)}>−</button><button type="button" aria-label={t('重置地图')} onClick={()=>setView(MAP_HOME)}>↺</button></div>
        {zoomLevel<2&&<p className="map-zoom-hint">{t('放大到 200% 显示编号')}</p>}
        {selected&&<div ref={bubble} className="map-bubble" style={bubblePosition} role="dialog" aria-label={selected.label}>
          <button className="map-bubble-close" type="button" aria-label={t('关闭地点详情')} onClick={()=>select(null)}>×</button>
          <small><i className={`map-swatch ${style(selected.kind).shape}`} style={{background:style(selected.kind).color}}/>{markerLabel(selected)}{selected.place&&` · ${selected.place}`}</small>
          <h3>{selected.icon&&<img src={selected.icon} alt="" width="36" height="36"/>}{selected.label}</h3>
          {selected.note&&<p className="map-bubble-note">{selected.note}</p>}
          <p>{details[selected.detail]}</p>
          {selected.place&&<p className="map-bubble-note">{t('这个地点不在村庄地图上，没有标记。')}</p>}
          <div className="map-bubble-actions">
            {style(selected.kind).track&&<button type="button" aria-pressed={collected.has(selected.id)} onClick={()=>toggleCollected(selected.id)}>{collected.has(selected.id)?`✓ ${t('已收集')}`:t('标记为已收集')}</button>}
            {selected.href&&<a href={selected.href}>{t('查看资料')} ↗</a>}
          </div>
        </div>}
      </div>
      <div className="map-panel">
        <input className="map-search" type="search" aria-label={t('搜索地图标记')} placeholder={t('搜索书名、编号或拼音')} value={query} onChange={e=>setQuery(e.target.value)}/>
        <div ref={list} className="map-list">
          {groups.map(g=><details key={g.kind} className="map-group" open={!!needle||openGroups.has(g.kind)} onToggle={e=>{const open=e.currentTarget.open;if(needle)return;setOpenGroups(old=>{const next=new Set(old);if(open)next.add(g.kind);else next.delete(g.kind);return next;});}}>
            <summary><i className={`map-swatch ${g.shape}`} style={{background:g.color}}/>{t(g.label)}<span>{g.track?t('已收集 {done}/{total}',{done:g.done,total:g.all.length}):g.all.length}</span></summary>
            <ul>{g.rows.map(m=><li key={m.id} id={m.id} className={m.id===selectedId?'is-selected':''}>
              {g.track&&<input type="checkbox" aria-label={t('已收集：{name}',{name:m.label})} checked={collected.has(m.id)} onChange={()=>toggleCollected(m.id)}/>}
              <button type="button" aria-current={m.id===selectedId||undefined} onClick={()=>{select(m);if(m.px!==undefined)stage.current?.scrollIntoView({block:'nearest',behavior:'smooth'});}}>
                <span className={collected.has(m.id)?'is-done':''}>{m.label}</span>
                {(m.note||m.place)&&<small>{[m.place,m.note].filter(Boolean).join(' · ')}</small>}
              </button>
            </li>)}</ul>
            {!g.rows.length&&<p className="map-list-empty">{t('已全部隐藏')}</p>}
          </details>)}
          {!groups.length&&<p className="map-list-empty">{needle?t('没有匹配的标记'):t('请先在上方选择要显示的标记')}</p>}
        </div>
        <button className="map-reset" type="button" disabled={!collected.size} onClick={()=>{if(confirmReset){saveCollected(new Set());setConfirmReset(false);}else setConfirmReset(true);}}>{confirmReset?t('再点一次，清除全部勾选'):t('清除勾选（{count}）',{count:collected.size})}</button>
      </div>
    </div>
    <p className="map-help">{t('勾选只保存在当前浏览器。拖动平移，滚轮或双指缩放，点标记看详情。')}</p>
  </div>;
}
