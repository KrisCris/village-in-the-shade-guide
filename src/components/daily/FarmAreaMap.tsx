import { useEffect, useMemo, useState } from 'react';
import MapCanvas from '../save/MapCanvas';
import { buildFarmScene, farmGround, FARM_BOUNDS, FARM_CELLS, FARM_REGIONS, FARM_SCENE, pickFarmCell, saveSeason, type MapArt, type WorldArt } from '../../lib/saveMapScene';
import { landPosition } from '../../lib/saveMap';
import { farmableCells } from '../../lib/saveDaily';
import type { SerDocument } from '../../lib/ser';
import { withBase } from '../../lib/sitePath';
import { Icon, type MapTarget } from './dailyUi';
import { tr } from '../../i18n/active';
import '../../styles/save-map.css';

const AREA_MARK = { fill: '#7fbf6a40', stroke: '#9fd98a99' };
const HIGHLIGHT_MARK = { fill: '#d9483b66', stroke: '#ffb3a6', pin: true };
const PAD = 360;

function boundsOf(points: Array<{ x: number; y: number }>, pad: number): number[] {
  if (!points.length) return FARM_BOUNDS;
  // The terrain has too many cells to spread into Math.min.
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const { x, y } of points) {
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return [left - pad, top - pad, right + pad, bottom + pad];
}
const cellBounds = (cells: number[]) => boundsOf(cells.map(landPosition), PAD);
/** The overview shows the village around the farm, widened to take in any marked trees. */
const VILLAGE_VIEW = boundsOf(FARM_CELLS, 600);
const union = (a: number[], b: number[]) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** The save editor's farm map, read-only, inside the rest of the village: marks a target and edits which cells are farmland. */
export default function FarmAreaMap({ doc, area, highlight, onAdd, onRemove, onClearHighlight, onClose }: {
  doc: SerDocument;
  area: number[];
  highlight: MapTarget | null;
  onAdd: (cells: number[]) => void;
  onRemove: (cells: number[]) => void;
  onClearHighlight: () => void;
  onClose: () => void;
}) {
  const [art, setArt] = useState<MapArt | null>(null), [loadError, setLoadError] = useState('');
  const [world, setWorld] = useState<WorldArt | null>(null);
  const [tool, setTool] = useState<'inspect' | 'pan'>('inspect');
  const [selected, setSelected] = useState<number[]>([]);
  const [focus, setFocus] = useState(() => ({ bounds: highlight ? cellBounds(highlight.cells) : FARM_BOUNDS, revision: 0 }));
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase('/maps/farm/manifest.json'), { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(tr('场景素材载入失败。')); return response.json(); })
      .then(setArt)
      .catch((error) => { if (error.name !== 'AbortError') setLoadError(error.message); });
    // The village around the farm is optional: without it the farm still shows on its own.
    fetch(withBase('/maps/village/manifest.json'), { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then(setWorld)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => { if (highlight) setFocus((f) => ({ bounds: cellBounds(highlight.cells), revision: f.revision + 1 })); }, [highlight]);
  const season = useMemo(() => saveSeason(doc), [doc]);
  // With the village drawn, its trees and plants come from the save too. Village fixtures
  // that have no sprite (only the farm's are exported) are left out rather than drawn as dots.
  const sprites = useMemo(() => {
    if (!art) return [];
    if (!world) return buildFarmScene(doc, {}, art, season, false, FARM_SCENE);
    const [left, top, right, bottom] = art.bounds;
    return buildFarmScene(doc, {}, { ...art, bounds: world.bounds }, season, false, FARM_SCENE)
      .filter((sprite) => sprite.art || sprite.x >= left && sprite.x <= right && sprite.y >= top && sprite.y <= bottom);
  }, [doc, art, world, season]);
  const ground = useMemo(() => farmGround(doc, {}, FARM_SCENE), [doc]);
  const inArea = useMemo(() => new Set(area), [area]);
  const marks = useMemo(() => [
    { cells: area, ...AREA_MARK },
    ...(highlight ? [{ cells: highlight.cells, ...HIGHLIGHT_MARK }] : []),
  ], [area, highlight]);
  const village = useMemo(() => {
    if (!world) return undefined;
    const view = highlight ? union(VILLAGE_VIEW, cellBounds(highlight.cells)) : VILLAGE_VIEW;
    const { bounds } = world;
    return { art: world, view: [Math.max(view[0], bounds[0]), Math.max(view[1], bounds[1]), Math.min(view[2], bounds[2]), Math.min(view[3], bounds[3])] };
  }, [world, highlight]);
  const adding = selected.filter((id) => !inArea.has(id)).length, removing = selected.length - adding;
  const count = (target: MapTarget) => target.unit === 'trees'
    ? tr('{label}：{count} 棵', { label: target.label, count: target.cells.length })
    : tr('{label}：{count} 格', { label: target.label, count: target.cells.length });

  return <section className="farm-editor daily-map" aria-labelledby="daily-map-title">
    <header className="farm-header">
      <div className="farm-title">
        <strong id="daily-map-title">{tr('农场地图')}</strong>
        <span>{highlight ? count(highlight) : tr('绿色格子是记住的农田；框选空地或田地后，可以加入或移出。')}</span>
      </div>
      <div className="farm-segments" role="group" aria-label={tr('地图工具')}>
        <button type="button" aria-pressed={tool === 'inspect'} onClick={() => setTool('inspect')}>{tr('框选')}</button>
        <button type="button" aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>{tr('平移')}</button>
      </div>
      <button type="button" className="daily-map-close" aria-label={tr('关闭地图')} onClick={onClose}><Icon name="close" size={20} /></button>
    </header>
    <div className="farm-workspace">
      {art ? <MapCanvas
        art={art}
        terrain={FARM_CELLS}
        regions={FARM_REGIONS}
        homeBounds={FARM_BOUNDS}
        season={season}
        sprites={sprites}
        ground={ground}
        tool={tool}
        grid={false}
        plants
        facilities
        floors
        groundOnly={false}
        onGroundOnly={() => {}}
        labels
        brush={1}
        selection={[]}
        selectedCells={selected}
        onCancel={() => setSelected([])}
        onSelect={(_, cells) => setSelected(farmableCells(doc, cells))}
        onRotate={() => {}}
        previewValid
        focus={focus}
        onHover={() => {}}
        onChoose={(point) => {
          const cell = pickFarmCell(point, FARM_CELLS);
          setSelected(cell ? farmableCells(doc, [cell.id]) : []);
        }}
        onStroke={() => {}}
        marks={marks}
        world={village}
      /> : <div className="farm-viewport daily-map-loading" role="status">{loadError || tr('正在载入地图…')}</div>}
      <aside className="farm-panel" aria-label={tr('农田范围')}>
        <div className="farm-section">
          <h3>{selected.length ? tr('已选 {count} 格', { count: selected.length }) : tr('选择格子')}</h3>
          <p>{selected.length
            ? tr('其中 {adding} 格不在农田范围内，{removing} 格已在范围内。', { adding, removing })
            : tr('拖动鼠标框选，或点一格。只会选中能耕作的地面，建筑、设施和地板下的格子会被跳过。')}</p>
          <div className="farm-actions">
            <button type="button" className="farm-primary" disabled={!adding} onClick={() => { onAdd(selected); setSelected([]); }}>{tr('加入农田')}</button>
            <button type="button" disabled={!removing} onClick={() => { onRemove(selected); setSelected([]); }}>{tr('移出农田')}</button>
          </div>
        </div>
        {highlight && <div className="farm-section">
          <h3>{tr('地图上标出')}</h3>
          <p><span className="daily-swatch is-highlight" aria-hidden="true" />{count(highlight)}</p>
          <div className="farm-actions"><button type="button" onClick={onClearHighlight}>{tr('取消标记')}</button></div>
        </div>}
        <div className="farm-section">
          <h3>{tr('图例')}</h3>
          <p><span className="daily-swatch is-area" aria-hidden="true" />{tr('农田范围：{count} 格', { count: area.length })}</p>
          <p className="farm-note">{tr('读取存档时，所有耕地、田垄和水田会自动加入；手动移出的格子以后不会再自动加入。')}</p>
        </div>
      </aside>
    </div>
  </section>;
}
