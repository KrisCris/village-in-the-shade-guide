import type { Entity } from '../../data/types';
import { kindLabels } from '../../data/types';
import type { EntityDetailModel } from '../../domain/relations';
import RelationRow from './RelationRow';

export default function EntityDetail({ model, onOpen }: { model: EntityDetailModel; onOpen?: (entity: Entity) => void }) {
  const { entity, facts, profit, groups, locations } = model;
  return <article className="entity-detail">
    <p className="eyebrow">{kindLabels[entity.kind] ?? entity.kind}</p>
    <h1>{entity.name.zh_hans}</h1>
    <p className="aliases">繁中：{entity.name.zh_hant || '—'}　日文：{entity.name.ja || '—'}</p>

    <section><h2>基础数据</h2><dl className="facts">{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.price ? 'price' : ''}>{fact.value}</dd></div>)}</dl></section>

    {profit && <section><h2>收益</h2><div className="profit-grid">
      <span>种子 / 原料成本<strong>{profit.inputCost}</strong></span>
      <span>产出价值<strong>{profit.outputValue}</strong></span>
      <span>净收益<strong>{profit.net}</strong></span>
      <span>每日净收益<strong>{profit.perDay}</strong></span>
      {profit.harvests && <span>28 日内收获<strong>{profit.harvests} 次</strong></span>}
    </div><p className="calculation-note">{entity.kind === 'processes' ? '净收益使用原料直接出售的机会成本。' : '按每天浇水、28 天完整季节、同一格地计算。'} 当前品质：{model.qualityName}。</p></section>}

    {locations.length > 0 && <section><h2>出现地点</h2><div className="location-list">{locations.map((location) => <div key={location.id}><span>{location.name}</span><small>{location.secondary}</small></div>)}</div></section>}

    {groups.map((group) => <section key={group.key}><h2>{group.label}</h2><div className="relation-list">{group.rows.map((row) => <RelationRow key={row.key} row={row} onOpen={onOpen} />)}</div></section>)}

    <details><summary>别名与数据来源</summary><p>{entity.name.aliases.join(' · ')}</p><p>游戏数据构建 24969282；中文由游戏内繁体中文转换并保留日文和内部 ID。</p></details>
    <style>{`
      .entity-detail{max-width:960px}.aliases{color:var(--muted);margin-top:-.6rem}.entity-detail section{margin:2rem 0}.entity-detail h2{font-size:1.25rem;border-bottom:1px solid var(--border);padding-bottom:.55rem}
      .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}.facts div{padding:.8rem;border-radius:10px;background:var(--paper-deep)}dt{font-size:.78rem;color:var(--muted)}dd{margin:.3rem 0 0;overflow-wrap:anywhere}
      .profit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.7rem}.profit-grid span{display:grid;gap:.4rem;padding:1rem;border:1px solid var(--border);border-radius:10px}.profit-grid strong{font-size:1.3rem;color:var(--gold)}.calculation-note{font-size:.86rem;color:var(--muted)}
      .location-list,.relation-list{display:grid;gap:.55rem}.location-list div{display:flex;justify-content:space-between;gap:1rem;padding:.8rem;border:1px solid var(--border);border-radius:10px}.location-list small{color:var(--muted)}
      .relation-row{display:grid;grid-template-columns:52px minmax(130px,1fr) auto minmax(130px,auto);align-items:center;gap:.35rem .8rem;padding:.65rem .8rem;border:1px solid var(--border);border-radius:10px;background:var(--paper-raised);color:var(--ink);text-decoration:none}
      .relation-row:hover{border-color:var(--green);background:var(--green-soft)}.relation-row img{border-radius:8px;object-fit:contain;background:var(--paper-deep)}.relation-name{display:grid}.relation-name small,.relation-values small,.relation-note{color:var(--muted)}.relation-values{display:grid;text-align:right}.relation-quantity{color:var(--vermilion)}.relation-chips{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:.35rem}.relation-chips small{padding:.18rem .45rem;border-radius:999px;background:var(--paper-deep);color:var(--muted)}
      details{margin-top:2rem;padding:1rem;border:1px dashed var(--border);border-radius:10px}code{font-size:.78rem}
      @media(max-width:620px){.relation-row{grid-template-columns:48px 1fr auto}.relation-row img{width:48px;height:48px}.relation-values{grid-column:2/-1;text-align:left}.relation-chips{grid-column:2/-1}}
    `}</style>
  </article>;
}
