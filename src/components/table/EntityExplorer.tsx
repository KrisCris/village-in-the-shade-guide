import {useProgressiveRows} from './useProgressiveRows';
import SearchableSelect from '../controls/SearchableSelect';
import { withBase } from '../../lib/sitePath';
import { lazy, Suspense, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { secondaryName, type Entity } from '../../data/types';
import { msg } from '../../i18n/translate';
import { useI18n } from '../../i18n/react';
import { entityUrl, normalizeSearch } from '../../data/clientSearch';
import { qualityLabel } from '../../domain/quality';
import { entityMetrics, sortEntities, type PriceIndex, type SortDirection, type SortField } from '../../domain/entitySort';
const EntityDrawer=lazy(()=>import('../entity/EntityDrawer'));
import { useQuality } from '../quality/qualityPreference';

const seasonLabels: Record<string, string> = { spring: msg('春'), summer: msg('夏'), autumn: msg('秋'), winter: msg('冬') };
const timeLabels: Record<string, string> = { morning: msg('早晨 07:00–12:00'), day: msg('白天 12:00–18:00'), evening: msg('夜晚 18:00–00:00'), 'late-night': msg('深夜 00:00–06:00') };
const periodLabels: Record<string, string> = { morning: msg('早晨'), day: msg('白天'), evening: msg('夜晚'), 'late-night': msg('深夜') };
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
const emptyPriceIndex: PriceIndex = {};

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

export default function EntityExplorer({ rows, kind, machineOptions = [], fishingLocationOptions = [], itemCategoryOptions = [], priceIndex = emptyPriceIndex }: {
  rows: Entity[];
  kind: string;
  machineOptions?: Array<{ id: string; name: string }>;
  fishingLocationOptions?: Array<{ id: string; name: string }>;
  itemCategoryOptions?: Array<{ id: string; name: string }>;
  priceIndex?: PriceIndex;
}) {
  const { t, href, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState('');
  const [machine, setMachine] = useState('');
  const [timePeriod, setTimePeriod] = useState('');
  const [fishingLocation, setFishingLocation] = useState('');
  const [itemCategory, setItemCategory] = useState('');
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
  const {visible,sentinel,more,loadMore}=useProgressiveRows(shown);

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

  // Clicking the sorted column flips it; a new column starts A–Z for names and high to low for numbers.
  const sortBy = (field: SortField) => {
    if (field === sort) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setDirection(field === 'name' ? 'asc' : 'desc'); }
  };
  const timed = kind === 'processes' || kind === 'crops';
  const header = (label: string, field?: SortField) => <th key={label} aria-sort={field && sort === field ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}>
    {field ? <button type="button" className="sort-header" onClick={() => sortBy(field)}>{label}<span className="sort-mark" aria-hidden="true">{sort === field ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}</span></button> : label}
  </th>;
  const seasonText = (row: Entity) => (row.seasons as string[] | undefined)?.map((value) => seasonLabels[value] ? t(seasonLabels[value]) : value).join(t('、'));
  return <>
    {kind === 'fish' && <p className="fishing-hours">{Object.values(timeLabels).map((label) => t(label)).join(' · ')}<br /><small>{t('06:00–07:00 无出没时段记录')}</small><br /><a href={href('/guides/fishing-spots/')}>{t('按季节查看各钓点能钓到的鱼和概率')} →</a></p>}
    <div className="toolbar card">
      <label>{t('页内搜索')}<input type="search" placeholder={t('名称、拼音、日文或 ID')} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {['crops', 'fish'].includes(kind) && <>
        <label>{t('季节')}<SearchableSelect value={season} onChange={(event) => setSeason(event.target.value)}><option value="">{t('全部')}</option>{Object.entries(seasonLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</SearchableSelect></label>
      </>}
      {kind === 'fish' && <>
        <label>{t('时段')}<SearchableSelect value={timePeriod} onChange={(event) => setTimePeriod(event.target.value)}><option value="">{t('全部时段')}</option>{Object.entries(timeLabels).map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}</SearchableSelect></label>
        <label>{t('钓鱼点')}<SearchableSelect value={fishingLocation} onChange={(event) => setFishingLocation(event.target.value)}><option value="">{t('全部钓鱼点')}</option>{fishingLocationOptions.map(({id, name}) => <option key={id} value={id}>{name}</option>)}</SearchableSelect></label>
      </>}
      {kind === 'items' && itemCategoryOptions.length>0 && <label>{t('类别')}<SearchableSelect value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}><option value="">{t('全部类别')}</option>{itemCategoryOptions.map(({id, name}) => <option key={id} value={id}>{name}</option>)}</SearchableSelect></label>}
      {kind === 'processes' && <label>{t('机械')}<SearchableSelect value={machine} onChange={(event) => setMachine(event.target.value)}><option value="">{t('全部机械')}</option>{machineOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</SearchableSelect></label>}
      <b>{t('{count} 条', { count: shown.length })}</b>
    </div>
    {kind === 'fish' ? <div className="table-wrap card" data-scene-total={shown.length}><table><thead><tr>{header(t('名称'), 'name')}{header(t('季节'))}{header(t('钓鱼点'))}{header(t('时段'))}{header(t('产值'), 'sell')}{header(t('数据 ID'))}</tr></thead><tbody>{visible.map((row) => {
      // Spots and periods follow the active filters, so a spring filter lists only where and when it bites in spring.
      const hits = row.appearances?.filter((entry) => (!season || entry.season === season) && (!timePeriod || entry.time_period === timePeriod) && (!fishingLocation || entry.location_id === fishingLocation)) ?? [];
      const places = ((row.locations ?? []) as { location_id: string; name: { zh_hans: string } }[]).filter((place) => hits.some((entry) => entry.location_id === place.location_id));
      const periods = Object.keys(timeLabels).filter((period) => hits.some((entry) => entry.time_period === period));
      const metrics = entityMetrics(row, quality, priceIndex);
      return <tr key={row.id} tabIndex={0} aria-label={t('打开{name}详情', { name: row.name.zh_hans })} onClick={(event) => openFromRow(row, event)} onKeyDown={(event) => openFromKeyboard(row, event)}>
        <td><a className="entity-link" href={href(entityUrl(row))} onClick={(event) => openFromLink(row, event)}>{row.icon_path && <img src={withBase(row.icon_path)} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = withBase(rowFallback(row)); }} alt="" width="42" height="42" loading="lazy" />}<span>{row.name.zh_hans}{locale !== 'ja' && <small>{secondaryName(row.name, locale)}</small>}</span></a></td>
        <td>{seasonText(row) || '—'}</td>
        <td className="fish-places">{places.map((place) => <span key={place.location_id}>{place.name.zh_hans}</span>)}</td>
        <td>{periods.map((period) => t(periodLabels[period])).join(t('、')) || '—'}</td>
        <td className="price">{metricText(metrics.sell, row.quality_eligible ? qualityLabel(quality, t) : t('固定'))}</td>
        <td><code>{row.id}</code></td>
      </tr>;
    })}</tbody></table></div> : <div className="table-wrap card" data-scene-total={shown.length}><table><thead><tr>{header(t('名称'), 'name')}{header(t('季节 / 类型'))}{header(t('成本'), 'buy')}{header(t('产值'), 'sell')}{header(t('时间'), timed ? 'duration' : undefined)}{header(t('日净收益'), timed ? 'profit' : undefined)}{header(t('数据 ID'))}</tr></thead><tbody>{visible.map((row) => {
      const metrics = entityMetrics(row, quality, priceIndex);
      const qualitySuffix = row.quality_eligible ? qualityLabel(quality, t) : t('固定');
      const processGroup = row.source_kind === 'processes';
      const days = (minutes: number) => Math.ceil(minutes / 1440);
      const duration = typeof row.duration_minutes === 'number'
        ? typeof row.duration_max_minutes === 'number' && row.duration_max_minutes !== row.duration_minutes
          ? t('{min}–{max} 日', { min: days(row.duration_minutes), max: days(row.duration_max_minutes) })
          : t('{days} 日', { days: days(row.duration_minutes) })
        : null;
      return <tr key={row.id} tabIndex={0} aria-label={t('打开{name}详情', { name: row.name.zh_hans })} onClick={(event) => openFromRow(row, event)} onKeyDown={(event) => openFromKeyboard(row, event)}>
        <td><a className="entity-link" href={href(entityUrl(row))} onClick={(event) => openFromLink(row, event)}>{row.icon_path && <img src={withBase(row.icon_path)} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = withBase(rowFallback(row)); }} alt="" width="42" height="42" loading="lazy" />}<span>{row.name.zh_hans}{locale !== 'ja' && <small>{secondaryName(row.name, locale)}</small>}</span></a></td>
        <td>{processGroup ? t('{count} 种配方', { count: Number(row.variant_count) }) : (kind === 'crops' && seasonText(row)) || row.category_name?.zh_hans || seasonText(row) || kind}{row.cultivation_method && <small>{String(row.cultivation_method)}</small>}{row.kind==='crops' && ((row.harvest_item_ids ?? []) as string[]).length>1 && <small>{String(row.harvest_names)}</small>}</td>
        <td className="price">{metricText(metrics.buy, kind === 'processes' ? qualityLabel(quality, t) : t('固定'))}</td>
        <td className="price">{metricText(metrics.sell, qualitySuffix)}</td>
        <td>{duration ?? (typeof row.growth_days === 'number' ? (row.regrow_days ? t('{days} 日 / 再生 {regrow} 日', { days: row.growth_days, regrow: Number(row.regrow_days) }) : t('{days} 日', { days: row.growth_days })) : '—')}</td>
        <td className="price">{metricText(metrics.profit, row.quality_eligible ? qualityLabel(quality, t) : t('固定'))}</td>
        <td><code>{row.id}</code></td>
      </tr>;
    })}</tbody></table></div>}
    <div ref={sentinel} className="load-more">{more&&<button onClick={loadMore}>{t('加载更多（已显示 {shown} / {total}）', { shown: visible.length, total: shown.length })}</button>}</div>
    {selected && <Suspense fallback={<div role="status" className="detail-loading">{t('正在打开详情…')}</div>}><EntityDrawer initial={selected} onClose={() => setSelected(null)} /></Suspense>}
    <style>{`
      .load-more{display:flex;justify-content:center;padding:1rem}.detail-loading{position:fixed;right:1rem;bottom:1rem;z-index:70;background:var(--paper-raised);padding:1rem;border:1px solid var(--border);border-radius:8px}
      .toolbar{display:flex;align-items:end;flex-wrap:wrap;gap:.8rem;padding:.8rem;margin:1.2rem 0}.toolbar label{display:grid;gap:.3rem;color:var(--muted);font-size:.78rem}.toolbar input,.toolbar select{min-height:42px;padding:.55rem .7rem;border:1px solid var(--border);border-radius:8px;background:var(--paper-raised);color:var(--ink)}.toolbar b{margin-left:auto;padding:.7rem;color:var(--green)}
      .table-wrap{overflow-x:auto;overflow-y:hidden;scroll-margin-top:6rem}table{width:100%;border-collapse:collapse;font-size:.9rem}th{position:sticky;top:0;z-index:1;background:var(--paper-deep);text-align:left;white-space:nowrap}th,td{padding:.7rem .8rem;border-bottom:1px solid var(--border);vertical-align:top}tbody tr{cursor:pointer}tbody tr:hover,tbody tr:focus-visible{background:color-mix(in srgb,var(--green-soft) 45%,transparent)}.entity-link{display:flex;align-items:center;gap:.65rem;color:var(--green);font-weight:750;text-decoration:none;min-width:180px}.entity-link img{flex:none;border-radius:7px;object-fit:contain;background:var(--paper-deep)}.entity-link span{display:grid}.entity-link small{display:block;color:var(--muted);font-weight:400;margin-top:.2rem}.fish-places span{display:block;white-space:nowrap}code{font-size:.72rem;color:var(--muted)}
      @media(max-width:700px){.toolbar>*{flex:1 1 140px}.toolbar b{margin-left:0}.table-wrap th,.table-wrap td{padding:.6rem .5rem}.table-wrap th:first-child,.table-wrap td:first-child{position:static}.table-wrap .entity-link{min-width:0;gap:.4rem;align-items:flex-start}.table-wrap .entity-link img{width:30px;height:30px}.table-wrap .entity-link span{min-width:0;overflow-wrap:anywhere}.table-wrap .entity-link small{font-size:.72rem}}
    `}</style>
  </>;
}
