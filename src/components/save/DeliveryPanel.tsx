import { useMemo, useState } from 'react';
import { readDeliveries, UNLOCKS } from '../../lib/saveDeliveries';
import { flagEnabled, type ProgressEdits } from '../../lib/saveProgress';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import { itemLabel } from './ItemGrid';

const ranks = ['普通', '铜星', '银星', '金星', '品牌'];
export default function DeliveryPanel({ model, names, edits, onReplace }: {
  model: SaveModel; names: SaveNameTables; edits: ProgressEdits; onReplace: (edits: ProgressEdits) => void;
}) {
  const [selected, setSelected] = useState(13), [query, setQuery] = useState('');
  const rows = useMemo(() => readDeliveries(model.doc), [model]);
  const group = UNLOCKS.groups.find(g => g.id === selected)!;
  const bundles = UNLOCKS.bundles.filter(b => group.bundles.includes(b.id));
  const count = (key: string) => { const row = rows.get(key); return row ? edits.deliveries?.[key] ?? row.count - row.remain : 0; };
  const complete = (id: number) => UNLOCKS.bundles.find(b => b.id === id)!.items.every((r, i) => count(`${id}:${i}`) === r.count);
  const indexed = useMemo(() => UNLOCKS.groups.map(g => ({ ...g, search: buildSaveSearchText(g.name, ...UNLOCKS.bundles.filter(b => g.bundles.includes(b.id)).flatMap(b => [b.name, ...b.items.map(i => itemLabel(names, String(i.itemId)))])) })), [names]);
  const visible = indexed.filter(g => g.search.includes(normalizeSearch(query)));
  const open = flagEnabled(model.doc, UNLOCKS.catalogFlag, edits);
  function change(changes: Record<string, number | undefined>) {
    const deliveries = { ...edits.deliveries };
    for (const [key, value] of Object.entries(changes)) {
      const row = rows.get(key);
      if (!row) continue;
      if (value === undefined || value === row.count - row.remain) delete deliveries[key]; else deliveries[key] = value;
    }
    onReplace({ ...edits, deliveries });
  }
  function fill(id: number, leaveOne: boolean) {
    const bundle = UNLOCKS.bundles.find(b => b.id === id)!;
    change(Object.fromEntries(bundle.items.map((item, i) => [`${id}:${i}`, item.count - (leaveOne && i === bundle.items.length - 1 ? 1 : 0)])));
  }
  return <div className="save-delivery-layout">
    <aside className="save-delivery-sidebar">
      <div className="save-delivery-search"><input type="search" aria-label="搜索交付目录" placeholder="搜索目录或材料 · 支持拼音" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <nav className="save-delivery-list" aria-label="交付委托目录">{visible.map(g => <button key={g.id} type="button" aria-pressed={selected === g.id} onClick={() => setSelected(g.id)}><span>{g.name}</span><span className="save-unlock-state" data-state={g.bundles.every(complete) ? 'complete' : 'pending'}>{g.bundles.every(complete) ? '✓ 完成' : `${g.bundles.filter(complete).length} / ${g.bundles.length}`}</span></button>)}{!visible.length && <p>没有匹配的目录</p>}</nav>
      <div className="save-delivery-access"><span className="save-unlock-state" data-state={open ? 'complete' : 'pending'}>{open ? '✓ 交付目录已开放' : '◇ 交付目录未开放'}</span>{!open && <button type="button" onClick={() => onReplace({ ...edits, flags: { ...edits.flags, [UNLOCKS.catalogFlag]: true } })}>开放村长家的交付目录</button>}<small>开放后可查看八册分类委托。</small></div>
    </aside>
    <section className="save-delivery-detail" aria-label="交付目录详情">
      <header><div><span className="save-unlock-eyebrow">村长家的交付委托</span><h3>{group.name}</h3></div>{group.reward > 0 && <div className="save-delivery-reward"><SaveIcon names={names} kind="items" value={String(group.reward)} size={36} /><span><small>整册奖励</small>{itemLabel(names, String(group.reward))}</span></div>}</header>
      <p className="save-delivery-note">修改进度不会补发奖励。选择“留最后一件”，可回到游戏中完成最后一次交付并正常领奖。</p>
      <div className="save-delivery-scroll">{bundles.map(b => <article className="save-delivery-bundle" key={b.id}>
        <header><h4>{b.name}</h4><span className="save-unlock-state" data-state={complete(b.id) ? 'complete' : 'pending'}>{complete(b.id) ? '✓ 已交付' : '○ 交付中'}</span></header>
        <div className="save-delivery-materials">{b.items.map((item, i) => { const key = `${b.id}:${i}`, row = rows.get(key); return <label key={key} className={count(key) === item.count ? 'complete' : ''}>
          <SaveIcon names={names} kind="items" value={String(item.itemId)} size={44} /><span><strong>{itemLabel(names, String(item.itemId))}</strong><small>{row ? `${ranks[row.rank] ?? '未知品质'}${row.rank > 0 ? '及以上' : ''}` : '此存档没有该项记录'}</small></span>
          <span className="save-delivery-count"><small>已交付</small><span><input type="number" min="0" max={item.count} step="1" disabled={!row} aria-label={`${b.name} · ${itemLabel(names, String(item.itemId))}已交付数量`} value={count(key)} onChange={e => { const n = e.target.valueAsNumber; if (Number.isInteger(n)) change({ [key]: Math.max(0, Math.min(item.count, n)) }); }} /><span>/ {item.count}</span></span></span>
        </label>; })}</div>
        <footer><div className="save-delivery-reward"><SaveIcon names={names} kind="items" value={String(b.reward)} size={28} /><small>奖励：{itemLabel(names, String(b.reward))} × {b.rewardCount}</small></div><div className="save-delivery-buttons"><button type="button" onClick={() => fill(b.id, true)}>留最后一件</button><button type="button" onClick={() => fill(b.id, false)}>标记完成</button>{b.items.some((_, i) => edits.deliveries?.[`${b.id}:${i}`] !== undefined) && <button type="button" onClick={() => change(Object.fromEntries(b.items.map((_, i) => [`${b.id}:${i}`, undefined])))}>撤销</button>}</div></footer>
      </article>)}</div>
    </section>
  </div>;
}
