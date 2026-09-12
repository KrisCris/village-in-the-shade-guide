import { useEffect, useMemo, useState } from 'react';
import data from '../../../data/sources/game-save-quests.json';
import type { SaveField, SaveModel } from '../../lib/saveModel';
import { rawFieldFor } from '../../lib/saveModel';
import { readSigned } from '../../lib/ser';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { simplifySaveText } from '../../lib/saveText';

const questText = (text: string) => simplifySaveText(text.replace(/<[^>]+>/g, '').trim());
const stateLabel = (state: number) => state === 0 ? '隐藏' : state === 3 ? '已完成' : '进行中';

function QuestStateBadge({ state }: { state: number }) {
  return <span className="save-quest-state" data-state={state === 0 ? 'hidden' : state === 3 ? 'complete' : 'pending'}>
    <span aria-hidden="true">{state === 0 ? '−' : state === 3 ? '✓' : '○'}</span>{stateLabel(state)}
  </span>;
}

export default function QuestsPanel({ model, drafts, onChange }: { model: SaveModel; drafts: Record<number, string>; onChange: (field: SaveField, value: string) => void }) {
  const [search, setSearch] = useState('');
  const [showInternal, setShowInternal] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(64);
  useEffect(() => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const quests = useMemo(() => {
    const node = model.doc.resolve('questMap_');
    return (node ? model.doc.children(node) : []).filter((_, index) => index % 2 === 1).flatMap(pointer => {
      const id = model.doc.resolve('p/dataID_', pointer), state = model.doc.resolve('p/state_', pointer), check = model.doc.resolve('p/checkLevel_', pointer);
      const info = id && data.quests.find(quest => quest.id === Number(readSigned(model.doc, id)));
      return info && state && check ? [{ info, title: questText(info.name) || simplifySaveText(info.name), searchText: buildSaveSearchText(questText(info.name), String(info.id)), internal: /^\s*<[^>]+>/.test(info.name), state: rawFieldFor(model.doc, state)!, check: rawFieldFor(model.doc, check)! }] : [];
    });
  }, [model]);
  const visible = quests.filter(quest => (showInternal || !quest.internal) && quest.searchText.includes(normalizeSearch(search)));
  const selected = visible.find(quest => quest.info.id === selectedId) ?? visible[0];
  const internalCount = quests.filter(quest => quest.internal).length;

  return <section className="save-quests">
    <div className="save-quest-workspace" style={{ height: `calc(100dvh - ${headerHeight + 32}px)`, scrollMarginTop: headerHeight + 16, scrollMarginBottom: 16 }}>
      <aside className="save-quest-sidebar" aria-label="查找任务">
        <div className="save-quest-toolbar">
          <label className="save-quest-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input type="search" placeholder="任务名称、拼音或首字母" aria-label="搜索任务" value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          <label className="save-quest-filter"><input type="checkbox" checked={showInternal} onChange={event => setShowInternal(event.target.checked)} />显示教程／内部任务</label>
          <small aria-live="polite">{visible.length} 个任务{!showInternal && internalCount > 0 ? ` · 已隐藏 ${internalCount} 个教程／内部任务` : ''}</small>
        </div>
        <nav className="save-quest-list" aria-label="任务列表">
          {visible.map(quest => {
            const state = Number(drafts[quest.state.offset] ?? quest.state.value);
            return <button type="button" key={quest.info.id} aria-pressed={selected?.info.id === quest.info.id} onClick={() => setSelectedId(quest.info.id)}>
              <span>{quest.title}</span><QuestStateBadge state={state} />
            </button>;
          })}
          {!visible.length && <p className="save-quest-empty">没有匹配的任务，试试其他关键词或调整筛选。</p>}
        </nav>
      </aside>
      {selected ? <QuestDetail key={selected.info.id} quest={selected} drafts={drafts} onChange={onChange} /> : <div className="save-quest-detail save-quest-empty-detail"><p>选择任务后，在这里查看和修改进度。</p></div>}
    </div>
  </section>;
}

function QuestDetail({ quest: { info, title, state, check }, drafts, onChange }: {
  quest: { info: typeof data.quests[number]; title: string; state: SaveField; check: SaveField };
  drafts: Record<number, string>;
  onChange: (field: SaveField, value: string) => void;
}) {
  const current = Number(drafts[check.offset] ?? check.value), currentState = Number(drafts[state.offset] ?? state.value);
  const levels = [-1, ...new Set(info.steps.map(step => step.level + 1))];
  const max = Math.max(0, ...levels);
  const value = levels.includes(current) ? current : 'original';
  return <article className="save-quest-detail" aria-label="当前任务详情">
    <header className="save-quest-detail-header"><h3>{title}</h3><QuestStateBadge state={currentState} /></header>
    <div className="save-quest-detail-body">
      {info.description && <p className="save-quest-description">{questText(info.description)}</p>}
      <div className="save-quest-controls">
        <label><span>任务记录</span><select aria-label={`${title}任务记录`} value={currentState === 0 ? '0' : currentState === 3 ? '3' : '1'} onChange={event => { onChange({ ...state, label: `${title} · 记录`, min: '0', max: '3' }, event.target.value); if (event.target.value === '3') onChange({ ...check, label: `${title} · 清单进度`, min: '-1', max: String(max) }, String(max)); }}><option value="0">隐藏</option><option value="1">显示</option><option value="3">标记完成</option></select></label>
        {!!info.steps.length && <label><span>清单进度</span><select aria-label={`${title}清单进度`} value={value} onChange={event => { onChange({ ...check, label: `${title} · 清单进度`, min: '-1', max: String(max) }, event.target.value); onChange({ ...state, label: `${title} · 记录`, min: '0', max: '3' }, Number(event.target.value) >= max ? '3' : '1'); }}>{value === 'original' && <option value="original">存档中的当前进度</option>}<option value={-1}>尚未完成清单项目</option>{levels.filter(level => level >= 0).map(level => <option key={level} value={level}>已完成 {info.steps.filter(step => step.level < level).length} / {info.steps.length} 项</option>)}</select></label>}
      </div>
      {!!info.steps.length && <section className="save-quest-checklist"><h4>任务清单 <small>{info.steps.filter(step => step.level < current).length} / {info.steps.length}</small></h4><ul>{info.steps.map((step, index) => <li key={index} className={current > step.level ? 'done' : 'pending'}><span aria-hidden="true">{current > step.level ? '✓' : '○'}</span><span>{questText(step.name)}</span></li>)}</ul></section>}
      <p className="save-quest-note">修改记录不会触发剧情、发放奖励或改变村庄状态。</p>
    </div>
  </article>;
}
