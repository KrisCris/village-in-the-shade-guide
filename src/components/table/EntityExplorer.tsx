import { useEffect, useMemo, useState } from 'react';
import type { Entity } from '../../data/types';
import EntityDrawer from '../entity/EntityDrawer';

const seasonLabels: Record<string, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

function rowPrice(row: Entity, key: 'sell_price' | 'buy_price') { return typeof row[key] === 'number' ? row[key] : null; }

export default function EntityExplorer({ rows, kind, machineOptions = [] }: { rows: Entity[]; kind: string; machineOptions?: Array<{ id: string; name: string }> }) {
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState('');
  const [scope, setScope] = useState('');
  const [machine, setMachine] = useState('');
  const [sort, setSort] = useState('name');
  const [selected, setSelected] = useState<Entity | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get('q') ?? ''); setSeason(params.get('season') ?? ''); setScope(params.get('scope') ?? ''); setMachine(params.get('machine') ?? ''); setSort(params.get('sort') ?? 'name');
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query); if (season) params.set('season', season); if (scope) params.set('scope', scope); if (machine) params.set('machine', machine); if (sort !== 'name') params.set('sort', sort);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  }, [query, season, scope, machine, sort]);
  const shown = useMemo(() => rows.filter((row) => !query || row.searchText.includes(query.normalize('NFKC').toLowerCase())).filter((row) => !season || (row.seasons as string[] | undefined)?.includes(season)).filter((row) => scope !== 'plantable' || ((row.seed_item_ids as string[] | undefined)?.length ?? 0) > 0).filter((row) => scope !== 'special' || ((row.seed_item_ids as string[] | undefined)?.length ?? 0) === 0).filter((row) => !machine || (row.machine_ids as string[] | undefined)?.includes(machine)).sort((a, b) => {
    if (sort === 'sell') return (rowPrice(b, 'sell_price') ?? -1) - (rowPrice(a, 'sell_price') ?? -1);
    if (sort === 'buy') return (rowPrice(b, 'buy_price') ?? -1) - (rowPrice(a, 'buy_price') ?? -1);
    if (sort === 'duration') return Number(a.duration_minutes ?? Infinity) - Number(b.duration_minutes ?? Infinity);
    if (sort === 'profit') return Number(b.profit_per_day ?? -Infinity) - Number(a.profit_per_day ?? -Infinity);
    return a.name.zh_hans.localeCompare(b.name.zh_hans, 'zh-CN');
  }), [rows, query, season, scope, machine, sort]);
  return <>
    <div className="toolbar card"><label>页内搜索<input type="search" placeholder="名称、日文或 ID" value={query} onChange={(e) => setQuery(e.target.value)} /></label>{kind === 'crops' && <><label>范围<select value={scope} onChange={(e) => setScope(e.target.value)}><option value="">全部</option><option value="plantable">可种植作物</option><option value="special">采集 / 特殊作物</option></select></label><label>季节<select value={season} onChange={(e) => setSeason(e.target.value)}><option value="">全部</option>{Object.entries(seasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></>}{kind === 'processes' && <label>机械<select value={machine} onChange={(e) => setMachine(e.target.value)}><option value="">全部机械</option>{machineOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}<label>排序<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">名称</option><option value="sell">产值（高到低）</option><option value="buy">成本（高到低）</option>{['processes', 'crops'].includes(kind) && <option value="profit">日净收益（高到低）</option>}{kind === 'processes' && <option value="duration">加工时间</option>}</select></label><b>{shown.length} 条</b></div>
    <div className="table-wrap card"><table><thead><tr><th>名称</th><th>季节 / 类型</th><th>成本</th><th>产值</th><th>时间</th><th>日净收益</th><th>数据 ID</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id}><td><button className="entity-button" onClick={() => setSelected(row)}>{row.name.zh_hans}<small>{row.name.ja}</small></button></td><td>{(row.seasons as string[] | undefined)?.map((s) => seasonLabels[s] ?? s).join('、') || kind}</td><td className="price">{rowPrice(row, 'buy_price') ?? '—'}</td><td className="price">{rowPrice(row, 'sell_price') ?? '—'}</td><td>{typeof row.duration_minutes === 'number' ? `${Math.ceil(row.duration_minutes / 1440)} 日` : typeof row.growth_days === 'number' ? `${row.growth_days} 日${row.regrow_days ? ` / 再生 ${row.regrow_days} 日` : ''}` : '—'}</td><td className="price">{typeof row.profit_per_day === 'number' ? row.profit_per_day.toFixed(1) : '—'}</td><td><code>{row.id}</code></td></tr>)}</tbody></table></div>
    {selected && <EntityDrawer initial={selected} onClose={() => setSelected(null)} />}
    <style>{`
      .toolbar{display:flex;align-items:end;flex-wrap:wrap;gap:.8rem;padding:.8rem;margin:1.2rem 0}.toolbar label{display:grid;gap:.3rem;color:var(--muted);font-size:.78rem}.toolbar input,.toolbar select{min-height:42px;padding:.55rem .7rem;border:1px solid var(--border);border-radius:8px;background:var(--paper-raised);color:var(--ink)}.toolbar b{margin-left:auto;padding:.7rem;color:var(--green)}
      .table-wrap{overflow:auto;max-height:calc(100vh - 250px)}table{width:100%;border-collapse:collapse;font-size:.9rem}th{position:sticky;top:0;z-index:1;background:var(--paper-deep);text-align:left;white-space:nowrap}th,td{padding:.7rem .8rem;border-bottom:1px solid var(--border);vertical-align:top}tbody tr:hover{background:color-mix(in srgb,var(--green-soft) 45%,transparent)}.entity-button{border:0;background:transparent;padding:0;min-height:0;text-align:left;color:var(--green);font-weight:750}.entity-button small{display:block;color:var(--muted);font-weight:400;margin-top:.2rem}code{font-size:.72rem;color:var(--muted)}
      @media(max-width:700px){.toolbar>*{flex:1 1 140px}.toolbar b{margin-left:0}.table-wrap{max-height:none}th,td{min-width:100px}th:first-child,td:first-child{position:sticky;left:0;background:var(--paper-raised);z-index:1}}
    `}</style>
  </>;
}
