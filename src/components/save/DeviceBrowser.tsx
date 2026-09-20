import { useMemo, useState, type ReactNode } from 'react';
import { SHIPPING_BOX_ID, type SaveContainer } from '../../lib/saveItems';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { deviceEnabled, deviceIdentity, displayedItem, MACHINES, machineJobs, machineSpec, specialSpec, type MachineEdits } from '../../lib/saveMachines';
import SaveIcon from './SaveIcon';
import { itemLabel } from './ItemGrid';
import { ITEM_RANKS } from '../../lib/saveRules';

const SPECIAL_LABELS: Record<string, string> = { shared: '共享箱', display: '摆放设施', workbench: '工作台', anvil: '工具改造', quest: '任务设施', system: '专用物品箱' };
export function specialTitle(container: SaveContainer, names: SaveNameTables): string {
  const spec = specialSpec(container);
  return spec?.itemId ? itemLabel(names, String(spec.itemId)) : spec?.kind === 'quest' ? '任务蜂箱' : spec?.kind === 'anvil' ? '铁砧' : spec ? SPECIAL_LABELS[spec.kind] : container.title;
}

function ProductProgress({ job, names }: { job: ReturnType<typeof machineJobs>[number]; names: SaveNameTables }) {
  const occupied = job.seconds > 0;
  const ready = occupied && job.remaining === 0;
  const percent = occupied ? Math.max(0, Math.min(100, (1 - job.remaining / job.seconds) * 100)) : 0;
  const label = `加工栏位 ${job.index + 1}：${occupied ? `${itemLabel(names, String(job.output))} × ${job.count}，${ITEM_RANKS.find(rank => rank.value === job.rank)?.label ?? '未知品质'}，${ready ? '可以领取' : `进度 ${Math.round(percent)}%`}` : '空闲，可添加任务'}`;
  return <span className={`save-product-ring ${occupied ? ready ? 'is-ready' : 'is-working' : 'is-idle'}`} title={label}
    role={occupied ? 'progressbar' : 'img'} aria-label={label} aria-valuemin={occupied ? 0 : undefined} aria-valuemax={occupied ? 100 : undefined} aria-valuenow={occupied ? Math.round(percent) : undefined}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle className="save-product-ring-track" cx="20" cy="20" r="17" pathLength="100" />
      {occupied && <circle className="save-product-ring-fill" cx="20" cy="20" r="17" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - percent} transform="rotate(-90 20 20)" />}
    </svg>
    {occupied ? <SaveIcon names={names} kind="items" value={String(job.output)} size={26} rank={job.rank} /> : <span className="save-product-ring-empty" aria-hidden="true">+</span>}
    {ready && <span className="save-product-ring-ready" aria-hidden="true">✓</span>}
  </span>;
}

export default function DeviceBrowser({ model, names, edits, special = false, occupancy, children }: {
  model: SaveModel; names: SaveNameTables; edits: MachineEdits; special?: boolean;
  occupancy?: (container: SaveContainer) => number;
  children: (container: SaveContainer) => ReactNode;
}) {
  const [search, setSearch] = useState(''), [category, setCategory] = useState('all'), [status, setStatus] = useState('all');
  const [selected, setSelected] = useState('');
  const label = special ? '特殊容器' : '加工设备';
  const entries = useMemo(() => model.containers.flatMap(container => {
    const spec = machineSpec(container), extra = specialSpec(container);
    if (special ? !(extra || (container.kind === 'system' && container.id !== SHIPPING_BOX_ID)) : !spec) return [];
    if (container.dataId !== null && !deviceEnabled(model.doc, container)) return [];
    const title = special ? specialTitle(container, names) : itemLabel(names, String(spec!.itemId));
    const family = special ? extra?.kind ?? 'system' : spec!.family;
    const base = spec && MACHINES.machines.filter(row => row.family === family).sort((a, b) => a.id - b.id)[0];
    const group = special ? SPECIAL_LABELS[family] : itemLabel(names, String(base!.itemId));
    const identity = deviceIdentity(model.doc, container);
    return [{ container, title, family, group, identity, icon: special ? extra?.itemId ?? 0 : spec!.itemId,
      order: special ? Object.keys(SPECIAL_LABELS).indexOf(family) : base!.id,
      searchText: buildSaveSearchText(title, group, identity, String(container.dataId ?? ''), container.customName) }];
  }).sort((a, b) => a.order - b.order || (a.container.dataId ?? 0) - (b.container.dataId ?? 0) || a.identity.localeCompare(b.identity, undefined, { numeric: true })), [model, names, special]);
  const enriched = useMemo(() => entries.map(entry => {
    const jobs = special ? [] : machineJobs(model.doc, entry.container, edits);
    const collector = machineSpec(entry.container)?.mode === 'collector';
    const products = jobs.filter(job => job.seconds > 0);
    const state = collector ? entry.container.used ? 'ready' : 'idle' : products.some(job => !job.remaining) ? 'ready' : products.length ? 'working' : 'idle';
    const productSearch = buildSaveSearchText(...products.map(job => itemLabel(names, String(job.output))));
    return { ...entry, jobs, collector, products, state, productSearch };
  }), [entries, model, edits, names, special]);
  const query = normalizeSearch(search);
  const shown = enriched.filter(entry => (category === 'all' || entry.family === category) && (status === 'all' || entry.state === status) && `${entry.searchText} ${entry.productSearch}`.includes(query));
  const groups = [...new Map(entries.map(entry => [entry.family, entry.group])).entries()];
  const active = enriched.find(entry => entry.container.id === selected);
  return <section className="save-device-browser" aria-label={label}>
    <div className="save-device-toolbar">
      <input type="search" aria-label={`搜索${label}`} placeholder="名称、产品、拼音或 ID" value={search} onChange={event => setSearch(event.target.value)} />
      <select aria-label={`${label}类别`} value={category} onChange={event => setCategory(event.target.value)}><option value="all">全部类别</option>{groups.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
      {!special && <select aria-label="设备状态" value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部状态</option><option value="working">加工中</option><option value="ready">可以领取</option><option value="idle">空闲</option></select>}
      <span>{shown.length} / {entries.length} {special ? '个' : '台'}</span>
    </div>
    <div className="save-device-scroll" tabIndex={0} aria-label={`${label}列表`}>
      {groups.map(([family, group]) => {
        const members = shown.filter(entry => entry.family === family);
        return members.length ? <section className="save-device-group" key={family}>
          <h3>{group}<small>{members.length} {special ? '个' : '台'}</small></h3>
          <div className="save-device-grid">{members.map(entry => <button type="button" key={entry.container.id} data-device-id={entry.container.id} className="save-device-card" aria-expanded={selected === entry.container.id} aria-controls="save-device-detail" onClick={() => setSelected(entry.container.id)}>
            <span className="save-device-art">{entry.icon ? <SaveIcon names={names} kind="items" value={String(entry.icon)} size={52} /> : <span className="save-device-symbol" aria-hidden="true">{entry.family === 'anvil' ? '⚒' : '▣'}</span>}</span>
            <strong>{entry.title}</strong><small className="save-device-id">{entry.container.dataId !== null ? `#${entry.identity}` : '共用物品栏'}</small>
            <span className={`save-device-products${!special && !entry.collector ? ' is-processing' : ''}`}>{special ? <span>{(occupancy?.(entry.container) ?? entry.container.used) ? `${occupancy?.(entry.container) ?? entry.container.used} 格有物品` : entry.family === 'display' && displayedItem(model.doc, entry.container) ? itemLabel(names, String(displayedItem(model.doc, entry.container))) : '暂无物品'}</span> : entry.collector ? <span>{entry.container.used ? `已收集 ${entry.container.used} 格物品` : '等待收集畜产品'}</span> : entry.jobs.map(job => <ProductProgress key={job.index} job={job} names={names} />)}</span>
          </button>)}</div>
        </section> : null;
      })}
      {!shown.length && <p className="save-device-empty">{entries.length ? '没有符合条件的项目。' : `存档中没有${label}。`}</p>}
    </div>
    {active ? <section className="save-device-detail" id="save-device-detail" aria-label={`${active.title}详情`}>
      <header><div><h3>{active.title}</h3><p>{active.container.dataId !== null ? `${special ? '容器' : '设备'} ID ${active.identity} · 设施 ID ${active.container.dataId}` : '专用物品箱'}</p></div><button type="button" aria-label="关闭设备详情" onClick={() => setSelected('')}>×</button></header>
      <div className="save-device-detail-body">{children(active.container)}</div>
    </section> : <p className="save-device-hint">选择上方{special ? '容器' : '设备'}，在这里查看{special ? '内容' : '加工详情'}。</p>}
  </section>;
}

export function SpecialContents({ model, container, names }: { model: SaveModel; container: SaveContainer; names: SaveNameTables }) {
  const spec = specialSpec(container);
  const placed = displayedItem(model.doc, container);
  const items = placed ? [{ itemId: String(placed), count: '1' }] : container.slots.flatMap(slot => slot.item ? [slot.item] : []);
  const descriptions: Record<string, string> = {
    display: '摆放和取出物品请在游戏中操作。', workbench: '在游戏中选择配方进行制作。',
    anvil: '在游戏中选择工具进行改造；建造材料可在“建造材料箱”中修改。', quest: '任务专用蜂箱，随任务进度使用。',
  };
  return <div className="save-special-contents"><p>{descriptions[spec?.kind ?? '']}</p>
    {items.length ? <div className="save-collected-grid">{items.map((item, index) => <div key={index}><SaveIcon names={names} kind="items" value={item.itemId} size={40} /><span>{itemLabel(names, item.itemId)}<small>× {item.count}</small></span></div>)}</div> : <p className="save-device-hint">暂无物品</p>}
  </div>;
}
