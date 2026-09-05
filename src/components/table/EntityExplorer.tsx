import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { Entity } from '../../data/types';
import { entityUrl, normalizeSearch } from '../../data/clientSearch';
import { qualityLabel } from '../../domain/quality';
import { entityMetrics, sortEntities, type PriceIndex, type SortDirection, type SortField } from '../../domain/entitySort';
import EntityDrawer from '../entity/EntityDrawer';
import { useQuality } from '../quality/qualityPreference';

const seasonLabels: Record<string, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const timeLabels: Record<string, string> = { morning: '早晨 07:00–12:00', day: '白天 12:00–18:00', evening: '夜晚 18:00–00:00', 'late-night': '深夜 00:00–06:00' };
export function applyEntityFilters(rows: Entity[], filters: Record<string, string>) {
  const needle = normalizeSearch(filters.query ?? '');
  return rows.filter((row) => {
    if (needle && !row.searchText.includes(needle)) return false;
    if (filters.itemCategory && row.category_id !== filters.itemCategory) return false;
    if (filters.machine && !(row.machine_ids as string[] | undefined)?.includes(filters.machine)) return false;
    if (row.kind === 'fish' && (filters.season || filters.timePeriod || filters.fishingLocation)) {
      return row.appearances?.some((entry) => (!filters.season || entry.season === filters.season)
        && (!filters.timePeriod || entry.time_period === filters.timePeriod)
        && (!filters.fishingLocation || entry.location_id === filters.fishingLocation)) ?? false;
    }
    return !filters.season || !!(row.seasons as string[] | undefined)?.includes(filters.season);
  });
}
const sortFields: SortField[] = ['name', 'buy', 'sell', 'duration', 'profit'];

function parseSort(value: string | null): SortField {
  return sortFields.includes(value as SortField) ? value as SortField : 'name';
}

function parseDirection(value: string | null): SortDirection {
  return value === 'desc' ? 'desc' : 'asc';
}

function metricText(value: number | null, suffix: string): string {
  if (value == null) return '—';
  const shown = Number.isInteger(value) ? String(value) : `≈${value.toFixed(2)}`;
  return `${shown} · ${suffix}`;
}

function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function rowFallback(row: Entity) {
  return `/icons/fallback/${['items', 'crops', 'machines', 'processes'].includes(row.kind) ? row.kind : 'default'}.svg`;
}

export default function EntityExplorer({ rows, kind, machineOptions = [], fishingLocationOptions = [], itemCategoryOptions = [], priceIndex = {} }: {
  rows: Entity[];
  kind: string;
  machineOptions?: Array<{ id: string; name: string }>;
  fishingLocationOptions?: Array<{ id: string; name: string }>;
  itemCategoryOptions?: Array<{ id: string; name: string }>;
  priceIndex?: PriceIndex;
}) {
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState('');
  const [machine, setMachine] = useState('');
  const [timePeriod, setTimePeriod] = useState('');
  const [fishingLocation, setFishingLocation] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [sort, setSort] = useState<SortField>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [urlReady, setUrlReady] = useState(false);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [quality] = useQuality();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get('q') ?? '');
    setSeason(params.get('season') ?? '');
    setMachine(params.get('machine') ?? '');
    setTimePeriod(params.get('period') ?? '');
    setFishingLocation(params.get('location') ?? '');
    setItemCategory(params.get('category') ?? '');
    setSort(parseSort(params.get('sort')));
    setDirection(parseDirection(params.get('dir')));
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams(location.search);
    const update = (key: string, value: string, defaultValue = '') => value && value !== defaultValue ? params.set(key, value) : params.delete(key);
    update('q', query);
    update('season', season);
    update('machine', machine);
    update('period', timePeriod);
    update('location', fishingLocation);
    update('category', itemCategory);
    update('sort', sort, 'name');
    update('dir', direction, 'asc');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  }, [query, season, machine, timePeriod, fishingLocation, itemCategory, sort, direction, urlReady]);

  const shown = useMemo(() => {
    const filtered = applyEntityFilters(rows, { query, season, machine, timePeriod, fishingLocation, itemCategory });
    return sortEntities(filtered, sort, direction, quality, priceIndex);
  }, [rows, query, season, machine, timePeriod, fishingLocation, itemCategory, sort, direction, quality, priceIndex]);

  const openFromRow = (row: Entity, event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest('a,button,input,select')) return;
    setSelected(row);
  };
  const openFromKeyboard = (row: Entity, event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    setSelected(row);
  };
  const openFromLink = (row: Entity, event: MouseEvent<HTMLAnchorElement>) => {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    setSelected(row);
  };

  return <>
    {kind === 'fish' && <p className="fishing-hours">{Object.values(timeLabels).join(' · ')}<br /><small>06:00–07:00 无出没时段记录</small></p>}
    <div className="toolbar card">
      <label>页内搜索<input type="search" placeholder="名称、拼音、日文或 ID" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {['crops', 'fish'].includes(kind) && <>
        <label>季节<select value={season} onChange={(event) => setSeason(event.target.value)}><option value="">全部</option>{Object.entries(seasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </>}
      {kind === 'fish' && <>
        <label>时段<select value={timePeriod} onChange={(event) => setTimePeriod(event.target.value)}><option value="">全部时段</option>{Object.entries(timeLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>钓鱼点<select value={fishingLocation} onChange={(event) => setFishingLocation(event.target.value)}><option value="">全部钓鱼点</option>{fishingLocationOptions.map(({id, name}) => <option key={id} value={id}>{name}</option>)}</select></label>
      </>}
      {kind === 'items' && itemCategoryOptions.length>0 && <label>类别<input aria-label="搜索类别" placeholder="输入类别名称" value={categoryQuery} onChange={event=>setCategoryQuery(event.target.value)} /><select value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}><option value="">全部类别</option>{itemCategoryOptions.filter(option=>option.id===itemCategory || option.name.includes(categoryQuery)).map(({id, name}) => <option key={id} value={id}>{name}</option>)}</select></label>}
      {kind === 'processes' && <label>机械<select value={machine} onChange={(event) => setMachine(event.target.value)}><option value="">全部机械</option>{machineOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}
      <label>排序字段<select value={sort} onChange={(event) => setSort(parseSort(event.target.value))}><option value="name">名称</option><option value="sell">产值</option><option value="buy">成本</option>{['processes', 'crops'].includes(kind) && <option value="profit">日净收益</option>}{kind === 'processes' && <option value="duration">加工时间</option>}</select></label>
      <label>方向<select value={direction} onChange={(event) => setDirection(parseDirection(event.target.value))}><option value="asc">升序</option><option value="desc">降序</option></select></label>
      <b>{shown.length} 条</b>
    </div>
    <div className="table-wrap card"><table><thead><tr><th>名称</th><th>季节 / 类型</th><th>成本</th><th>产值</th><th>时间</th><th>日净收益</th><th>数据 ID</th></tr></thead><tbody>{shown.map((row) => {
      const metrics = entityMetrics(row, quality, priceIndex);
      const qualitySuffix = row.quality_eligible ? qualityLabel(quality) : '固定';
      const processGroup = row.source_kind === 'processes';
      const duration = typeof row.duration_minutes === 'number'
        ? `${Math.ceil(row.duration_minutes / 1440)} 日${typeof row.duration_max_minutes === 'number' && row.duration_max_minutes !== row.duration_minutes ? `–${Math.ceil(row.duration_max_minutes / 1440)} 日` : ''}`
        : null;
      return <tr key={row.id} tabIndex={0} aria-label={`打开${row.name.zh_hans}详情`} onClick={(event) => openFromRow(row, event)} onKeyDown={(event) => openFromKeyboard(row, event)}>
        <td><a className="entity-link" href={entityUrl(row)} onClick={(event) => openFromLink(row, event)}>{row.icon_path && <img src={row.icon_path} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = rowFallback(row); }} alt="" width="42" height="42" loading="lazy" />}<span>{row.name.zh_hans}<small>{row.name.ja}</small></span></a></td>
        <td>{processGroup ? `${row.variant_count} 种配方` : row.category_name?.zh_hans || (row.seasons as string[] | undefined)?.map((value) => seasonLabels[value] ?? value).join('、') || kind}{row.cultivation_method && <small>{String(row.cultivation_method)}</small>}{row.kind==='crops' && ((row.harvest_item_ids ?? []) as string[]).length>1 && <small>{String(row.harvest_names)}</small>}</td>
        <td className="price">{metricText(metrics.buy, kind === 'processes' ? qualityLabel(quality) : '固定')}</td>
        <td className="price">{metricText(metrics.sell, qualitySuffix)}</td>
        <td>{duration ?? (typeof row.growth_days === 'number' ? `${row.growth_days} 日${row.regrow_days ? ` / 再生 ${row.regrow_days} 日` : ''}` : '—')}</td>
        <td className="price">{metricText(metrics.profit, row.quality_eligible ? qualityLabel(quality) : '固定')}</td>
        <td><code>{row.id}</code></td>
      </tr>;
    })}</tbody></table></div>
    {selected && <EntityDrawer initial={selected} onClose={() => setSelected(null)} />}
    <style>{`
      .toolbar{display:flex;align-items:end;flex-wrap:wrap;gap:.8rem;padding:.8rem;margin:1.2rem 0}.toolbar label{display:grid;gap:.3rem;color:var(--muted);font-size:.78rem}.toolbar input,.toolbar select{min-height:42px;padding:.55rem .7rem;border:1px solid var(--border);border-radius:8px;background:var(--paper-raised);color:var(--ink)}.toolbar b{margin-left:auto;padding:.7rem;color:var(--green)}
      .table-wrap{overflow:auto;max-height:calc(100vh - 250px)}table{width:100%;border-collapse:collapse;font-size:.9rem}th{position:sticky;top:0;z-index:1;background:var(--paper-deep);text-align:left;white-space:nowrap}th,td{padding:.7rem .8rem;border-bottom:1px solid var(--border);vertical-align:top}tbody tr{cursor:pointer}tbody tr:hover,tbody tr:focus-visible{background:color-mix(in srgb,var(--green-soft) 45%,transparent)}.entity-link{display:flex;align-items:center;gap:.65rem;color:var(--green);font-weight:750;text-decoration:none;min-width:180px}.entity-link img{flex:none;border-radius:7px;object-fit:contain;background:var(--paper-deep)}.entity-link span{display:grid}.entity-link small{display:block;color:var(--muted);font-weight:400;margin-top:.2rem}code{font-size:.72rem;color:var(--muted)}
      @media(max-width:700px){.toolbar>*{flex:1 1 140px}.toolbar b{margin-left:0}.table-wrap{max-height:none}th,td{min-width:100px}th:first-child,td:first-child{position:sticky;left:0;background:var(--paper-raised);z-index:1}}
    `}</style>
  </>;
}
