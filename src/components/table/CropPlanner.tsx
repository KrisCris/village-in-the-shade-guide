import SearchableSelect from '../controls/SearchableSelect';
import { withBase } from '../../lib/sitePath';
import {lazy, Suspense, useMemo, useState} from 'react';
import type {Catalog, Entity} from '../../data/types';
import {cropProcessingOptions} from '../../domain/cropProcessing';
import {useQuality} from '../quality/qualityPreference';
const EntityDrawer=lazy(()=>import('../entity/EntityDrawer'));
import {useProgressiveRows} from './useProgressiveRows';
import {normalizeSearch} from '../../data/clientSearch';
import {seedAvailability} from '../../domain/seedAvailability';
import {msg} from '../../i18n/translate';
import {useI18n} from '../../i18n/react';

const seasons = {spring:msg('春'),summer:msg('夏'),autumn:msg('秋'),winter:msg('冬')};
const fmt = (n:number) => Number.isInteger(n) ? String(n) : `≈${n.toFixed(1)}`;
type SortKey='name'|'harvested'|'seedCost'|'processingGain'|'net'|'monthNet'|'machineDays'|'finishDay';
export default function CropPlanner({entities}: {entities:Entity[]}) {
  const {t,lang}=useI18n();
  const [quality] = useQuality();
  const [season,setSeason]=useState('spring');
  const [year,setYear]=useState(1);
  const [ownedSeeds,setOwnedSeeds]=useState(false);
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<SortKey>('monthNet');
  const [direction,setDirection]=useState<'asc'|'desc'>('desc');
  // Clicking the sorted column flips it; a new column starts from the best value (A–Z for names).
  const sortBy=(key:SortKey)=>{if(key===sort)setDirection(direction==='asc'?'desc':'asc');else{setSort(key);setDirection(key==='name'?'asc':'desc');}};
  const [selected,setSelected]=useState<Entity|null>(null);
  const catalog=useMemo<Catalog>(()=>({buildId:'25311578',generatedAt:'',entities,byId:Object.fromEntries(entities.filter(e=>e.kind==='items').map(e=>[e.id,e])),counts:{}}),[entities]);
  const seasonal=useMemo(()=>entities.filter(e=>e.kind==='crops' && (e.seasons as string[]|undefined)?.includes(season)),[entities,season]);
  const availability=useMemo(()=>new Map(seasonal.map(crop=>[crop.id,seedAvailability(crop,entities,year,season)])),[seasonal,entities,year,season]);
  const candidates=useMemo(()=>seasonal.filter(crop=>ownedSeeds||availability.get(crop.id)?.available),[seasonal,ownedSeeds,availability]);
  const calculated=useMemo(()=>candidates.flatMap(crop=>cropProcessingOptions(crop,catalog,quality,28,true)),[candidates,catalog,quality]);
  const rows=useMemo(()=>calculated.filter(row=>!query || normalizeSearch(row.crop.searchText+' '+row.output.searchText).includes(normalizeSearch(query))).sort((a,b)=>{
    const diff=sort==='name'?a.crop.name.zh_hans.localeCompare(b.crop.name.zh_hans,lang):Number(a[sort])-Number(b[sort]);
    return direction==='asc'?diff:-diff;
  }),[calculated,query,sort,direction,lang]);
  const {visible,sentinel,more,loadMore}=useProgressiveRows(rows);
  return <>
    <div className="toolbar card planner-controls">
      <label>{t('搜索')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('作物、产物或拼音')} /></label>
      <label>{t('种植季节')}<SearchableSelect value={season} onChange={e=>setSeason(e.target.value)}>{Object.entries(seasons).map(([id,name])=><option key={id} value={id}>{t(name)}</option>)}</SearchableSelect></label>
      <label>{t('年份')}<SearchableSelect value={year} onChange={e=>setYear(Number(e.target.value))}><option value={1}>{t('第一年')}</option><option value={2}>{t('第二年')}</option><option value={3}>{t('第三年及以后')}</option></SearchableSelect></label>
      <label>{t('种子来源')}<SearchableSelect value={ownedSeeds?'owned':'shop'} onChange={e=>setOwnedSeeds(e.target.value==='owned')}><option value="shop">{t('按本年商店开放范围')}</option><option value="owned">{t('已有种子，不限制商店')}</option></SearchableSelect></label>
      <b aria-live="polite">{t('{count} 个方案',{count:rows.length})}</b>
    </div>
    {!ownedSeeds&&<p className="planner-note">{t('已按年份与出售季节排除 {count} 种不在商店开放范围内的作物；出货、品评会等额外条件仍需满足。已有库存或从其他途径拿到种子时，切换“已有种子”。',{count:seasonal.length-candidates.length})}</p>}
    <details className="planner-method"><summary>{t('计算方式')}</summary>
      <p>{t('月初种植，每格地配一台机器，按 28 天计算。每次播种扣除种子费用，不重复扣除原料售价。不足一批的余料月底直接出售；排队中和加工中的库存不计入当月现金收入。整批收益包含月底后售出的产品。未计肥料、机器购置和体力消耗。')}</p>
      <p>{t('价格按当前品质计算，未叠加祠堂出货术等售价加成。')}</p>
      <p>{t('当前比较单一作物直接加工的方案。多年生树木、收获量或生长时间未确认的作物不参与排名；需要多种原料或多级加工的链条尚未计入。排行展示的是产能与成本比较，种子与机械仍需先满足各自解锁条件。')}</p>
    </details>
    <div className="planner-table" data-scene-total={rows.length}><table><thead><tr>{([['name',t('作物 → 产物')],['harvested',t('收获次数 / 总量')],['seedCost',t('种子总成本')],['processingGain',t('加工增值')],['net',t('整批最终净收益')],['monthNet',t('当月现金净收入')],['machineDays',t('机器占用天数')],['finishDay',t('全部售完需时')]] as [SortKey,string][]).map(([key,label])=><th key={key} aria-sort={sort===key?(direction==='asc'?'ascending':'descending'):undefined}><button type="button" onClick={()=>sortBy(key)}>{label}<span aria-hidden="true">{sort===key?(direction==='asc'?' ▲':' ▼'):''}</span></button></th>)}</tr></thead><tbody>{visible.map(row=><tr key={row.crop.id+(row.process?.id??'direct-sale')} tabIndex={0} onClick={event=>{if (!(event.target as HTMLElement).closest('button')) setSelected(row.crop);}} onKeyDown={event=>{if(event.target===event.currentTarget && ['Enter',' '].includes(event.key)){event.preventDefault();setSelected(row.crop);}}}>
      <td>{row.crop.icon_path&&<img src={withBase(row.crop.icon_path)} alt="" loading="lazy" width={36} height={36} style={{objectFit:'contain',verticalAlign:'middle',marginRight:8}}/>}<button onClick={()=>setSelected(row.crop)}>{row.crop.name.zh_hans}</button>{row.process?<> → <button onClick={()=>setSelected(row.output)}>{row.output.name.zh_hans}</button></>:<span> · {t('直接出售')}</span>}</td>
      <td>{t('{harvests} 次 / {count} 个',{harvests:row.harvestCount,count:row.harvested})}</td><td>{fmt(row.seedCost)}</td><td>{fmt(row.processingGain)}</td><td>{fmt(row.net)}</td><td>{fmt(row.monthNet)}</td><td>{fmt(row.machineDays)}</td><td>{t('{days} 天',{days:fmt(row.finishDay)})}{row.finishDay>28?` · ${t('跨月')}`:''}</td>
    </tr>)}</tbody></table></div>
    <div ref={sentinel}>{more&&<button onClick={loadMore}>{t('加载更多（已显示 {shown} / {total}）',{shown:visible.length,total:rows.length})}</button>}</div>
    {!ownedSeeds&&<details><summary>{t('本季种子的商店与开放条件')}</summary><table><thead><tr><th>{t('作物')}</th><th>{t('商店')}</th><th>{t('条件')}</th></tr></thead><tbody>{candidates.map(crop=><tr key={crop.id}><td><button onClick={()=>setSelected(crop)}>{crop.name.zh_hans}</button></td><td>{availability.get(crop.id)?.locations.join(' / ')}</td><td>{availability.get(crop.id)?.conditions.join(t('；'))||t('无额外条件')}</td></tr>)}</tbody></table></details>}
    {selected&&<Suspense fallback={<p role="status">{t('正在打开详情…')}</p>}><EntityDrawer initial={selected} onClose={()=>setSelected(null)}/></Suspense>}
    <style>{`.planner-controls{display:flex;align-items:end;flex-wrap:wrap;gap:.8rem;padding:.8rem;margin:1.2rem 0}.planner-controls label{display:grid;gap:.3rem;color:var(--muted);font-size:.78rem}.planner-controls label:first-child{flex:1 1 12rem}.planner-controls label:nth-child(4){min-width:13.5rem}.planner-controls input{min-height:42px;padding:.55rem .7rem;background:var(--paper-raised);color:var(--ink);border:1px solid var(--border);border-radius:8px;font:inherit;font-size:.9rem}.planner-controls b{margin-left:auto;padding:.7rem;color:var(--green)}@media(max-width:700px){.planner-controls>*{flex:1 1 140px}.planner-controls b{margin-left:0}}.planner-note{font-size:.85rem;color:var(--muted)}.planner-method p{font-size:.85rem;color:var(--muted)}.planner-method summary{cursor:pointer;color:var(--green)}th button{display:inline-flex;align-items:center;gap:.15rem;padding:0;border:0;background:none;color:inherit;font:inherit;font-weight:700;white-space:nowrap;cursor:pointer}th button:hover{color:var(--green)}th[aria-sort] button{color:var(--green)}th button:focus-visible{outline:2px solid var(--green);outline-offset:3px;border-radius:2px}.planner-table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{padding:.7rem;border-bottom:1px solid var(--border);text-align:left}th{white-space:nowrap}td button{color:var(--green);background:none;border:0;padding:0;cursor:pointer}details{margin:1rem 0}`}</style>
  </>;
}
