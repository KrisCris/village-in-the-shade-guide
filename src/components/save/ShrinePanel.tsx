import SearchableSelect from '../controls/SearchableSelect';
import type { MaterialRequest } from '../../lib/saveInventory';
import { shrineLearningMaterials, shrineRecipeMaterials } from '../../lib/shrineMaterials';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UNLOCKS } from '../../lib/saveDeliveries';
import { changeShrine, shrineEnabled, shrineRelated, shrineLevel } from '../../lib/saveShrine';
import { PROGRESSION, type ProgressEdits } from '../../lib/saveProgress';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { withBase } from '../../lib/sitePath';
import SaveIcon from './SaveIcon';
import { itemLabel } from './ItemGrid';
import { tr } from '../../i18n/active';

const topLevel = Math.max(...UNLOCKS.nodes.map(node => node.y));
const position = (node: typeof UNLOCKS.nodes[number]) => ({ x: (node.x + 5) * 112 + 64, y: (topLevel - node.y) * 112 + 64 });
export default function ShrinePanel({ model, names, edits = {}, onReplace, onMaterials }: {
  model?: SaveModel; names: SaveNameTables; edits?: ProgressEdits; onReplace?: (edits: ProgressEdits) => void; onMaterials?: (materials: MaterialRequest[]) => void;
}) {
  const [selected, setSelected] = useState(1), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [popup, setPopup] = useState({ left: 16, top: 16 });
  const detailRef = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const level = useMemo(() => model ? shrineLevel(model.doc) : null, [model]);
  const node = UNLOCKS.nodes.find(n => n.id === selected)!;
  const indexed = useMemo(() => UNLOCKS.nodes.map(n => ({ ...n, search: buildSaveSearchText(n.name, n.description, ...PROGRESSION.recipes.filter(r => r.flag === n.flag).map(r => itemLabel(names, String(r.itemId)))) })), [names]);
  const enabled = (id: number) => model ? shrineEnabled(model.doc, id, edits) : false;
  const needle = normalizeSearch(query);
  const matches = indexed.filter(n => n.search.includes(needle) && (filter === 'all' || enabled(n.id) === (filter === 'yes')));
  const matching = new Set(matches.map(n => n.id));
  const unlocked = enabled(selected);
  const affected = shrineRelated(selected, !unlocked).filter(id => enabled(id) === unlocked);
  const recipes = PROGRESSION.recipes.filter(r => r.flag === node.flag);
  function locate(id: number, open = false) {
    setSelected(id);
    const target = UNLOCKS.nodes.find(n => n.id === id)!;
    const p = position(target), view = viewport.current;
    if (view) setCamera(c => ({ ...c, x: view.clientWidth / 2 - p.x * c.scale, y: view.clientHeight / 2 - p.y * c.scale }));
    if (open) { setPopup({ left: 16, top: 16 }); setShowDetail(true); }
  }
  function zoom(factor: number, px?: number, py?: number) {
    const view = viewport.current; if (!view) return;
    const x = px ?? view.clientWidth / 2, y = py ?? view.clientHeight / 2;
    setCamera(c => { const scale = Math.min(1.8, Math.max(.35, c.scale * factor)), ratio = scale / c.scale; return { scale, x: x - (x - c.x) * ratio, y: y - (y - c.y) * ratio }; });
  }
  useEffect(() => {
    const view = viewport.current; if (!view) return;
    let previous = { width: 0, height: 0 };
    const observer = new ResizeObserver(() => {
      const width = view.clientWidth, height = view.clientHeight, old = previous;
      previous = { width, height };
      setPopup(p => ({ ...p, left: Math.max(12, Math.min(p.left, width - Math.min(340, width - 24) - 12)) }));
      setCamera(c => old.width ? { ...c, x: c.x + (width - old.width) / 2, y: c.y + (height - old.height) / 2 } : { ...c, x: width / 2 - position(UNLOCKS.nodes[0]).x, y: height - 92 - position(UNLOCKS.nodes[0]).y });
    });
    observer.observe(view);
    const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = view.getBoundingClientRect(); zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .0025), event.clientX - rect.left, event.clientY - rect.top); };
    view.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); view.removeEventListener('wheel', wheel); };
  }, []);
  useEffect(() => {
    if (!showDetail) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setShowDetail(false); viewport.current?.querySelector<HTMLButtonElement>(`[data-node-id="${selected}"]`)?.focus({ preventScroll: true }); } };
    document.addEventListener('keydown', escape);
    detailRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', escape);
  }, [showDetail, selected]);
  function openNode(id: number, button: HTMLButtonElement) {
    const map = viewport.current!.getBoundingClientRect(), rect = button.getBoundingClientRect();
    const width = Math.min(340, map.width - 24);
    const right = rect.right - map.left + 16;
    setPopup({ left: Math.max(12, Math.min(map.width - width - 12, right + width <= map.width ? right : rect.left - map.left - width - 16)), top: 12 });
    setSelected(id); setShowDetail(true);
  }
  return <div className="save-shrine-layout">
    <section className="save-shrine-map" aria-label={tr('神龛技能树')}>
      <div className="save-shrine-toolbar filter-bar">
        <input type="search" aria-label={tr('搜索神龛节点')} placeholder={tr('搜索技能或配方 · 支持拼音')} value={query} onChange={e => setQuery(e.target.value)} />
        {model && <SearchableSelect aria-label={tr('神龛解锁状态')} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{tr('全部状态')}</option><option value="yes">{tr('已解锁')}</option><option value="no">{tr('未解锁')}</option></SearchableSelect>}
        <button type="button" onClick={() => locate(selected)}>{tr('定位选中')}</button>
        <div className="save-shrine-zoom"><button type="button" aria-label={tr('缩小技能树')} onClick={() => zoom(1 / 1.2)}>−</button><output aria-label={tr('技能树缩放比例')}>{Math.round(camera.scale * 100)}%</output><button type="button" aria-label={tr('放大技能树')} onClick={() => zoom(1.2)}>＋</button></div>
      </div>
      {(query || filter !== 'all') && <div className="save-shrine-results" aria-label={tr('节点搜索结果')}>{matches.length ? matches.map(n => <button key={n.id} type="button" aria-pressed={selected === n.id} onClick={() => locate(n.id, true)}>{n.name}</button>) : <small>{tr('没有匹配的节点')}</small>}</div>}
      <div className="save-shrine-stage">
      <div className="save-shrine-viewport" ref={viewport} tabIndex={0} aria-label={tr('技能树画布，滚轮缩放、拖动平移')}
        onPointerDown={e => { if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return; setShowDetail(false); drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { const p = drag.current; if (p) { const dx = e.clientX - p.x, dy = e.clientY - p.y; drag.current = { x: e.clientX, y: e.clientY }; setCamera(c => ({ ...c, x: c.x + dx, y: c.y + dy })); } }}
        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.2); } else if (e.key === '-') { e.preventDefault(); zoom(1 / 1.2); } else { const delta = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[e.key]; if (delta) { e.preventDefault(); setCamera(c => ({ ...c, x: c.x + delta[0], y: c.y + delta[1] })); } } }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
        <div className="save-shrine-canvas" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
          <svg width="1250" height="2180" aria-hidden="true">{UNLOCKS.nodes.flatMap(n => n.parents.map(id => {
            const parent = UNLOCKS.nodes.find(n => n.id === id)!;
            const p = position(parent), q = position(n);
            return <line key={`${id}-${n.id}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={enabled(id) && enabled(n.id) ? 'unlocked' : ''} />;
          }))}</svg>
          {UNLOCKS.nodes.map(n => { const p = position(n); return <button key={n.id} data-node-id={n.id} type="button" className={`save-shrine-node ${enabled(n.id) ? 'unlocked' : 'locked'} ${matching.has(n.id) ? '' : 'dimmed'}`} style={{ left: p.x, top: p.y }} aria-label={`${n.name}，${model ? enabled(n.id) ? tr('已解锁') : tr('未解锁') : tr('查看条件与配方')}`} aria-pressed={selected === n.id} onClick={e => openNode(n.id, e.currentTarget)}>
            <span className="save-shrine-orb"><span aria-hidden="true" className="save-shrine-glyph" style={{ maskImage: `url(${withBase(`/icons/generated/ui/shrine-${n.icon}.webp`)})` }} /><i aria-hidden="true">{enabled(n.id) ? '✓' : '◇'}</i></span>
            <span className="save-shrine-node-name">{n.name}</span>
          </button>; })}
        </div>
      </div>
    {showDetail && <aside className="save-unlock-detail save-shrine-popover" ref={detailRef} tabIndex={-1} role="dialog" aria-label={tr('神龛节点详情')} style={{ left: popup.left, top: popup.top }}>
      <button type="button" className="save-shrine-close" aria-label={tr('关闭节点详情')} onClick={() => setShowDetail(false)}>×</button>
      <div className="save-unlock-detail-title"><span className="save-unlock-eyebrow">{node.skill ? tr('技能') : recipes.length ? tr('制作配方') : tr('神龛能力')}</span><h3>{node.name}</h3>{model && <span className="save-unlock-state" data-state={unlocked ? 'complete' : 'pending'}>{unlocked ? tr('✓ 已解锁') : tr('◇ 未解锁')}</span>}</div>
      <div className="save-unlock-detail-body">
        <p>{node.description}</p>
        {!!shrineLearningMaterials(node.id).length && <div className="save-unlock-section"><h4>{tr('学习材料')}</h4><p>{shrineLearningMaterials(node.id).map(m => `${itemLabel(names, String(m.itemId))} × ${m.count}`).join('、')}</p>{onMaterials && <button type="button" onClick={() => onMaterials(shrineLearningMaterials(node.id))}>{tr('学习材料加入背包')}</button>}</div>}
        <dl className="save-shrine-requirements"><div><dt>{tr('所需修缮等级')}</dt><dd>{node.level} {tr('级')}</dd></div>{level !== null && <div><dt>{tr('当前修缮等级')}</dt><dd>{level} {tr('级')}</dd></div>}{node.horrorOnly && <div><dt>{tr('适用模式')}</dt><dd>{tr('开启恐怖要素')}</dd></div>}</dl>
        {level !== null && level < node.level && <p className="save-shrine-level-note">{tr('修缮至 {level} 级后，此节点才会在游戏中开放。', { level: node.level })}</p>}
        {!!node.parents.length && <div className="save-unlock-section"><h4>{tr('前置节点')}</h4>{node.parents.map(id => <button className="save-shrine-parent" key={id} type="button" onClick={() => locate(id, true)}><span>{enabled(id) ? '✓' : '◇'}</span>{UNLOCKS.nodes.find(n => n.id === id)!.name}<span>↗</span></button>)}</div>}
        {!!recipes.length && <div className="save-unlock-section"><h4>{tr('解锁配方')}</h4>{recipes.map(r => <div className="save-unlock-recipe" key={r.itemId}><SaveIcon names={names} kind="items" value={String(r.itemId)} size={40} /><span>{itemLabel(names, String(r.itemId))}</span>{onMaterials && !!shrineRecipeMaterials(r.itemId).length && <button type="button" onClick={() => onMaterials(shrineRecipeMaterials(r.itemId))}>{tr('制作材料加入背包')}</button>}</div>)}</div>}
      </div>
      {model && onReplace && <div className="save-unlock-actions"><button type="button" className="save-primary-action" onClick={() => onReplace(changeShrine(model.doc, edits, selected, !unlocked))}>{unlocked ? tr('重新锁定') : tr('解锁此节点')}</button><small>{affected.length > 1 ? unlocked ? tr('同时锁定 {count} 个后续节点。', { count: affected.length - 1 }) : tr('同时解锁 {count} 个前置节点。', { count: affected.length - 1 }) : tr('技能效果与对应配方会同步更新。')} {tr('解锁不消耗材料。')}</small></div>}
    </aside>}
      </div>
      <footer>{model && <span><i className="unlocked" /> {tr('已解锁')} {UNLOCKS.nodes.filter(n => enabled(n.id)).length}</span>}{model && <span><i /> {tr('未解锁')}</span>}<small>{tr('滚轮缩放 · 拖动平移 · 点击查看详情')}</small></footer>
    </section>
  </div>;
}
