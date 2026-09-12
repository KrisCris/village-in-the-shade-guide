import { useEffect, useMemo, useState } from 'react';
import { PROGRESSION, flagEnabled, readEncyclopedia, readSkills, type ProgressEdits, type ProgressToggleGroup } from '../../lib/saveProgress';
import ShrinePanel from './ShrinePanel';
import DeliveryPanel from './DeliveryPanel';
import { UNLOCKS } from '../../lib/saveDeliveries';
import { changeShrine } from '../../lib/saveShrine';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';
import SaveIcon from './SaveIcon';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { useProgressiveRows } from '../table/useProgressiveRows';

export default function ProgressPanel({ model, edits, names, onChange, onReplace }: {
  model: SaveModel; edits: ProgressEdits; names: SaveNameTables; onChange: (group: ProgressToggleGroup, id: string, value: boolean | undefined) => void; onReplace: (edits: ProgressEdits) => void;
}) {
  const [tab, setTab] = useState('encyclopedia'), [query, setQuery] = useState(''), [category, setCategory] = useState(''), [filter, setFilter] = useState('all');
  const [manualLoad, setManualLoad] = useState(false);
  useEffect(() => setManualLoad(!('IntersectionObserver' in window)), []);
  const known = useMemo(() => readEncyclopedia(model.doc), [model]);
  const skills = useMemo(() => readSkills(model.doc), [model]);
  const rows = useMemo(() => {
    if (tab === 'encyclopedia') return Object.entries(names.names?.items ?? {}).filter(([, name]) => !name.includes('基底')).map(([id, name]) => ({ id, name, item: id, category: names.itemCategories?.[id] ?? '', description: '', original: known.has(id) }));
    if (tab === 'skills') return PROGRESSION.skills.map(skill => ({ id: String(skill.id), name: skill.name, item: '', category: '', description: skill.description, original: skills.has(String(skill.id)) }));
    const flags = new Map<number, typeof PROGRESSION.recipes>();
    for (const recipe of PROGRESSION.recipes) flags.set(recipe.flag, [...flags.get(recipe.flag) ?? [], recipe]);
    return [...flags].map(([flag, recipes]) => ({ id: String(flag), name: recipes.map(recipe => itemLabel(names, String(recipe.itemId))).join('、'), item: String(recipes[0].itemId), category: recipes[0].category, description: recipes.length > 1 ? `此配方同时解锁 ${recipes.length} 种物品。` : '', original: flagEnabled(model.doc, flag) }));
  }, [model, names, tab, known, skills]);
  const group: ProgressToggleGroup = tab === 'recipes' ? 'flags' : tab === 'skills' ? 'skills' : 'encyclopedia';
  const indexed = useMemo(() => rows.map(row => ({ ...row, searchText: buildSaveSearchText(row.name, row.id, row.item) })), [rows]);
  const enabled = (row: typeof rows[number]) => edits[group]?.[row.id] ?? row.original;
  const needle = normalizeSearch(query);
  const matches = useMemo(() => indexed.filter(row => (!category || row.category === category) && row.searchText.includes(needle) && (filter === 'all' || (edits[group]?.[row.id] ?? row.original) === (filter === 'yes'))), [indexed, category, needle, filter, edits, group]);
  const { visible, sentinel, more, loadMore } = useProgressiveRows(matches, 80, JSON.stringify([tab, needle, category, filter]));
  const toggle = (row: typeof rows[number], value: boolean) => {
    const node = tab === 'recipes' && UNLOCKS.nodes.find(n => String(n.flag) === row.id);
    if (node) onReplace(changeShrine(model.doc, edits, node.id, value));
    else onChange(group, row.id, value === row.original ? undefined : value);
  };
  return <section className="save-progress">
    <nav className="save-progress-tabs" aria-label="收集与解锁分类">{[['encyclopedia', '图鉴'], ['recipes', '配方'], ['shrine', '神龛技能树'], ['deliveries', '交付委托']].map(([id, name]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setCategory(''); setQuery(''); }}>{name}</button>)}</nav>
    {tab === 'shrine' ? <ShrinePanel model={model} names={names} edits={edits} onReplace={onReplace} /> : tab === 'deliveries' ? <DeliveryPanel model={model} names={names} edits={edits} onReplace={onReplace} /> : <>
    <div className="save-progress-toolbar">
      <input type="search" aria-label="搜索收集项目" placeholder="名称、拼音或首字母" value={query} onChange={event => setQuery(event.target.value)} />
      {tab !== 'skills' && <select aria-label="收集项目分类" value={category} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option>
        {Object.entries(tab === 'recipes' ? { 手作配方: '手作配方', 料理配方: '料理配方' } : names.categories ?? {}).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>}
      <select aria-label="解锁状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部状态</option><option value="yes">已解锁</option><option value="no">未解锁</option></select>
      <span>{rows.filter(enabled).length} / {rows.length} 已解锁</span>
    </div>
    {tab === 'encyclopedia' && <div className="save-progress-bulk"><button type="button" onClick={() => matches.forEach(row => toggle(row, true))}>将当前 {matches.length} 项标记为已发现</button><small>只修改图鉴记录，不会向背包添加物品。</small></div>}
    <div className="save-progress-grid">{visible.map(row => <label className="save-progress-card" key={row.id}>
      {row.item && <SaveIcon names={names} kind="items" value={row.item} size={36} />}
      <span><strong>{row.name}</strong>{row.description && <small>{row.description}</small>}</span>
      <input type="checkbox" aria-label={row.name} checked={enabled(row)} onChange={event => toggle(row, event.target.checked)} />
    </label>)}</div>
    {!matches.length && <p className="save-tab-empty">没有匹配的项目。</p>}
    <div ref={sentinel} className="save-progress-sentinel">{more && (manualLoad ? <button type="button" className="save-load-more" onClick={loadMore}>加载更多（{visible.length} / {matches.length}）</button> : <small>已显示 {visible.length} / {matches.length} 项</small>)}</div></>}
  </section>;
}
