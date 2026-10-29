import { useEffect, useState } from 'react';
import SearchableSelect from '../controls/SearchableSelect';
import { useProgressiveRows } from '../table/useProgressiveRows';
import { withBase } from '../../lib/sitePath';
import type { Entity } from '../../data/types';
import { kindLabels } from '../../data/types';
import type { EntityDetailModel } from '../../domain/relations';
import { durationText } from '../../domain/duration';
import RelationRow from './RelationRow';
import CropGrowth from './CropGrowth';
import AnimatedPortrait from '../art/AnimatedPortrait';
import {portraits} from '../art/portraitCatalog';
import { useI18n } from '../../i18n/react';

export default function EntityDetail({ model, onOpen }: { model: EntityDetailModel; onOpen?: (entity: Entity) => void }) {
  const { t, href, locale } = useI18n();
  const { entity, facts, profit, groups, locations } = model;
  const [ingredient, setIngredient] = useState('');
  const [sort, setSort] = useState('default');
  const partialPlans = (model.totalProcessingPlans ?? model.processingPlans.length) > model.processingPlans.length;
  useEffect(() => { setIngredient(''); setSort('default'); }, [entity.id]);
  const materials = [...new Map(model.processingPlans.flatMap(plan => plan.groups.filter(g => g.key === 'materials').flatMap(g => g.rows.map(r => [r.entity.id, r.entity.name.zh_hans] as const)))).entries()];
  const plans = model.processingPlans.filter(plan => !ingredient || plan.groups.some(g => g.key === 'materials' && g.rows.some(r => r.entity.id === ingredient))).slice().sort((a, b) => {
    if (sort === 'default') return 0;
    if (sort === 'duration') return Number(a.entity.duration_minutes) - Number(b.entity.duration_minutes);
    const score = (plan: EntityDetailModel) => Number(plan.profit?.[sort as 'net' | 'perDay']?.replace(/[≈,]/g, '') ?? NaN);
    const av = score(a), bv = score(b);
    return (Number.isFinite(bv) ? bv : -Infinity) - (Number.isFinite(av) ? av : -Infinity);
  });
  // Recipes for one product differ only by ingredients, so they name each plan.
  const planTitle = (plan: EntityDetailModel) => plan.groups.filter(g => g.key === 'materials').flatMap(g => g.rows.map(r => r.entity.name.zh_hans)).join(' + ');
  const machines=groups.find(group=>group.key==='machines');
  const planRows = useProgressiveRows(plans, 12, `${entity.id}:${ingredient}:${sort}`);
  const machineIds=(rows:NonNullable<typeof machines>['rows'])=>[...new Set(rows.map(row=>`${row.entity.kind}:${row.entity.id}`))].sort().join('|');
  const sharedMachines=machineIds(machines?.rows??[]);
  const portrait=entity.kind==='characters'?portraits.find(p=>p.id===entity.id):undefined;
  return <article className="entity-detail">
    <div className={`entity-intro ${portrait?'has-portrait':''}`}><div>
    <p className="eyebrow">{entity.category_name?.zh_hans || (kindLabels[entity.kind] ? t(kindLabels[entity.kind]) : entity.kind)}</p>
    <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>{entity.icon_path && <img key={entity.id} src={withBase(entity.icon_path)} alt="" width="88" height="88" style={{objectFit:'contain',borderRadius:12}} />}<h1>{entity.name.zh_hans}</h1></div>
    {locale !== 'ja' && <p className="aliases">{(locale === 'zh-TW'
      ? [[t('简中'), entity.name.translations?.['zh-CN']], [t('日文'), entity.name.ja]]
      : [[t('繁中'), entity.name.zh_hant], [t('日文'), entity.name.ja]]
    ).map(([label, value]) => t('{label}：{value}', { label: label ?? '', value: value || '—' })).join('　')}</p>}
    {entity.kind!=='quests'&&typeof entity.description==='string'&&entity.description&&<p style={{whiteSpace:'pre-line',lineHeight:1.7}}>{entity.description}</p>}
    </div>{portrait&&<AnimatedPortrait key={entity.id} portrait={portrait} controls/>}</div>

    {entity.kind==='quests' && <section><h2>{t('任务目标')}</h2><p>{String(entity.description ?? '')}</p><p>{String(entity.objective ?? '')}</p>{((entity.steps ?? []) as string[]).length>0&&<ol>{((entity.steps ?? []) as string[]).map((step,index)=><li key={index}>{step}</li>)}</ol>}</section>}
    {Array.isArray(entity.map_locations)&&entity.map_locations.length>0&&<section><h2>{t('拾取位置')}</h2>{(entity.map_locations as {label:string;x:number;y:number;anchor:string;progress:string}[]).map(location=><p key={location.anchor}><a href={href(`/guides/collection-map/#${location.anchor}`)}>{t('{place} · 图书 {number} · 查看地图',{place:location.label,number:location.anchor.slice(-2)})}</a>{location.progress&&<><br/><small>{t('关联进度：{progress}',{progress:location.progress})}</small></>}</p>)}</section>}

    <section><h2>{t('基础数据')}</h2><dl className="facts">{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.price ? 'price' : ''}>{fact.value}</dd></div>)}</dl></section>
    {model.growth && <CropGrowth growth={model.growth} entity={entity} onOpen={onOpen} />}
    {machines&&<section><h2>{machines.label}</h2><div className="relation-list">{machines.rows.map(row=><RelationRow key={row.key} row={row} onOpen={onOpen}/>)}</div></section>}
    {model.processingPlans?.length > 0 && <section><h2>{t('加工方案')}</h2>{partialPlans && <p>{t('先显示 {shown} / {total} 个方案；完整数据载入后可筛选与排序。',{shown:model.processingPlans.length,total:model.totalProcessingPlans ?? model.processingPlans.length})}</p>}{!partialPlans && model.processingPlans.length > 1 && <div className="plan-filters"><label>{t('原材料')}<SearchableSelect value={ingredient} onChange={e => setIngredient(e.target.value)}><option value="">{t('全部原材料')}</option>{materials.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</SearchableSelect></label><label>{t('排序')}<SearchableSelect value={sort} onChange={e => setSort(e.target.value)}><option value="default">{t('游戏顺序')}</option><option value="net">{t('加工增值从高到低')}</option><option value="perDay">{t('每日增值从高到低')}</option><option value="duration">{t('耗时从短到长')}</option></SearchableSelect></label><span>{t('{count} 个方案',{count:plans.length})}</span></div>}{planRows.visible.map((plan, index) => <div className="processing-plan" key={plan.entity.id}>
      <div className="plan-heading"><h3>{planTitle(plan) || t('方案 {number}',{number:index + 1})}</h3><span>{durationText(Number(plan.entity.duration_minutes), t)}</span></div>
      {plan.profit && <div className="profit-grid"><span>{t('原料直接售价')}<strong>{plan.profit.inputCost}</strong></span><span>{t('产出价值')}<strong>{plan.profit.outputValue}</strong></span><span>{t('加工增值')}<strong>{plan.profit.net}</strong></span><span>{t('每日加工增值')}<strong>{plan.profit.perDay}</strong></span></div>}
      {plan.groups.filter((group) => ['materials','machines','unlocks'].includes(group.key)&&(group.key!=='machines'||machineIds(group.rows)!==sharedMachines)).map((group) => <div key={group.key}><h4>{group.key==='machines'?t('本方案适用机械'):group.label}</h4><div className="relation-list">{group.rows.map((row) => <RelationRow key={row.key} row={row} onOpen={onOpen} compact />)}</div></div>)}
    </div>)}<div ref={planRows.sentinel}>{planRows.more && <button type="button" className="load-more" onClick={planRows.loadMore}>{t('加载更多加工方案（{shown} / {total}）',{shown:planRows.visible.length,total:plans.length})}</button>}</div></section>}

    {profit && <section><h2>{entity.kind === 'processes' ? t('加工增值') : t('种植收益')}</h2><div className="profit-grid">
      <span>{entity.kind === 'processes' ? t('原料直接售价') : t('种子成本')}<strong>{profit.inputCost}</strong></span>
      <span>{t('产出价值')}<strong>{profit.outputValue}</strong></span>
      <span>{entity.kind === 'processes' ? t('加工增值') : t('净收益')}<strong>{profit.net}</strong></span>
      <span>{entity.kind === 'processes' ? t('每日加工增值') : t('每日净收益')}<strong>{profit.perDay}</strong></span>
      {profit.harvests && <span>{t('28 日内收获')}<strong>{t('{count} 次',{count:profit.harvests})}</strong></span>}
    </div><p className="calculation-note">{entity.kind === 'processes' ? t('加工增值＝产出售价－原料直接售价。') : t('按每天浇水、28 天完整季节、同一格地计算。')} {t('当前品质：{quality}。',{quality:model.qualityName})}</p></section>}

    {locations.length > 0 && <section><h2>{t('出现地点')}</h2><div className="location-list">{locations.map((location) => <div key={location.id}><span>{location.name}</span>{location.secondary && <small>{location.secondary}</small>}</div>)}</div></section>}

    {groups.filter(group=>group.key!=='machines').map((group) => <section key={group.key}><h2>{group.label}</h2><div className="relation-list">{group.rows.map((row) => <RelationRow key={row.key} row={row} onOpen={onOpen} />)}</div></section>)}

    {model.ingredientOptions.length>0&&<section><h2>{t('可替换材料')}</h2>{model.ingredientOptions.map((option,index)=><details key={index}><summary>{option.label} · {t('{count} 种',{count:option.rows.length})}</summary><div className="relation-list">{option.rows.map(row=><RelationRow key={row.key} row={row} onOpen={onOpen}/>)}</div></details>)}</section>}

    {import.meta.env.DEV && <details><summary>{t('别名与数据来源')}</summary><p>{entity.name.aliases.join(' · ')}</p><p>{t('游戏数据构建 25640656；中文优先使用游戏官方简体中文，缺失时由繁体中文转换，并保留日文和内部 ID。')}</p>{typeof entity.source === 'string' && entity.source && <p>{entity.source}</p>}</details>}
    <style>{`
      .plan-filters{display:flex;flex-wrap:wrap;align-items:end;gap:1rem}.plan-filters label{display:grid;gap:.4rem;min-width:160px}.entity-detail{max-width:960px}.aliases{color:var(--muted);margin-top:-.6rem}.entity-detail section{margin:2rem 0}.entity-detail h2{font-size:1.25rem;border-bottom:1px solid var(--border);padding-bottom:.55rem}
      .processing-plan{padding:1rem;border:1px solid var(--border);border-radius:12px;margin:.7rem 0}.processing-plan h3{margin-top:0}.processing-plan h4{margin:.8rem 0 .4rem}
      .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}.facts div{padding:.8rem;border-radius:10px;background:var(--paper-deep)}dt{font-size:.78rem;color:var(--muted)}dd{margin:.3rem 0 0;overflow-wrap:anywhere}
      .profit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.7rem}.profit-grid span{display:grid;gap:.4rem;padding:1rem;border:1px solid var(--border);border-radius:10px}.profit-grid strong{font-size:1.3rem;color:var(--gold)}.calculation-note{font-size:.86rem;color:var(--muted)}
      .location-list,.relation-list{display:grid;gap:.55rem}.location-list div{display:flex;justify-content:space-between;gap:1rem;padding:.8rem;border:1px solid var(--border);border-radius:10px}.location-list small{color:var(--muted)}
      .relation-row{display:grid;grid-template-columns:minmax(130px,1fr) auto minmax(130px,auto);align-items:center;gap:.35rem .8rem;padding:.65rem .8rem;border:1px solid var(--border);border-radius:10px;background:var(--paper-raised);color:var(--ink);text-decoration:none}.relation-row.has-icon{grid-template-columns:52px minmax(130px,1fr) auto minmax(130px,auto)}
      .relation-row:hover{border-color:var(--green);background:var(--green-soft)}.relation-row img{border-radius:8px;object-fit:contain;background:var(--paper-deep)}.relation-name{display:grid}.relation-name small,.relation-values small,.relation-note{color:var(--muted)}.relation-values{display:grid;text-align:right}.relation-quantity{color:var(--vermilion)}.relation-chips{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:.35rem}.relation-chips small{padding:.18rem .45rem;border-radius:999px;background:var(--paper-deep);color:var(--muted)}
      .relation-row.no-icon .relation-chips{grid-column:1/-1}
      .relation-row .relation-note{grid-column:1/-1;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.65;margin-top:.3rem;padding-top:.5rem;border-top:1px solid var(--border)}
      .entity-detail details{margin-top:2rem;padding:1rem;border:1px dashed var(--border);border-radius:10px}code{font-size:.78rem}
      @media(max-width:620px){.relation-row{grid-template-columns:1fr auto}.relation-row.has-icon{grid-template-columns:48px 1fr auto}.relation-row img{width:48px;height:48px}.relation-values{grid-column:1/-1;text-align:left}.relation-row.has-icon .relation-values,.relation-row.has-icon .relation-chips{grid-column:2/-1}.relation-row.no-icon .relation-chips{grid-column:1/-1}}
      .entity-detail .processing-plan{container-type:inline-size;padding:.8rem 1rem}
      .processing-plan .plan-heading{display:flex;align-items:center;justify-content:space-between;gap:.7rem;margin-bottom:.5rem}
      .processing-plan .plan-heading h3{font-size:1rem;margin:0}.processing-plan .plan-heading>span{font-size:.75rem;color:var(--muted);white-space:nowrap}
      .processing-plan .profit-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:.4rem;background:var(--paper-deep);border-radius:8px;padding:.25rem}
      .processing-plan .profit-grid>span{padding:.4rem .5rem;border:0;border-radius:0;font-size:.75rem;gap:.2rem;min-width:0;overflow-wrap:anywhere}
      .processing-plan .profit-grid strong{font-size:1.05rem}
      .entity-detail .processing-plan h4{font-size:.78rem;margin:.7rem 0 .25rem;color:var(--muted)}
      .processing-plan .relation-list{gap:0}
      .processing-plan .relation-row{grid-template-columns:minmax(0,1fr) auto minmax(70px,auto);border:0;border-bottom:1px solid var(--border);border-radius:0;padding:.4rem 0;background:transparent;gap:.2rem .5rem;font-size:.8rem}
      .processing-plan .relation-row:last-child{border-bottom:0}
      .processing-plan .relation-row.has-icon{grid-template-columns:32px minmax(0,1fr) auto minmax(70px,auto)}
      .processing-plan .relation-row img{width:32px;height:32px}
      .processing-plan .relation-row .relation-name{min-width:0;overflow-wrap:anywhere}
      .processing-plan .relation-row .relation-name small{font-size:.67rem}
      .processing-plan .relation-row .relation-values{grid-column:-2/-1;grid-row:1;text-align:right;font-size:.72rem}
      .processing-plan .relation-row .relation-quantity{grid-column:-3/-2;grid-row:1}
      .processing-plan .relation-row .relation-chips{grid-column:1/-1;font-size:.7rem}
      .processing-plan .relation-row .relation-note{font-size:.72rem;padding-top:.25rem;margin-top:0}
      @container(max-width:520px){.processing-plan .profit-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
  </article>;
}
