import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import SearchableSelect from '../controls/SearchableSelect';
import { MAP_DATA, MAP_CROPS, mapCells, mapObjects, sceneCells, areaAvailable, applyMapEdits, parseMapPreset, mapEditCount, type MapEdits, type CellPaint } from '../../lib/saveMap';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';

export default function MapPanel({ model, edits, names, onChange }: { model: SaveModel; edits: MapEdits; names: SaveNameTables; onChange: Dispatch<SetStateAction<MapEdits>> }) {
  const presetInput = useRef<HTMLInputElement>(null);
  const [sceneId, setScene] = useState(MAP_DATA.scenes[1].id), [tool, setTool] = useState('inspect');
  const [crop, setCrop] = useState(MAP_CROPS[0].numeric_id), [template, setTemplate] = useState(0), [moving, setMoving] = useState('');
  const [page, setPage] = useState({ x: 0, y: 0 }), [message, setMessage] = useState(''), [brush, setBrush] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const cells = useMemo(() => mapCells(model.doc), [model]);
  const objects = useMemo(() => mapObjects(model.doc), [model]);
  const terrain = useMemo(() => sceneCells(sceneId), [sceneId]);
  const tiles = useMemo(() => terrain.map(c => ({ ...c, u: Math.round((c.x + c.y) / 90), v: Math.round((c.y - c.x) / 90) })), [terrain]);
  const minU = Math.min(...tiles.map(c => c.u)), minV = Math.min(...tiles.map(c => c.v));
  const byGrid = useMemo(() => new Map(tiles.map(c => [`${c.u},${c.v}`, c])), [tiles]);
  const templates = useMemo(() => MAP_DATA.objects.filter(spec => objects.some(o => o.movable && (o.id === spec.id || (spec.building && o.spec?.family === spec.family)))), [objects]);
  const chosen = templates.find(t => t.id === template);
  const current = tiles.find(c => c.id === selected);
  const placed = objects.filter(o => tiles.some(c => Math.abs(c.x - o.x) < 30 && Math.abs(c.y - o.y) < 30));
  useEffect(() => {
    const first = tiles.find(c => cells.some(e => e.id === c.id && e.crop)) ?? tiles.find(c => areaAvailable(model.doc, c.area));
    if (first) setPage({ x: Math.max(0, first.u - minU - 5), y: Math.max(0, first.v - minV - 5) });
  }, [sceneId, model]);
  function changeScene(id: number) { setScene(id); setPage({ x: 0, y: 0 }); setSelected(null); setMoving(''); }
  function apply(id: number) {
    setSelected(id);
    const cell = tiles.find(c => c.id === id); if (!cell || tool === 'inspect') return;
    if (!areaAvailable(model.doc, cell.area)) { setMessage('此区域尚未购买。'); return; }
    if (tool === 'place') {
      if (!chosen) { setMessage('请先选择物体。'); return; }
      const next = { ...edits, objects: [...(edits.objects ?? []).filter(o => !moving || o.move !== moving), { scene: sceneId, cell: id, template, ...(moving ? { move: moving } : {}) }] };
      try { applyMapEdits(model.doc, next); onChange(next); setMessage('已加入布局草稿。'); } catch (error) { setMessage((error as Error).message); }
      return;
    }
    const paint: CellPaint = tool === 'plant' ? { crop, soil: 1 } : tool === 'clear' ? { crop: null } : tool === 'water' ? { watered: true } : { soil: tool === 'ridge' ? 2 : 1 };
    const targets = tiles.filter(c => Math.abs(c.u - cell.u) <= (brush - 1) / 2 && Math.abs(c.v - cell.v) <= (brush - 1) / 2 && (c.mask & 1) && areaAvailable(model.doc, c.area));
    onChange(previous => ({ ...previous, cells: { ...previous.cells, ...Object.fromEntries(targets.map(c => [`${sceneId}:${c.id}`, { ...previous.cells?.[`${sceneId}:${c.id}`], ...paint }])) } }));
    setMessage(targets.length ? `已修改 ${targets.length} 格，导出时核验完整布局。` : '此处不能耕作。');
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, game: 'honogurashi', edits }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'village-layout.json'; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="save-map-editor">
    <p>从游戏地形表读取可耕作、可放置和建筑区域。灰格不可编辑；棕格标出物体在存档中的占地范围。新物体使用本存档已有的同型模板，新增设备为空机。</p>
    <div className="save-map-controls"><label>场景<SearchableSelect value={sceneId} onChange={e => changeScene(Number(e.target.value))}>{MAP_DATA.scenes.filter(s => s.code !== 'MAP_ID_OPENWORLD').map(s => <option key={s.id} value={s.id}>{s.code === 'MAP_ID_OPENWORLD' ? '室外庭院' : s.code.replace('MAP_ID_', '').replace('MYHOUSE', '自宅').replace('LIVESTOCK_HOUSE', '畜舍').replace('AVIARY', '禽舍').replace('GREENHOUSE', '温室').replace('UNDERGROUND', '地下室').replace('MIRROR', '镜像').replace(/LV(\d+)/, '$1级').replace(/_0(\d)/g, ' $1号').replaceAll('_', ' · ')}</option>)}</SearchableSelect></label>
      <label>工具<SearchableSelect value={tool} onChange={e => setTool(e.target.value)}>{[['inspect', '查看'], ['plant', '种植'], ['clear', '清除作物'], ['water', '浇水'], ['soil', '耕地'], ['ridge', '田垄'], ['place', '放置 / 移动物体']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</SearchableSelect></label>
      {tool === 'plant' && <label>作物<SearchableSelect value={crop} onChange={e => setCrop(Number(e.target.value))}>{MAP_CROPS.map(c => <option key={c.id} value={c.numeric_id}>{names.names?.crops?.[c.numeric_id] ?? c.name.zh_hans}</option>)}</SearchableSelect></label>}
      {!['inspect', 'place'].includes(tool) && <label>刷子<SearchableSelect value={brush} onChange={e => setBrush(Number(e.target.value))}>{[1, 3, 5].map(n => <option key={n} value={n}>{n} × {n}</option>)}</SearchableSelect></label>}
      {tool === 'place' && <label>物体模板<SearchableSelect value={template} onChange={e => { setTemplate(Number(e.target.value)); setMoving(''); }}><option value={0}>选择物体</option>{templates.map(o => <option key={o.id} value={o.id}>{o.itemId ? itemLabel(names, String(o.itemId)) : o.name}{o.building ? ' · 建筑' : o.floor ? ' · 地板' : ''}</option>)}</SearchableSelect></label>}
    </div>
    <div className="save-map-navigation"><button type="button" onClick={() => setPage(p => ({ ...p, x: Math.max(0, p.x - 12) }))}>←</button><button type="button" onClick={() => setPage(p => ({ ...p, y: Math.max(0, p.y - 12) }))}>↑</button><button type="button" onClick={() => setPage(p => ({ ...p, y: Math.min(Math.max(...tiles.map(c => c.v)) - minV, p.y + 12) }))}>↓</button><button type="button" onClick={() => setPage(p => ({ ...p, x: Math.min(Math.max(...tiles.map(c => c.u)) - minU, p.x + 12) }))}>→</button><label>定位地块<SearchableSelect value="" onChange={e => { const c = tiles.find(c => c.id === Number(e.target.value)); if (c) setPage({ x: Math.max(0, c.u - minU - 5), y: Math.max(0, c.v - minV - 5) }); }}><option value="">选择已有作物</option>{cells.filter(c => c.crop && tiles.some(t => t.id === c.id)).filter((_, i) => i % 12 === 0).map(c => <option key={c.id} value={c.id}>{names.names?.crops?.[c.crop] ?? '作物'} · {c.id}</option>)}</SearchableSelect></label></div>
    <div className="save-map-scroll"><div className="save-map-grid" role="group" aria-label="地图格子，选择工具后点击或拖动涂抹">{Array.from({ length: 24 * 24 }, (_, i) => {
      const u = minU + page.x + i % 24, v = minV + page.y + Math.floor(i / 24), c = byGrid.get(`${u},${v}`);
      const original = c && cells.find(x => x.id === c.id), paint = c && edits.cells?.[`${sceneId}:${c.id}`];
      const obj = c && placed.find(o => !edits.objects?.some(e => e.move === o.uid) && c.x >= o.x + Math.min(o.bounds[0], -22) && c.x <= o.x + Math.max(o.bounds[2], 22) && c.y >= o.y + Math.min(o.bounds[1], -22) && c.y <= o.y + Math.max(o.bounds[3], 22));
      const staged = c && edits.objects?.some(o => o.scene === sceneId && o.cell === c.id);
      const cropId = paint?.crop !== undefined ? paint.crop : original?.crop;
      const available = c && areaAvailable(model.doc, c.area);
      const label = !c ? '不可放置' : !available ? '尚未购买' : obj ? obj.spec?.name ?? '已有设施' : cropId ? names.names?.crops?.[cropId] ?? '作物' : c.mask & 1 ? '可耕作' : '可放置';
      return <button type="button" key={i} disabled={!available} className={`${!available ? 'blocked' : obj || staged ? 'object' : cropId ? 'crop' : c.mask & 1 ? 'farm' : 'ground'} ${paint || staged ? 'edited' : ''}`} aria-label={`${label} ${c?.id ?? ''}`} aria-pressed={!!c && selected === c.id} title={label} onPointerDown={e => { if (e.button === 0 && c) { e.preventDefault(); apply(c.id); } }} onPointerEnter={e => { if ((e.buttons & 1) && c && !['place', 'inspect'].includes(tool)) apply(c.id); }} onClick={e => { if (e.detail === 0 && c) apply(c.id); }}>{obj || staged ? '▣' : cropId ? '♧' : paint?.watered ? '·' : ''}</button>;
    })}</div></div>
    <div className="save-map-legend"><span>绿色：可耕作</span><span>棕色：物体</span><span>灰色：不可编辑</span><span>金边：草稿</span></div>
    {current && <p>选中位置：{current.x}, {current.y}。{placed.filter(o => current.x >= o.x + Math.min(o.bounds[0], -22) && current.x <= o.x + Math.max(o.bounds[2], 22) && current.y >= o.y + Math.min(o.bounds[1], -22) && current.y <= o.y + Math.max(o.bounds[3], 22)).map(o => <span key={o.uid}>{o.spec?.name ?? `设施 ${o.id}`} · 占地 {o.bounds.map(Math.round).join(', ')} {o.movable && <button type="button" onClick={() => { setTemplate(o.id); setMoving(o.uid); setTool('place'); setMessage('点击目标格移动这件物体。'); }}>移动此物体</button>}</span>)}</p>}
    <div className="save-map-actions"><button type="button" onClick={() => { try { applyMapEdits(model.doc, edits); setMessage('布局结构与占地检查通过。'); } catch (error) { setMessage((error as Error).message); } }}>检查布局</button><button type="button" onClick={download}>导出布局预设</button><button type="button" onClick={() => presetInput.current?.click()}>导入布局预设</button><input ref={presetInput} hidden type="file" accept=".json,application/json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { const next = parseMapPreset(await file.text()); applyMapEdits(model.doc, next); onChange(next); setMessage('布局预设已导入。'); } catch (error) { setMessage((error as Error).message); } e.target.value = ''; }} /><button type="button" disabled={!mapEditCount(edits)} onClick={() => onChange({})}>撤销全部布局修改</button><span>{mapEditCount(edits)} 处布局修改</span></div>
    {message && <p role="status">{message}</p>}
    <style>{`.save-map-controls,.save-map-actions,.save-map-navigation,.save-map-legend{display:flex;flex-wrap:wrap;gap:.7rem;align-items:end;margin:.8rem 0}.save-map-controls label,.save-map-navigation label{display:grid;gap:.3rem;max-width:100%;min-width:150px}.save-map-scroll{overflow:auto;max-height:600px;background:var(--paper-deep);padding:.6rem;border-radius:10px}.save-map-grid{display:grid;grid-template-columns:repeat(24,26px);width:max-content;gap:2px;touch-action:pan-y}.save-map-grid button{width:26px;height:26px;min-height:0;padding:0;border:1px solid var(--border);border-radius:3px;background:var(--paper);font-size:16px}.save-map-grid .farm{background:var(--green-soft)}.save-map-grid .crop{background:var(--green);color:var(--paper)}.save-map-grid .object{background:#87674b;color:white}.save-map-grid .blocked{background:var(--border);opacity:.35}.save-map-grid .edited{border:2px solid var(--gold)}.save-map-grid [aria-pressed=true]{outline:2px solid var(--vermilion);outline-offset:1px}.save-map-legend{font-size:.8rem;color:var(--muted)}.save-map-actions input{max-width:230px}`}</style>
  </section>;
}
