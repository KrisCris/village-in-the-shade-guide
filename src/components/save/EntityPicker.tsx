import SearchableSelect from '../controls/SearchableSelect';
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LookupKind } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { tr } from '../../i18n/active';

// Native 0x1401653C0 / 0x14014890E: categories 34–39 unlock appearance,
// then return before inserting into the inventory. Keep the name/icon catalog intact.
const APPEARANCE_CATEGORIES = new Set([
  'ITEM_CATEGORY_FRONT_HAIRSTYLE', 'ITEM_CATEGORY_BACK_HAIRSTYLE',
  'ITEM_CATEGORY_CLOTHES', 'ITEM_CATEGORY_COLLAR',
  'ITEM_CATEGORY_ORNAMENTS', 'ITEM_CATEGORY_BAG',
]);

export default function EntityPicker({ names, kind, value, onChange, allowedIds, label = tr('选择物品') }: {
  names: SaveNameTables; kind: LookupKind; value: string;
  onChange: (id: string) => void; allowedIds?: ReadonlySet<string>; label?: string;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(80);
  const [start, setStart] = useState(0);
  const root = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const locateSelection = useRef(true);
  const deferred = useDeferredValue(query);
  const indexed = useMemo(() => Object.entries(names.names?.[kind] ?? {})
    .filter(([id]) => kind !== 'items' || !APPEARANCE_CATEGORIES.has(names.itemCategories?.[id] ?? ''))
    .map(([id, name]) => ({ id, name, searchText: buildSaveSearchText(name, id) })), [names, kind]);
  const matches = useMemo(() => indexed
    .filter(({ id, searchText }) => (!allowedIds || allowedIds.has(id))
      && (!category || names.itemCategories?.[id] === category)
      && searchText.includes(normalizeSearch(deferred)))
    .sort((a, b) => Number(a.id) - Number(b.id)), [indexed, names, allowedIds, category, deferred]);
  useEffect(() => {
    const index = !category && !deferred ? matches.findIndex(row => row.id === value) : -1;
    const first = Math.max(0, index - 30);
    locateSelection.current = index >= 0;
    setStart(first); setLimit(first + 80);
  }, [category, deferred, kind, allowedIds, value, names]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const selected = root.current?.querySelector<HTMLElement>('.active');
      if (!locateSelection.current || !selected || !root.current) return;
      const box = selected.getBoundingClientRect(), view = root.current.getBoundingClientRect();
      if (!view.height) return;
      root.current.scrollTop += box.top - view.top - (view.height - box.height) / 2;
      locateSelection.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [start, limit, value, names]);
  useEffect(() => {
    if (!sentinel.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setLimit(current => current + 80);
    }, { root: root.current, rootMargin: '100px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [limit, matches.length]);
  return <div className={`save-slot-picker${kind !== 'items' ? ' compact' : ''}`} role="group" aria-label={label}>
    {kind === 'items' && <label>{tr('物品分类')}<SearchableSelect value={category} onChange={event => setCategory(event.target.value)}>
      <option value="">{tr('全部分类')}</option>
      {Object.entries(names.categories ?? {}).filter(([id]) => !APPEARANCE_CATEGORIES.has(id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </SearchableSelect></label>}
    <input autoFocus className="save-slot-search" aria-label={tr('搜索{label}', { label })} placeholder={tr('名称、拼音、首字母或 ID')} value={query} onChange={event => setQuery(event.target.value)} />
    <ul className="save-slot-options" ref={root}>
      {start > 0 && <li><button type="button" onClick={() => setStart(current => Math.max(0, current - 80))}>{tr('加载前面的选项')}</button></li>}
      {matches.slice(start, limit).map(({ id, name }) => <li key={id}><button type="button" className={id === value ? 'active' : ''} onClick={() => onChange(id)}>
        <SaveIcon names={names} kind={kind} value={id} size={24} /><span>{name}</span>{kind === 'items' && <small>{id}</small>}
      </button></li>)}
      {matches.length === 0 && <li className="save-slot-none">{tr('没有匹配的结果。')}</li>}
      {matches.length > limit && <li ref={sentinel}><button type="button" onClick={() => setLimit(current => current + 80)}>{tr('加载更多（已显示 {shown} / {total}）', { shown: Math.min(limit, matches.length), total: matches.length })}</button></li>}
    </ul>
    <small>{tr('共 {count} 个结果', { count: matches.length })}</small>
  </div>;
}
