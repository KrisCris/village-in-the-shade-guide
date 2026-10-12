import SearchableSelect from '../controls/SearchableSelect';
import { useEffect, useMemo, useState } from 'react';
import data from '../../../data/sources/game-save-quests.json';
import type { SaveField, SaveModel } from '../../lib/saveModel';
import { rawFieldFor } from '../../lib/saveModel';
import { readSigned } from '../../lib/ser';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { gameText } from '../../lib/saveText';
import { tr } from '../../i18n/active';
import { questStatus, type QuestStatus } from '../../lib/saveQuests';

// Internal quests are marked by a leading tag in the Chinese name; display uses the page language.
const questText = (text: string, translations?: Record<string, string>) => gameText(text, translations).replace(/<[^>]+>/g, '').trim();
// The game's own marker for quest text it never shows (every language has an equivalent).
const UNUSED_TEXT = '！这个任务没有这个字符串！'; // i18n-ignore
const statusLabel = (status: QuestStatus) => status === 'hidden' ? tr('隐藏') : status === 'complete' ? tr('已完成') : tr('进行中');

function QuestStateBadge({ status }: { status: QuestStatus }) {
  return <span className="save-quest-state" data-state={status}>
    <span aria-hidden="true">{status === 'hidden' ? '−' : status === 'complete' ? '✓' : '○'}</span>{statusLabel(status)}
  </span>;
}

export default function QuestsPanel({ model, drafts, onChange }: { model: SaveModel; drafts: Record<number, string>; onChange: (field: SaveField, value: string) => void }) {
  const [search, setSearch] = useState('');
  const [showInternal, setShowInternal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<QuestStatus | 'all'>('all');
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
      return info && state && check ? [{ info, title: questText(info.name, info.nameTranslations) || gameText(info.name, info.nameTranslations), searchText: buildSaveSearchText(questText(info.name, info.nameTranslations), String(info.id)), internal: /^\s*<[^>]+>/.test(info.name), state: rawFieldFor(model.doc, state)!, check: rawFieldFor(model.doc, check)! }] : [];
    });
  }, [model]);
  const statusOf = (quest: typeof quests[number]) => questStatus(Number(drafts[quest.state.offset] ?? quest.state.value), Number(drafts[quest.check.offset] ?? quest.check.value), quest.info.steps);
  const searched = quests.filter(quest => (showInternal || !quest.internal) && quest.searchText.includes(normalizeSearch(search)));
  const visible = statusFilter === 'all' ? searched : searched.filter(quest => statusOf(quest) === statusFilter);
  const statusCount = (status: QuestStatus | 'all') => status === 'all' ? searched.length : searched.filter(quest => statusOf(quest) === status).length;
  const selected = visible.find(quest => quest.info.id === selectedId) ?? visible[0];
  const internalCount = quests.filter(quest => quest.internal).length;

  return <section className="save-quests">
    <div className="save-quest-workspace" style={{ height: `calc(100dvh - ${headerHeight + 32}px)`, scrollMarginTop: headerHeight + 16, scrollMarginBottom: 16 }}>
      <aside className="save-quest-sidebar" aria-label={tr('查找任务')}>
        <div className="save-quest-toolbar">
          <label className="save-quest-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input type="search" placeholder={tr('任务名称、拼音或首字母')} aria-label={tr('搜索任务')} value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          <div className="save-progress-tabs save-quest-status" role="group" aria-label={tr('任务状态')}>
            {(['all', 'pending', 'complete', 'hidden'] as const).map(status => <button type="button" key={status} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {status === 'all' ? tr('全部') : statusLabel(status)} <small>{statusCount(status)}</small>
            </button>)}
          </div>
          <label className="save-quest-filter"><input type="checkbox" checked={showInternal} onChange={event => setShowInternal(event.target.checked)} />{tr('显示教程／内部任务')}</label>
          <small aria-live="polite">{visible.length} {tr('个任务')}{!showInternal && internalCount > 0 ? tr(' · 已隐藏 {internalCount} 个教程／内部任务', { internalCount }) : ''}</small>
        </div>
        <nav className="save-quest-list" aria-label={tr('任务列表')}>
          {visible.map(quest => {
            const status = statusOf(quest);
            return <button type="button" key={quest.info.id} aria-pressed={selected?.info.id === quest.info.id} onClick={() => setSelectedId(quest.info.id)}>
              <span>{quest.title}</span><QuestStateBadge status={status} />
            </button>;
          })}
          {!visible.length && <p className="save-quest-empty">{tr('没有匹配的任务，试试其他关键词或调整筛选。')}</p>}
        </nav>
      </aside>
      {selected ? <QuestDetail key={selected.info.id} quest={selected} drafts={drafts} onChange={onChange} /> : <div className="save-quest-detail save-quest-empty-detail"><p>{tr('选择任务后，在这里查看和修改进度。')}</p></div>}
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
  return <article className="save-quest-detail" aria-label={tr('当前任务详情')}>
    <header className="save-quest-detail-header"><h3>{title}</h3><QuestStateBadge status={questStatus(currentState, current, info.steps)} /></header>
    <div className="save-quest-detail-body">
      {info.description && info.description !== UNUSED_TEXT && <p className="save-quest-description">{questText(info.description, info.descriptionTranslations)}</p>}
      <div className="save-quest-controls">
        <label><span>{tr('任务记录')}</span><SearchableSelect aria-label={tr('{title}任务记录', { title })} value={currentState === 0 ? '0' : currentState === 3 ? '3' : '1'} onChange={event => { onChange({ ...state, label: tr('{title} · 记录', { title }), min: '0', max: '3' }, event.target.value); if (event.target.value === '3') onChange({ ...check, label: tr('{title} · 清单进度', { title }), min: '-1', max: String(max) }, String(max)); }}><option value="0">{tr('隐藏')}</option><option value="1">{tr('显示')}</option><option value="3">{tr('标记完成')}</option></SearchableSelect></label>
        {!!info.steps.length && <label><span>{tr('清单进度')}</span><SearchableSelect aria-label={tr('{title}清单进度', { title })} value={value} onChange={event => { onChange({ ...check, label: tr('{title} · 清单进度', { title }), min: '-1', max: String(max) }, event.target.value); onChange({ ...state, label: tr('{title} · 记录', { title }), min: '0', max: '3' }, Number(event.target.value) >= max ? '3' : '1'); }}>{value === 'original' && <option value="original">{tr('存档中的当前进度')}</option>}<option value={-1}>{tr('尚未完成清单项目')}</option>{levels.filter(level => level >= 0).map(level => <option key={level} value={level}>{tr('已完成 {done} / {total} 项', { done: info.steps.filter(step => step.level < level).length, total: info.steps.length })}</option>)}</SearchableSelect></label>}
      </div>
      {!!info.steps.length && <section className="save-quest-checklist"><h4>{tr('任务清单')} <small>{info.steps.filter(step => step.level < current).length} / {info.steps.length}</small></h4><ul>{info.steps.map((step, index) => <li key={index} className={current > step.level ? 'done' : 'pending'}><span aria-hidden="true">{current > step.level ? '✓' : '○'}</span><span>{questText(step.name, step.nameTranslations)}</span></li>)}</ul></section>}
      <p className="save-quest-note">{tr('修改记录不会触发剧情、发放奖励或改变村庄状态。')}</p>
    </div>
  </article>;
}
