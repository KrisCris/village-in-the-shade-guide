import SearchableSelect from '../controls/SearchableSelect';
import { withBase } from '../../lib/sitePath';
import {lazy, Suspense, useMemo, useState, type CSSProperties} from 'react';
import type {Catalog, Entity} from '../../data/types';
import {cropProcessingOptions, type CropProcessingResult} from '../../domain/cropProcessing';
import {useQuality} from '../quality/qualityPreference';
const EntityDrawer=lazy(()=>import('../entity/EntityDrawer'));
import {useProgressiveRows} from './useProgressiveRows';
import {normalizeSearch} from '../../data/clientSearch';
import {seedAvailability} from '../../domain/seedAvailability';
import {msg} from '../../i18n/translate';
import {useI18n} from '../../i18n/react';
import {canPlantAhead, firstDirection, groupPlannerRows, listedIn, optionKey, type PlannerSortKey} from './plannerRows';
import {harvestOptions, type HarvestOption} from '../../domain/harvestChoice';

const MONTH = 28;
const seasons = {spring:msg('春'),summer:msg('夏'),autumn:msg('秋'),winter:msg('冬')};
const fmt = (n:number) => Number.isInteger(n) ? String(n) : `≈${n.toFixed(1)}`;
const toggle = (set:Set<string>, key:string) => {const next=new Set(set); if(!next.delete(key)) next.add(key); return next;};
export default function CropPlanner({entities}: {entities:Entity[]}) {
  const {t,lang}=useI18n();
  const [quality] = useQuality();
  const [season,setSeason]=useState('spring');
  const [year,setYear]=useState(1);
  const [ownedSeeds,setOwnedSeeds]=useState(false);
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<PlannerSortKey>('netPerDay');
  const [direction,setDirection]=useState<'asc'|'desc'>('desc');
  const [openDetails,setOpenDetails]=useState<Set<string>>(new Set());
  const [openGroups,setOpenGroups]=useState<Set<string>>(new Set());
  // Clicking the sorted column flips it; a new column starts from its best value.
  const sortBy=(key:PlannerSortKey)=>{if(key===sort)setDirection(direction==='asc'?'desc':'asc');else{setSort(key);setDirection(firstDirection(key));}};
  const [selected,setSelected]=useState<Entity|null>(null);
  const catalog=useMemo<Catalog>(()=>({buildId:'25640656',generatedAt:'',entities,byId:Object.fromEntries(entities.filter(e=>e.kind==='items').map(e=>[e.id,e])),counts:{}}),[entities]);
  const seasonal=useMemo(()=>entities.filter(e=>e.kind==='crops' && listedIn(e,season)),[entities,season]);
  const availability=useMemo(()=>new Map(seasonal.map(crop=>[crop.id,seedAvailability(crop,entities,year,season)])),[seasonal,entities,year,season]);
  const candidates=useMemo(()=>seasonal.filter(crop=>ownedSeeds||availability.get(crop.id)?.available),[seasonal,ownedSeeds,availability]);
  const plantedAhead=canPlantAhead(year,season);
  const calculated=useMemo(()=>candidates.flatMap(crop=>cropProcessingOptions(crop,catalog,quality,MONTH,true,plantedAhead)),[candidates,catalog,quality,plantedAhead]);
  const matching=useMemo(()=>calculated.filter(row=>!query || normalizeSearch(row.crop.searchText+' '+row.output.searchText).includes(normalizeSearch(query))),[calculated,query]);
  const groups=useMemo(()=>groupPlannerRows(matching,sort,direction,lang),[matching,sort,direction,lang]);
  // Picks the planner leaves out: the modelled harvest is the crop's first item, so list the others.
  const earlyPicks=useMemo(()=>new Map(candidates.map(crop=>{const options=harvestOptions(crop,catalog,quality); const modelled=options.find(o=>o.item.id===(crop.harvest_item_ids as string[]|undefined)?.[0]); return [crop.id,modelled?{modelled,others:options.filter(o=>o!==modelled)}:null] as const;})),[candidates,catalog,quality]);
  const topPerDay=useMemo(()=>Math.max(0,...matching.map(row=>row.netPerDay)),[matching]);
  const {visible,sentinel,more,loadMore}=useProgressiveRows(groups,30);
  const columns:[PlannerSortKey,string][]=[['name',t('作物 → 产物')],['netPerDay',t('日净收益')],['netPerSeed',t('每颗种子净收益')],['finishDay',t('种下到卖完')],['monthNet',t('当月净收入')]];
  const label=(key:PlannerSortKey)=>columns.find(([id])=>id===key)![1];
  const row=(option:CropProcessingResult, alternative:boolean, others:number)=>{
    const key=optionKey(option), open=openDetails.has(key), detailId=`plan-detail-${key.replace(/[^\w-]/g,'_')}`, groupOpen=openGroups.has(option.crop.id);
    const product=option.process?`${option.crop.name.zh_hans} → ${option.output.name.zh_hans}`:`${option.crop.name.zh_hans} · ${t('直接出售')}`;
    return [<tr key={key} className={alternative?'plan-alt':undefined} data-open={open||undefined} onClick={event=>{if(!(event.target as HTMLElement).closest('button'))setOpenDetails(toggle(openDetails,key));}}>
      <td className="plan-name"><span className="plan-name-inner">
        <button type="button" className="plan-toggle" aria-expanded={open} aria-controls={detailId} aria-label={t('{name} 的明细',{name:product})} onClick={()=>setOpenDetails(toggle(openDetails,key))}><span aria-hidden="true">▸</span></button>
        {alternative?<span className="plan-icon" aria-hidden="true"/>:option.crop.icon_path?<img className="plan-icon" src={withBase(option.crop.icon_path)} alt="" loading="lazy" width={32} height={32}/>:<span className="plan-icon" aria-hidden="true"/>}
        <span className="plan-title"><button type="button" className="link-button" onClick={()=>setSelected(option.crop)}>{option.crop.name.zh_hans}</button>{option.process?<> → <button type="button" className="link-button" onClick={()=>setSelected(option.output)}>{option.output.name.zh_hans}</button></>:<span className="plan-muted"> · {t('直接出售')}</span>}</span>
        {earlyPicks.get(option.crop.id)?.others.map(pick=><span key={pick.item.id} className="plan-tag">{t('可早收{name}',{name:pick.item.name.zh_hans})}</span>)}
        {option.perennial&&<span className="plan-tag">{t('不含树苗 {value}/天',{value:Math.round(option.perennial.laterNetPerDay)})}</span>}
        {others>0&&<button type="button" className="plan-more" aria-expanded={groupOpen} onClick={()=>setOpenGroups(toggle(openGroups,option.crop.id))}>{groupOpen?t('收起其他做法'):t('另 {count} 种做法',{count:others})}</button>}
      </span></td>
      <td className={option.netPerDay<0?'plan-daily plan-negative':'plan-daily'} data-label={label('netPerDay')}><span className="plan-bar" aria-hidden="true" style={{'--share':`${topPerDay>0?Math.max(0,option.netPerDay)/topPerDay*100:0}%`} as CSSProperties}/><b>{fmt(option.netPerDay)}</b></td>
      <td data-label={label('netPerSeed')}>{fmt(option.netPerSeed)}</td>
      <td data-label={label('finishDay')}>{t('{days} 天',{days:fmt(option.finishDay)})}{option.finishDay>MONTH&&<span className="plan-tag">{t('跨月')}</span>}</td>
      <td data-label={label('monthNet')} className={option.monthNet<0?'plan-negative':undefined}>{fmt(option.monthNet)}</td>
    </tr>,
    open&&<tr key={key+':detail'} id={detailId} className="plan-detail"><td colSpan={5}><PlanDetail option={option} catalog={catalog} picks={earlyPicks.get(option.crop.id)??null}/></td></tr>];
  };
  return <>
    <div className="toolbar card planner-controls">
      <label>{t('搜索')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('作物、产物或拼音')} /></label>
      <label>{t('种植季节')}<SearchableSelect value={season} onChange={e=>setSeason(e.target.value)}>{Object.entries(seasons).map(([id,name])=><option key={id} value={id}>{t(name)}</option>)}</SearchableSelect></label>
      <label>{t('年份')}<SearchableSelect value={year} onChange={e=>setYear(Number(e.target.value))}><option value={1}>{t('第一年')}</option><option value={2}>{t('第二年')}</option><option value={3}>{t('第三年及以后')}</option></SearchableSelect></label>
      <label>{t('种子来源')}<SearchableSelect value={ownedSeeds?'owned':'shop'} onChange={e=>setOwnedSeeds(e.target.value==='owned')}><option value="shop">{t('按本年商店开放范围')}</option><option value="owned">{t('已有种子，不限制商店')}</option></SearchableSelect></label>
      <b aria-live="polite">{t('{crops} 种作物 · {count} 个方案',{crops:groups.length,count:matching.length})}</b>
    </div>
    <p className="planner-basis">{t('每行按 1 格地、1 台加工机器、月初种下计算。不会再生的作物收获后在同一格补种，每次补种买一颗种子。果树和茶树、桑树只在结果季列出：树苗买一次，季前种好，整季收获。点开一行可看播种、收获和加工的时间线。')}</p>
    {!ownedSeeds&&<p className="planner-note">{t('已按年份与出售季节排除 {count} 种不在商店开放范围内的作物；出货、品评会等额外条件仍需满足。已有库存或从其他途径拿到种子时，切换“已有种子”。',{count:seasonal.length-candidates.length})}</p>}
    <details className="planner-method"><summary>{t('计算方式')}</summary>
      <p>{t('日净收益 = 整批净收益 ÷ 从种下到全部卖完的天数，生长、排队加工和出售都算在内。每颗种子净收益 = 整批净收益 ÷ 播种次数。')}</p>
      <p>{t('按 28 天计算。每次播种扣除种子费用，不重复扣除原料售价。不足一批的余料月底直接出售；排队中和加工中的库存不计入当月净收入。整批收益包含月底后售出的产品。未计肥料、机器购置和体力消耗。')}</p>
      <p>{t('价格按当前品质计算，未叠加祠堂出货术等售价加成。')}</p>
      <p>{t('果树和茶树、桑树种下后一直留在地里，只在结果季收获，天数从结果季第一天算起。日净收益扣除了树苗钱；之后的结果季不用再买苗，“不含树苗”标的是那时的日净收益。果树长成后每天结 1 个果，最多挂 3 个，按挂满就摇计算；茶树和桑树收一次后要再长 2 天。桑树每次同时收桑叶和桑葚各 2 个，加工桑叶时桑葚直接出售。第一年春天来不及提前种，按月初种下、长成后再收计算。香蕉树、可可树和芒果树只能种在温室里，四季都结果，所以每季都列出。果树之间要留两格空地，实际占地不止 1 格。')}</p>
      <p>{t('当前比较单一作物直接加工的方案。收获量或生长时间未确认的作物不参与排名；需要多种原料或多级加工的链条尚未计入。排行展示的是产能与成本比较，种子与机械仍需先满足各自解锁条件。')}</p>
    </details>
    <div className="planner-table" data-scene-total={groups.length}><table><thead><tr>{columns.map(([key,text])=><th key={key} aria-sort={sort===key?(direction==='asc'?'ascending':'descending'):undefined}><button type="button" className="sort-header" onClick={()=>sortBy(key)}>{text}<span className="sort-mark" aria-hidden="true">{sort===key?(direction==='asc'?' ▲':' ▼'):''}</span></button></th>)}</tr></thead>
      <tbody>{visible.flatMap(group=>{
        const [best,...rest]=group.options;
        return [...row(best,false,rest.length),...(openGroups.has(group.crop.id)?rest.flatMap(option=>row(option,true,0)):[])];
      })}</tbody></table>
      {!groups.length&&<p className="plan-empty">{t('没有符合条件的方案。')}</p>}
    </div>
    <div ref={sentinel}>{more&&<button onClick={loadMore}>{t('加载更多（已显示 {shown} / {total}）',{shown:visible.length,total:groups.length})}</button>}</div>
    {!ownedSeeds&&<details><summary>{t('本季种子的商店与开放条件')}</summary><table><thead><tr><th>{t('作物')}</th><th>{t('商店')}</th><th>{t('条件')}</th></tr></thead><tbody>{candidates.map(crop=><tr key={crop.id}><td><button onClick={()=>setSelected(crop)}>{crop.name.zh_hans}</button></td><td>{availability.get(crop.id)?.locations.join(' / ')}</td><td>{availability.get(crop.id)?.conditions.join(t('；'))||t('无额外条件')}</td></tr>)}</tbody></table></details>}
    {selected&&<Suspense fallback={<p role="status">{t('正在打开详情…')}</p>}><EntityDrawer initial={selected} onClose={()=>setSelected(null)}/></Suspense>}
    <style>{`.planner-controls{display:flex;align-items:end;flex-wrap:wrap;gap:.8rem;padding:.8rem;margin:1.2rem 0}.planner-controls label{display:grid;gap:.3rem;color:var(--muted);font-size:.78rem}.planner-controls label:first-child{flex:1 1 12rem}.planner-controls label:nth-child(4){min-width:13.5rem}.planner-controls input{min-height:42px;padding:.55rem .7rem;background:var(--paper-raised);color:var(--ink);border:1px solid var(--border);border-radius:8px;font:inherit;font-size:.9rem}.planner-controls b{margin-left:auto;padding:.7rem;color:var(--green)}@media(max-width:700px){.planner-controls>*{flex:1 1 140px}.planner-controls b{margin-left:0}}
.planner-basis{margin:.4rem 0 .6rem;color:var(--ink);font-size:.92rem}.planner-note{font-size:.85rem;color:var(--muted)}.planner-method p{font-size:.85rem;color:var(--muted)}.planner-method summary{cursor:pointer;color:var(--green)}
.planner-table{overflow:auto}.planner-table table{border-collapse:collapse;width:100%;font-size:.88rem}.planner-table :is(th,td){padding:.65rem .8rem;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}.planner-table th:not(:first-child),.planner-table td:not(.plan-name){text-align:right}.planner-table th:not(:first-child) .sort-header{justify-content:flex-end}
.planner-table tbody tr:not(.plan-detail){cursor:pointer}.planner-table tbody tr[data-open]{background:color-mix(in srgb,var(--green-soft) 45%,transparent)}
.plan-name-inner{display:flex;align-items:center;gap:.5rem}.plan-icon{flex:none;width:32px;height:32px;object-fit:contain}.plan-title .link-button{color:var(--green);background:none;border:0;padding:0;font:inherit;cursor:pointer}.plan-title .link-button:hover{text-decoration:underline}.plan-muted{color:var(--muted)}
.plan-toggle{flex:none;display:grid;place-items:center;width:26px;height:26px;min-height:0;padding:0;border:1px solid var(--border);border-radius:6px;background:var(--paper-raised);color:var(--green);cursor:pointer}.plan-toggle span{font-size:.8rem;line-height:1;transition:transform .15s}.plan-toggle[aria-expanded=true] span{transform:rotate(90deg)}
.plan-toggle:focus-visible,.plan-more:focus-visible,.plan-title .link-button:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.plan-more{margin-left:.2rem;min-height:0;padding:.15rem .55rem;border:1px solid var(--border);border-radius:999px;background:none;color:var(--muted);font-size:.75rem;cursor:pointer}.plan-more:hover,.plan-more[aria-expanded=true]{border-color:var(--green);color:var(--green)}
.plan-alt .plan-name-inner{padding-left:1.2rem}.plan-alt td{background:color-mix(in srgb,var(--paper-deep) 25%,transparent)}
.plan-daily{min-width:9.5rem}.plan-daily b{display:inline-block;min-width:3.6rem;color:var(--green);font-size:1rem;text-align:right}.plan-bar{display:inline-block;width:4.5rem;height:6px;margin-right:.6rem;vertical-align:middle;border-radius:3px;background:linear-gradient(to right,var(--green) var(--share),color-mix(in srgb,var(--green-soft) 70%,transparent) var(--share))}
.plan-tag{display:inline-block;white-space:nowrap;margin-left:.4rem;padding:.05rem .4rem;border-radius:4px;background:color-mix(in srgb,var(--gold) 16%,transparent);color:var(--gold);font-size:.72rem}.plan-negative,.plan-negative.plan-daily b{color:var(--vermilion)}
.plan-detail td{padding:0 .8rem 1rem;white-space:normal;text-align:left!important;background:color-mix(in srgb,var(--green-soft) 22%,transparent)}.plan-empty{padding:1rem;color:var(--muted)}
.plan-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.6rem;padding-top:.8rem}.plan-facts>div{display:grid;gap:.15rem;padding:.55rem .7rem;border:1px solid var(--border);border-radius:8px;background:var(--paper-raised)}.plan-facts span{color:var(--muted);font-size:.75rem}.plan-facts b{font-size:.95rem}.plan-facts small{color:var(--muted);font-size:.75rem}
.plan-pick{margin:.8rem 0 0;padding:.5rem .7rem;border-left:3px solid var(--gold);background:color-mix(in srgb,var(--gold) 8%,transparent);font-size:.85rem}.plan-timeline{margin-top:.9rem}.plan-track{display:grid;grid-template-columns:3.2rem 1fr;align-items:center;gap:.5rem;margin:.35rem 0}.plan-track>span{color:var(--muted);font-size:.75rem}.plan-lane{position:relative;height:18px;border-radius:4px;background:color-mix(in srgb,var(--paper-deep) 55%,transparent)}
.plan-seg{position:absolute;top:3px;bottom:3px;border-radius:3px}.plan-seg.grow{background:var(--green)}.plan-seg.regrow{background:color-mix(in srgb,var(--green) 55%,var(--paper-raised))}.plan-seg.run{background:var(--gold)}
.plan-harvest{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -7px;border-radius:50%;background:var(--vermilion);border:2px solid var(--paper-raised)}
.plan-axis{position:relative;height:1.2rem;margin-left:3.7rem;color:var(--muted);font-size:.7rem}.plan-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}.plan-mark{position:absolute;top:0;bottom:0;border-left:1px dashed var(--muted)}.plan-mark.sold{border-left:2px solid var(--vermilion)}
.plan-lanes{position:relative}.plan-marks{position:absolute;inset:0 0 0 3.7rem;pointer-events:none}.plan-legend{display:flex;flex-wrap:wrap;gap:.3rem 1rem;margin-top:.3rem;color:var(--muted);font-size:.75rem}.plan-legend i{display:inline-block;width:12px;height:8px;margin-right:.3rem;border-radius:2px;vertical-align:middle}
@media(max-width:700px){.planner-table{overflow:visible;border:0!important;background:none!important;box-shadow:none!important}.planner-table table,.planner-table tbody{display:block}.planner-table thead tr{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.7rem}.planner-table th{padding:0;border:0;background:none!important}.planner-table th .sort-header{padding:.35rem .7rem;border:1px solid var(--border);border-radius:999px;background:var(--paper-raised);font-size:.8rem}.planner-table th[aria-sort] .sort-header{border-color:var(--green)}
.planner-table tbody tr:not(.plan-detail){display:grid;grid-template-columns:repeat(3,1fr);margin-top:.7rem;border:1px solid var(--border);border-radius:8px;background:var(--paper-raised)}.planner-table tbody tr.plan-alt{margin-left:1rem;margin-top:.4rem}.planner-table tbody tr[data-open]{border-bottom-left-radius:0;border-bottom-right-radius:0}
.planner-table tbody td{border:0;padding:.35rem .7rem;text-align:left!important;white-space:normal}.planner-table td.plan-name,.planner-table td.plan-daily{grid-column:1/-1}.planner-table td.plan-name{padding-top:.7rem}.planner-table td.plan-daily{display:flex;align-items:center;gap:.5rem}.planner-table td.plan-daily b{min-width:0;font-size:1.35rem;text-align:left;order:-1}.plan-bar{flex:1;width:auto;margin:0}
.planner-table td[data-label]::before{content:attr(data-label);display:block;color:var(--muted);font-size:.7rem}.planner-table td.plan-daily::before{display:none!important}.planner-table td:not(.plan-name):not(.plan-daily){padding-bottom:.7rem}
.planner-table tr.plan-detail{display:block;border:1px solid var(--border);border-top:0;border-radius:0 0 8px 8px}.planner-table tr.plan-detail td{display:block}.plan-alt .plan-name-inner{padding-left:0}.plan-name-inner{flex-wrap:wrap}}
details{margin:1rem 0}`}</style>
  </>;
}

function PlanDetail({option,catalog,picks}:{option:CropProcessingResult;catalog:Catalog;picks:{modelled:HarvestOption;others:HarvestOption[]}|null}) {
  const {t}=useI18n();
  const perennial=option.crop.perennial, plan=option.perennial, grow=Number(option.crop.growth_days);
  // A perennial planted the season before shows its growth left of day 0.
  const lead=plan?.plantedAhead?grow:0;
  const span=Math.max(MONTH,Math.ceil(option.finishDay));
  const at=(day:number)=>`${(day+lead)/(span+lead)*100}%`;
  const length=(days:number)=>`${days/(span+lead)*100}%`;
  const step=span+lead>42?14:7;
  const ticks=Array.from({length:Math.floor(span/step)+1},(_,i)=>i*step);
  const gain=option.processingGain;
  // Each field segment ends at a harvest: a fresh seed for replanted crops, a regrow otherwise.
  // A perennial grows once, then bears for the rest of the season.
  const bearFrom=plan?.plantedAhead?0:grow;
  const fields=perennial&&plan
    ?[{kind:'grow',from:bearFrom-grow,to:bearFrom},{kind:'regrow',from:bearFrom,to:MONTH}]
    :option.harvestDays.map((day,index)=>({kind:option.regrows&&index>0?'regrow':'grow',from:index?option.harvestDays[index-1]:0,to:day}));
  return <div className="plan-detail-body">
    <div className="plan-facts">
      {perennial&&plan?<>
        <div><span>{t('种下')}</span><b>{plan.plantedAhead?t('季前 {days} 天',{days:grow}):t('月初')}</b><small>{!plan.plantedAhead?t('第一年春天来不及提前种，第 {days} 天长成',{days:grow}):perennial.kind==='fruit_tree'&&perennial.greenhouse_only?t('只能种在温室里，长成后不用补种'):t('长成后留在地里，不用补种')}</small></div>
        <div><span>{t('树苗')}</span><b>1 × {option.seedPrice} = {fmt(option.seedCost)}</b><small>{t('只买一次')}</small></div>
        <div><span>{t('收获')}</span><b>{t('{harvests} 次 · 共 {count} 个',{harvests:option.harvestCount,count:option.harvested})}</b><small>{perennial.kind==='shrub'?t('每 {days} 天收一次',{days:perennial.rebear_days}):t('每天结 {count} 个，最多 {capacity} 个',{count:perennial.fruit_per_day,capacity:perennial.fruit_capacity??0})}</small></div>
      </>:<>
        <div><span>{t('播种')}</span><b>{t('{count} 次',{count:option.plantings})}</b><small>{option.regrows?t('会再生，一颗种子收到月底'):t('不会再生，收获后补种')}</small></div>
        <div><span>{t('种子')}</span><b>{option.plantings} × {option.seedPrice} = {fmt(option.seedCost)}</b></div>
        <div><span>{t('收获')}</span><b>{t('{harvests} 次 · 共 {count} 个',{harvests:option.harvestCount,count:option.harvested})}</b></div>
      </>}
      {option.coProducts.map(extra=><div key={extra.itemId}><span>{t('同时收获')}</span><b>{catalog.byId[extra.itemId]?.name.zh_hans} × {extra.count}</b><small>{t('直接出售 {value}',{value:fmt(extra.value)})}</small></div>)}
      {option.process&&<div><span>{t('加工')}</span><b>{t('{count} 批',{count:option.batches})}</b><small>{t('机器忙 {days} / {month} 天',{days:fmt(option.machineDays),month:MONTH})}</small></div>}
      <div><span>{t('整批净收益')}</span><b>{fmt(option.net)}</b>{option.process&&<small>{gain>=0?t('比直接出售多 {value}',{value:fmt(gain)}):t('比直接出售少 {value}',{value:fmt(-gain)})}</small>}</div>
      {plan&&<div><span>{t('之后的结果季')}</span><b>{fmt(plan.laterNet)}</b><small>{t('不再买树苗 · 日净收益 {value}',{value:fmt(plan.laterNetPerDay)})}</small></div>}
    </div>
    {picks?.others.map(pick=><p key={pick.item.id} className="plan-pick">{t('这里按{modelled}计算。也可以提早收{name}：成长点到 {first} 首收，之后每 {regrow} 点一次。只看卖出价，{name}每天约 {value}，{modelled}约 {modelledValue}。',{modelled:picks.modelled.item.name.zh_hans,name:pick.item.name.zh_hans,first:pick.firstPoints,regrow:pick.regrowPoints,value:fmt(pick.perDay??0),modelledValue:fmt(picks.modelled.perDay??0)})}</p>)}
    <div className="plan-timeline" aria-hidden="true">
      <div className="plan-lanes">
        <div className="plan-track"><span>{t('田地')}</span><div className="plan-lane">
          {fields.map((field,index)=><i key={index} className={`plan-seg ${field.kind}`} style={{left:at(field.from),width:`calc(${length(field.to-field.from)} - 3px)`}}/>)}
          {option.harvestDays.map(day=><i key={day} className="plan-harvest" style={{left:at(day)}}/>)}
        </div></div>
        {option.process&&<div className="plan-track"><span>{t('机器')}</span><div className="plan-lane">{option.machineRuns.map(([start,end])=><i key={start} className="plan-seg run" style={{left:at(start),width:length(end-start)}}/>)}</div></div>}
        <div className="plan-marks">{lead>0&&<i className="plan-mark" style={{left:at(0)}}/>}{span>MONTH&&<i className="plan-mark" style={{left:at(MONTH)}}/>}<i className="plan-mark sold" style={{left:at(option.finishDay)}}/></div>
      </div>
      <div className="plan-axis">{ticks.map(day=><span key={day} style={{left:at(day),transform:(day+lead)/(span+lead)>0.95?'translateX(-100%)':undefined}}>{t('第 {day} 天',{day})}</span>)}</div>
      <div className="plan-legend"><span><i style={{background:'var(--green)'}}/>{plan?(plan.plantedAhead?t('季前种下，{days} 天长成',{days:grow}):t('生长 {days} 天',{days:grow})):option.regrows?t('首次生长'):t('生长（每段一颗种子）')}</span>{option.regrows&&<span><i style={{background:'color-mix(in srgb,var(--green) 55%,var(--paper-raised))'}}/>{plan?t('结果期'):t('再生')}</span>}<span><i style={{background:'var(--vermilion)',borderRadius:'50%',width:10,height:10}}/>{perennial?.kind==='fruit_tree'?t('摇树'):t('收获')}</span>{option.process&&<span><i style={{background:'var(--gold)'}}/>{t('加工')}</span>}<span><i style={{background:'var(--vermilion)',width:2}}/>{t('{days} 天后全部卖完',{days:fmt(option.finishDay)})}</span>{span>MONTH&&<span><i style={{borderLeft:'1px dashed var(--muted)',width:0}}/>{t('月末')}</span>}</div>
    </div>
  </div>;
}
