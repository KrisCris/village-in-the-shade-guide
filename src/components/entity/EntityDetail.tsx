import type { Entity } from '../../data/types';
import { kindLabels } from '../../data/types';
import type { EntityDetailModel } from '../../domain/relations';
import RelationRow from './RelationRow';

export default function EntityDetail({ model, onOpen }: { model: EntityDetailModel; onOpen?: (entity: Entity) => void }) {
  const { entity, facts, profit, groups, locations } = model;
  return <article className="entity-detail">
    <p className="eyebrow">{entity.category_name?.zh_hans || kindLabels[entity.kind] || entity.kind}</p>
    <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>{entity.icon_path && <img key={entity.id} src={entity.icon_path} alt="" width="88" height="88" style={{objectFit:'contain',borderRadius:12}} />}<h1>{entity.name.zh_hans}</h1></div>
    <p className="aliases">繁中：{entity.name.zh_hant || '—'}　日文：{entity.name.ja || '—'}</p>
    {entity.kind!=='quests'&&typeof entity.description==='string'&&entity.description&&<p style={{whiteSpace:'pre-line',lineHeight:1.7}}>{entity.description}</p>}

    {entity.kind==='quests' && <section><h2>任务目标</h2><p>{String(entity.description ?? '')}</p><p>{String(entity.objective ?? '')}</p>{((entity.steps ?? []) as string[]).length>0&&<ol>{((entity.steps ?? []) as string[]).map((step,index)=><li key={index}>{step}</li>)}</ol>}</section>}
    {Array.isArray(entity.map_locations)&&entity.map_locations.length>0&&<section><h2>拾取位置</h2>{(entity.map_locations as {label:string;x:number;y:number;anchor:string;progress:string}[]).map(location=><p key={location.anchor}><a href={`/guides/collection-map/#${location.anchor}`}>{location.label} · 图书 {location.anchor.slice(-2)} · 查看地图</a><br/><small>关联进度：{location.progress}</small></p>)}</section>}

    <section><h2>基础数据</h2><dl className="facts">{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.price ? 'price' : ''}>{fact.value}</dd></div>)}</dl></section>
    {model.processingPlans?.length > 0 && <section><h2>加工方案</h2>{model.processingPlans.map((plan, index) => <div className="processing-plan" key={plan.entity.id}>
      <h3>方案 {index + 1} · {Number(plan.entity.duration_minutes)} 分钟</h3>
      {plan.profit && <div className="profit-grid"><span>原料直接售价<strong>{plan.profit.inputCost}</strong></span><span>产出价值<strong>{plan.profit.outputValue}</strong></span><span>加工增值<strong>{plan.profit.net}</strong></span><span>每日加工增值<strong>{plan.profit.perDay}</strong></span></div>}
      {plan.groups.filter((group) => ['materials','machines','unlocks'].includes(group.key)).map((group) => <div key={group.key}><h4>{group.label}</h4><div className="relation-list">{group.rows.map((row) => <RelationRow key={row.key} row={row} onOpen={onOpen} />)}</div></div>)}
    </div>)}</section>}

    {profit && <section><h2>{entity.kind === 'processes' ? '加工增值' : '种植收益'}</h2><div className="profit-grid">
      <span>{entity.kind === 'processes' ? '原料直接售价' : '种子成本'}<strong>{profit.inputCost}</strong></span>
      <span>产出价值<strong>{profit.outputValue}</strong></span>
      <span>{entity.kind === 'processes' ? '加工增值' : '净收益'}<strong>{profit.net}</strong></span>
      <span>{entity.kind === 'processes' ? '每日加工增值' : '每日净收益'}<strong>{profit.perDay}</strong></span>
      {profit.harvests && <span>28 日内收获<strong>{profit.harvests} 次</strong></span>}
    </div><p className="calculation-note">{entity.kind === 'processes' ? '加工增值＝产出售价－原料直接售价。' : '按每天浇水、28 天完整季节、同一格地计算。'} 当前品质：{model.qualityName}。</p></section>}

    {locations.length > 0 && <section><h2>出现地点</h2><div className="location-list">{locations.map((location) => <div key={location.id}><span>{location.name}</span><small>{location.secondary}</small></div>)}</div></section>}

    {groups.map((group) => <section key={group.key}><h2>{group.label}</h2><div className="relation-list">{group.rows.map((row) => <RelationRow key={row.key} row={row} onOpen={onOpen} />)}</div></section>)}

    <details><summary>别名与数据来源</summary><p>{entity.name.aliases.join(' · ')}</p><p>游戏数据构建 24969282；中文由游戏内繁体中文转换并保留日文和内部 ID。</p>{typeof entity.source === 'string' && entity.source && <p>{entity.source}</p>}</details>
    <style>{`
      .entity-detail{max-width:960px}.aliases{color:var(--muted);margin-top:-.6rem}.entity-detail section{margin:2rem 0}.entity-detail h2{font-size:1.25rem;border-bottom:1px solid var(--border);padding-bottom:.55rem}
      .processing-plan{padding:1rem;border:1px solid var(--border);border-radius:12px;margin:.7rem 0}.processing-plan h3{margin-top:0}.processing-plan h4{margin:.8rem 0 .4rem}
      .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}.facts div{padding:.8rem;border-radius:10px;background:var(--paper-deep)}dt{font-size:.78rem;color:var(--muted)}dd{margin:.3rem 0 0;overflow-wrap:anywhere}
      .profit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.7rem}.profit-grid span{display:grid;gap:.4rem;padding:1rem;border:1px solid var(--border);border-radius:10px}.profit-grid strong{font-size:1.3rem;color:var(--gold)}.calculation-note{font-size:.86rem;color:var(--muted)}
      .location-list,.relation-list{display:grid;gap:.55rem}.location-list div{display:flex;justify-content:space-between;gap:1rem;padding:.8rem;border:1px solid var(--border);border-radius:10px}.location-list small{color:var(--muted)}
      .relation-row{display:grid;grid-template-columns:minmax(130px,1fr) auto minmax(130px,auto);align-items:center;gap:.35rem .8rem;padding:.65rem .8rem;border:1px solid var(--border);border-radius:10px;background:var(--paper-raised);color:var(--ink);text-decoration:none}.relation-row.has-icon{grid-template-columns:52px minmax(130px,1fr) auto minmax(130px,auto)}
      .relation-row:hover{border-color:var(--green);background:var(--green-soft)}.relation-row img{border-radius:8px;object-fit:contain;background:var(--paper-deep)}.relation-name{display:grid}.relation-name small,.relation-values small,.relation-note{color:var(--muted)}.relation-values{display:grid;text-align:right}.relation-quantity{color:var(--vermilion)}.relation-chips{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:.35rem}.relation-chips small{padding:.18rem .45rem;border-radius:999px;background:var(--paper-deep);color:var(--muted)}
      .relation-row.no-icon .relation-chips{grid-column:1/-1}
      details{margin-top:2rem;padding:1rem;border:1px dashed var(--border);border-radius:10px}code{font-size:.78rem}
      @media(max-width:620px){.relation-row{grid-template-columns:1fr auto}.relation-row.has-icon{grid-template-columns:48px 1fr auto}.relation-row img{width:48px;height:48px}.relation-values{grid-column:1/-1;text-align:left}.relation-row.has-icon .relation-values,.relation-row.has-icon .relation-chips{grid-column:2/-1}.relation-row.no-icon .relation-chips{grid-column:1/-1}}
    `}</style>
  </article>;
}
