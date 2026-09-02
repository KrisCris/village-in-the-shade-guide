import type { Catalog, Entity } from '../../data/types';
import { kindLabels } from '../../data/types';
import { calculateCropProfit, calculateProcessProfit } from '../../domain/profit';

const labels: Record<string, string> = {
  buy_price: '买入价', sell_price: '卖出价', numeric_id: '数据编号', seasons: '生长季节',
  duration_minutes: '加工时间', role_ja: '身份（日文）', preference: '喜好等级', quantity: '数量',
  growth_points: '成熟所需成长点', growth_days: '首次成熟', regrow_points: '再生所需成长点', regrow_days: '再次收获', harvests_per_season: '单季最多收获', season_profit: '单季净收益',
};
const seasonLabels: Record<string, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const relationLabels: Record<string, string> = {
  item_id: '物品', related_item_id: '关联作物', seed_item_ids: '所需种子', harvest_item_ids: '收获物',
  machine_id: '使用机械', machine_ids: '使用机械', inputs: '原料', output: '产物', gift_items: '喜好礼物',
  used_by: '用于此配方 / 加工 / 商店',
};

function collectRelations(value: unknown, catalog: Catalog, key = ''): Array<{ entity: Entity; quantity?: number; note?: string; role: string }> {
  const found: Array<{ entity: Entity; quantity?: number; note?: string; role: string }> = [];
  if (typeof value === 'string' && (key.endsWith('_id') || key.endsWith('_ids'))) {
    const entity = catalog.byId[value]; if (entity) found.push({ entity, role: key });
  } else if (Array.isArray(value)) {
    for (const item of value) found.push(...collectRelations(item, catalog, key));
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [childKey, child] of Object.entries(record)) {
      for (const relation of collectRelations(child, catalog, childKey)) found.push({ ...relation, quantity: typeof record.quantity === 'number' ? record.quantity : relation.quantity, note: typeof record.preference === 'number' ? `喜好等级 ${record.preference}` : relation.note });
    }
  }
  return found;
}

function processProfit(entity: Entity, catalog: Catalog) {
  if (entity.kind !== 'processes') return null;
  const inputs = (entity.inputs ?? []) as Array<{ item_id: string; quantity: number }>;
  const output = entity.output as { item_id: string; quantity: number } | undefined;
  if (!output) return null;
  const inputCost = inputs.reduce((sum, input) => sum + Number(catalog.byId[input.item_id]?.sell_price ?? 0) * input.quantity, 0);
  const outputValue = Number(catalog.byId[output.item_id]?.sell_price ?? 0) * output.quantity;
  return calculateProcessProfit({ inputCost, outputValue, durationMinutes: entity.duration_minutes as number | null });
}

function cropProfit(entity: Entity, catalog: Catalog) {
  if (entity.kind !== 'crops') return null;
  const seedId = (entity.seed_item_ids as string[] | undefined)?.[0];
  const harvestId = (entity.harvest_item_ids as string[] | undefined)?.[0];
  if (!seedId || !harvestId) return null;
  return calculateCropProfit({ seedCost: Number(catalog.byId[seedId]?.buy_price ?? 0), harvestValue: Number(catalog.byId[harvestId]?.sell_price ?? 0), growthDays: entity.growth_days as number | null, regrowDays: entity.regrow_days as number | null });
}

export default function EntityDetail({ entity, catalog, onOpen }: { entity: Entity; catalog: Catalog; onOpen?: (entity: Entity) => void }) {
  const outbound = collectRelations(entity, catalog);
  const inbound = catalog.entities
    .filter((candidate) => candidate.id !== entity.id && candidate.name && collectRelations(candidate, catalog).some((relation) => relation.entity.id === entity.id))
    .map((candidate) => ({ entity: candidate, role: 'used_by', quantity: undefined as number | undefined, note: undefined as string | undefined }));
  const relations = [...outbound, ...inbound].filter((entry, index, all) => all.findIndex((other) => other.entity.id === entry.entity.id && other.role === entry.role) === index);
  const profit = processProfit(entity, catalog) ?? cropProfit(entity, catalog);
  const locations = (entity.locations ?? []) as Array<{ location_id: string; name: { zh_hans: string; ja?: string } }>;
  const simpleFields = Object.entries(entity).filter(([key, value]) => ['buy_price', 'sell_price', 'numeric_id', 'duration_minutes', 'role_ja', 'seasons', 'growth_points', 'growth_days', 'regrow_points', 'regrow_days', 'harvests_per_season', 'season_profit'].includes(key) && value != null);
  return <article className="entity-detail">
    <p className="eyebrow">{kindLabels[entity.kind] ?? entity.kind}</p>
    <h1>{entity.name.zh_hans}</h1>
    <p className="aliases">繁中：{entity.name.zh_hant || '—'}　日文：{entity.name.ja || '—'}</p>
    <section><h2>基础数据</h2><dl className="facts">
      {simpleFields.map(([key, value]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd className={key.includes('price') || key.includes('profit') ? 'price' : ''}>{Array.isArray(value) ? value.map((v) => seasonLabels[String(v)] ?? String(v)).join('、') : key === 'duration_minutes' ? `${value} 分钟（约 ${Math.ceil(Number(value) / 1440)} 日）` : key.endsWith('_days') ? `${value} 日` : String(value)}</dd></div>)}
      <div><dt>内部 ID</dt><dd><code>{entity.id}</code></dd></div>
    </dl></section>
    {profit && <section><h2>收益速算</h2><div className="profit-grid"><span>种子 / 原料成本<strong>{profit.inputCost}</strong></span><span>产出价值<strong>{profit.outputValue}</strong></span><span>净收益<strong>{profit.net}</strong></span><span>每日净收益<strong>{profit.perDay == null ? '数据不足' : profit.perDay.toFixed(1)}</strong></span>{profit.harvests && <span>28 日内收获<strong>{profit.harvests} 次</strong></span>}</div><p className="muted">加工按“若直接卖掉原料”的机会成本计算；作物按每天浇水、28 天完整季节、普通品质、同一格地计算，成长点每浇水日增加 100。</p></section>}
    {locations.length > 0 && <section><h2>出现地点</h2><div className="relations">{locations.map((location) => <div className="relation-static" key={location.location_id}><span>{location.name.zh_hans}</span><small>{location.name.ja || location.location_id}</small></div>)}</div></section>}
    {relations.length > 0 && <section><h2>获取、材料与用途</h2><div className="relations">{relations.map(({ entity: target, quantity, note, role }, index) => {
      const body = <><span>{target.name.zh_hans}</span>{quantity ? <b>×{quantity}</b> : null}<small>{relationLabels[role] ?? role.replaceAll('_', ' ')}{note ? ` · ${note}` : ''}</small></>;
      return onOpen ? <button key={`${role}:${target.id}:${index}`} onClick={() => onOpen(target)}>{body}</button> : <a key={`${role}:${target.id}:${index}`} href={`/data/${target.kind}/${encodeURIComponent(target.id)}/`}>{body}</a>;
    })}</div></section>}
    <details><summary>别名与数据来源</summary><p>{entity.name.aliases.join(' · ')}</p><p>游戏数据构建 24969282；中文优先采用游戏内繁体中文并转为简体，保留日文及内部 ID 便于核对。</p></details>
    <style>{`
      .entity-detail{max-width:960px}.aliases{color:var(--muted);margin-top:-.6rem}.entity-detail section{margin:2rem 0}.entity-detail h2{font-size:1.25rem;border-bottom:1px solid var(--border);padding-bottom:.55rem}
      .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}.facts div{padding:.8rem;border-radius:10px;background:var(--paper-deep)}dt{font-size:.78rem;color:var(--muted)}dd{margin:.3rem 0 0;overflow-wrap:anywhere}
      .profit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.7rem}.profit-grid span{display:grid;gap:.4rem;padding:1rem;border:1px solid var(--border);border-radius:10px}.profit-grid strong{font-size:1.3rem;color:var(--gold)}
      .relations{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.6rem}.relations a,.relations button,.relation-static{display:grid;grid-template-columns:1fr auto;gap:.2rem .5rem;text-align:left;padding:.8rem;border:1px solid var(--border);border-radius:10px;background:var(--paper-raised);color:var(--ink);text-decoration:none}.relations small{grid-column:1/-1;color:var(--muted)}
      details{margin-top:2rem;padding:1rem;border:1px dashed var(--border);border-radius:10px}code{font-size:.78rem}
    `}</style>
  </article>;
}
