import {useEffect,useId,useRef,useState} from 'react';
import SearchableSelect from './controls/SearchableSelect';
import {I18nProvider,useI18n} from '../i18n/react';
import type {Locale} from '../i18n/locales';
import type {ExplorerData,ExplorerFloor,ExplorerLayout} from '../data/quarry';
import '../styles/quarry-explorer.css';

/** `source` is a site path fetched in the page language (src/pages/list-data/quarry-floors.json.ts). */
export default function QuarryFloorExplorer({source,locale}:{source:string;locale?:Locale}){
  return <I18nProvider locale={locale}><Loader source={source}/></I18nProvider>;
}

function Loader({source}:{source:string}){
  const {t,href}=useI18n();
  const [data,setData]=useState<ExplorerData|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setFailed(false);
    fetch(href(source),{signal:controller.signal}).then(response=>{
      if(!response.ok)throw new Error(String(response.status));
      return response.json();
    }).then(setData).catch(error=>{if(error.name!=='AbortError')setFailed(true);});
    return ()=>controller.abort();
  },[source,attempt,href]);
  if(data)return <Explorer data={data}/>;
  return <div className="qx qx-loading" role="status">{failed?<><p>{t('楼层数据加载失败')}</p><button type="button" className="qx-button" onClick={()=>setAttempt(attempt+1)}>{t('重试')}</button></>:t('正在加载楼层数据…')}</div>;
}

const percent=(value:number)=>value>=.1?`${Math.round(value*100)}%`:value>=.01?`${(value*100).toFixed(1)}%`:`${(value*100).toFixed(2)}%`;
const count=(value:number)=>Number.isInteger(value)?String(value):value.toFixed(1);
/** The dropdown also searches option values, so listing every floor lets "75" find "Floors 71–79". */
const floorsIn=(f:ExplorerFloor)=>Array.from({length:f.to-f.from+1},(_,i)=>f.from+i).join(' ');

function Explorer({data}:{data:ExplorerData}){
  const {t}=useI18n();
  const [index,setIndex]=useState(0);
  const floor=data.floors[index];
  const last=data.floors.length-1;
  const kindLabel=(f:ExplorerFloor)=>f.kind==='rest'?t('休息层'):f.kind==='bottom'?t('最底层'):t('普通楼层');
  const floorLabel=(f:ExplorerFloor)=>f.from===f.to?t('第 {floor} 层',{floor:f.from}):t('第 {from}–{to} 层',{from:f.from,to:f.to});
  return <div className="qx">
    <div className="qx-picker" role="group" aria-label={t('选择楼层')}>
      <button type="button" className="qx-button qx-step" onClick={()=>setIndex(i=>Math.max(0,i-1))} disabled={index===0} aria-label={t('上一层')}>‹</button>
      <div className="qx-select">
        <SearchableSelect value={floorsIn(floor)} aria-label={t('楼层')} onChange={event=>setIndex(data.floors.findIndex(f=>floorsIn(f)===event.target.value))}>
          {data.floors.map(f=><option key={f.from} value={floorsIn(f)}>{f.kind==='normal'?floorLabel(f):`${floorLabel(f)} · ${kindLabel(f)}`}</option>)}
        </SearchableSelect>
      </div>
      <button type="button" className="qx-button qx-step" onClick={()=>setIndex(i=>Math.min(last,i+1))} disabled={index===last} aria-label={t('下一层')}>›</button>
    </div>
    <FloorView key={floor.from} data={data} floor={floor} label={floorLabel(floor)} kind={kindLabel(floor)}/>
  </div>;
}

function FloorView({data,floor,label,kind}:{data:ExplorerData;floor:ExplorerFloor;label:string;kind:string}){
  const {t}=useI18n();
  const [zoom,setZoom]=useState<number|null>(null);
  const pool=data.pools[floor.pool], mix=data.mixes[floor.mix], special=data.specials[floor.special], reward=data.rewards[floor.from];
  const rockLine=(i:number)=>floor.kind==='normal'?t('约 {n} 块石头',{n:floor.totals[i]}):null;
  const rocks=mix.reduce((total,row)=>total+row.count,0);
  const low=Math.min(...floor.totals), high=Math.max(...floor.totals);
  return <div className="qx-floor">
    <p className="qx-status" role="status">{label} · {kind}</p>
    <dl className="qx-facts">
      <div><dt>{t('楼层类型')}</dt><dd>{kind}</dd></div>
      {floor.tileset>0&&<div><dt>{t('外观')}</dt><dd>{data.tilesets[floor.tileset]}</dd></div>}
      {floor.kind==='normal'&&<div><dt>{t('石头')}</dt><dd>{low===high?t('约 {n} 块',{n:low}):t('{low}–{high} 块，平均 {avg}',{low,high,avg:count(Math.round(rocks*10)/10)})}</dd></div>}
      {floor.kind==='normal'&&<div><dt>{t('变成特殊房间')}</dt><dd>{special.chance?`${special.chance}%`:t('不会')}</dd></div>}
    </dl>
    {floor.kind==='rest'&&<p>{t('休息层固定用这张地图，不会放石头和怪物。')}</p>}
    {floor.kind==='bottom'&&<p>{t('最底层固定用这张地图，不会放石头和怪物，也不会变成特殊房间。')}</p>}
    {reward&&<p className="qx-reward"><span>{t('第一次到达时的奖励：')}</span>{reward.icon&&<img src={reward.icon} width="28" height="28" alt="" loading="lazy" decoding="async"/>}{reward.href?<a href={reward.href}>{reward.name}</a>:reward.name} ×{reward.count}</p>}

    <h3>{pool.length>1?t('布局（{n} 种，每种 {chance}）',{n:pool.length,chance:`1/${pool.length} ≈ ${percent(1/pool.length)}`}):t('地图')}</h3>
    {pool.length>1&&<p className="qx-note">{t('进入楼层时从这些布局里等概率抽一种。图上只有地形：石头、怪物和往下走的洞每次进入时随机摆放。点图可以放大。')}</p>}
    <ul className="qx-layouts">{pool.map((key,i)=>{
      const layout=data.layouts[key];
      return <li key={key}><figure>
        <button type="button" className="qx-art" onClick={()=>setZoom(i)} aria-label={t('放大查看{name}',{name:layout.label})} aria-haspopup="dialog">
          <img src={layout.src} width={layout.width} height={layout.height} alt="" loading="lazy" decoding="async"/>
        </button>
        <figcaption><strong>{layout.label}</strong>{rockLine(i)&&<span>{rockLine(i)}</span>}</figcaption>
      </figure></li>;
    })}</ul>
    {zoom!==null&&<LayoutDialog layouts={pool.map(key=>data.layouts[key])} index={zoom} setIndex={setZoom} caption={rockLine} onClose={()=>setZoom(null)}/>}

    {mix.length>0&&<>
      <h3>{t('石头构成')}</h3>
      <p className="qx-note">{t('每层平均块数。名单上的每种石头至少放 1 块，所以在石头少的布局里，稀有石头占的比例更高。')}</p>
      <ul className="qx-mix">{mix.map(row=><li key={row.name}><span>{row.name}</span><span className="qx-num">{count(row.count)}</span><span className="qx-share">{percent(row.count/rocks)}</span></li>)}</ul>
    </>}

    {special.rooms.length>0&&<>
      <h3>{t('特殊房间')}</h3>
      <ul className="qx-mix">{special.rooms.map(row=><li key={row.name}><span>{row.name}</span><span className="qx-num">{percent(row.chance)}</span></li>)}</ul>
      <p className="qx-note"><a href="#special-rooms">{t('各特殊房间的说明')}</a></p>
    </>}
  </div>;
}

/** Native modal: focus stays inside, Esc and a backdrop click close it, and focus goes back to the thumbnail. */
function LayoutDialog({layouts,index,setIndex,caption,onClose}:{
  layouts:ExplorerLayout[]; index:number; setIndex:(index:number)=>void; caption:(index:number)=>string|null; onClose:()=>void;
}){
  const {t}=useI18n();
  const ref=useRef<HTMLDialogElement>(null);
  const heading=useId();
  useEffect(()=>{
    // React removes the dialog before this cleanup runs, so the browser can't restore focus itself.
    const dialog=ref.current!, opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    dialog.showModal();
    return ()=>{dialog.close();opener?.focus({preventScroll:true});};
  },[]);
  const [loaded,setLoaded]=useState('');
  const layout=layouts[index], count=layouts.length, line=caption(index);
  // Wraps around, so the buttons never disable under the keyboard focus.
  const step=(by:number)=>setIndex((index+by+count)%count);
  return <dialog ref={ref} className="qx-dialog" aria-labelledby={heading}
    onCancel={event=>{event.preventDefault();onClose();}}
    onKeyDown={event=>{
      if(event.altKey||event.ctrlKey||event.metaKey)return;
      if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}
      if(event.key==='ArrowRight'){event.preventDefault();step(1);}
    }}
    onClick={event=>{if(event.target===event.currentTarget){
      const rect=event.currentTarget.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();
    }}}>
    <header className="qx-dialog-head">
      <h3 id={heading}>{layout.label}</h3>
      {line&&<span>{line}</span>}
      <button type="button" className="qx-button qx-close" onClick={onClose} aria-label={t('关闭弹窗')}>×</button>
    </header>
    {/* The thumbnail, already loaded, stands in until the large image arrives. */}
    <div className="qx-dialog-art"><img key={layout.large.src} src={layout.large.src} width={layout.large.width} height={layout.large.height} alt={layout.label} decoding="async"
      onLoad={()=>setLoaded(layout.large.src)} style={loaded===layout.large.src?undefined:{backgroundImage:`url("${layout.src}")`}}/></div>
    {count>1&&<footer className="qx-dialog-foot">
      <button type="button" className="qx-button qx-step" onClick={()=>step(-1)} aria-label={t('上一个布局')}>‹</button>
      <span aria-live="polite">{index+1} / {count}</span>
      <button type="button" className="qx-button qx-step" onClick={()=>step(1)} aria-label={t('下一个布局')}>›</button>
    </footer>}
  </dialog>;
}
