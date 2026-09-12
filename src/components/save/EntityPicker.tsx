import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { LookupKind } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';

export default function EntityPicker({ names, kind, value, onChange, allowedIds, label = '选择物品' }: {
  names: SaveNameTables; kind: LookupKind; value: string;
  onChange: (id: string) => void; allowedIds?: ReadonlySet<string>; label?: string;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(80);
  const root = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const deferred = useDeferredValue(query);
  const indexed = useMemo(() => Object.entries(names.names?.[kind] ?? {}).map(([id, name]) => ({ id, name, searchText: buildSaveSearchText(name, id) })), [names, kind]);
  const matches = useMemo(() => indexed
    .filter(({ id, searchText }) => (!allowedIds || allowedIds.has(id))
      && (!category || names.itemCategories?.[id] === category)
      && searchText.includes(normalizeSearch(deferred)))
    .sort((a, b) => Number(a.id) - Number(b.id)), [indexed, names, allowedIds, category, deferred]);
  useEffect(() => setLimit(80), [category, deferred, kind, allowedIds]);
  useEffect(() => {
    if (!sentinel.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setLimit(current => current + 80);
    }, { root: root.current, rootMargin: '100px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [limit, matches.length]);
  return <div className={`save-slot-picker${kind !== 'items' ? ' compact' : ''}`} role="group" aria-label={label}>
    {kind === 'items' && <select aria-label="物品分类" value={category} onChange={event => setCategory(event.target.value)}>
      <option value="">全部分类</option>
      {Object.entries(names.categories ?? {}).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>}
    <input autoFocus className="save-slot-search" aria-label={`搜索${label}`} placeholder="名称、拼音、首字母或 ID" value={query} onChange={event => setQuery(event.target.value)} />
    <ul className="save-slot-options" ref={root}>
      {matches.slice(0, limit).map(({ id, name }) => <li key={id}><button type="button" className={id === value ? 'active' : ''} onClick={() => onChange(id)}>
        <SaveIcon names={names} kind={kind} value={id} size={24} /><span>{name}</span>{kind === 'items' && <small>{id}</small>}
      </button></li>)}
      {matches.length === 0 && <li className="save-slot-none">没有匹配的结果。</li>}
      {matches.length > limit && <li ref={sentinel}><button type="button" onClick={() => setLimit(current => current + 80)}>加载更多（已显示 {Math.min(limit, matches.length)} / {matches.length}）</button></li>}
    </ul>
    <small>共 {matches.length} 个结果</small>
  </div>;
}
