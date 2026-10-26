import { useEffect, useMemo, useState } from 'react';
import MapCanvas from '../save/MapCanvas';
import { buildFarmScene, farmGround, FARM_BOUNDS, FARM_CELLS, FARM_REGIONS, FARM_SCENE, pickFarmCell, saveSeason, type MapArt } from '../../lib/saveMapScene';
import { landPosition } from '../../lib/saveMap';
import { farmableCells } from '../../lib/saveDaily';
import type { SerDocument } from '../../lib/ser';
import { withBase } from '../../lib/sitePath';
import { tr } from '../../i18n/active';
import '../../styles/save-map.css';

export interface MapHighlight { label: string; cells: number[] }

const AREA_MARK = { fill: '#7fbf6a40', stroke: '#9fd98a99' };
const HIGHLIGHT_MARK = { fill: '#ffd76a66', stroke: '#fff2aa' };
const PAD = 360;

function boundsOf(cells: number[]): number[] {
  const points = cells.map(landPosition);
  if (!points.length) return FARM_BOUNDS;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return [Math.min(...xs) - PAD, Math.min(...ys) - PAD, Math.max(...xs) + PAD, Math.max(...ys) + PAD];
}

/** The save editor's farm map, read-only, for marking which cells are farmland. */
export default function FarmAreaMap({ doc, area, highlight, onAdd, onRemove, onClearHighlight }: {
  doc: SerDocument;
  area: number[];
  highlight: MapHighlight | null;
  onAdd: (cells: number[]) => void;
  onRemove: (cells: number[]) => void;
  onClearHighlight: () => void;
}) {
  const [art, setArt] = useState<MapArt | null>(null), [loadError, setLoadError] = useState('');
  const [tool, setTool] = useState<'inspect' | 'pan'>('inspect');
  const [selected, setSelected] = useState<number[]>([]);
  const [focus, setFocus] = useState(() => ({ bounds: highlight ? boundsOf(highlight.cells) : FARM_BOUNDS, revision: 0 }));
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase('/maps/farm/manifest.json'), { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(tr('场景素材载入失败。')); return response.json(); })
      .then(setArt)
      .catch((error) => { if (error.name !== 'AbortError') setLoadError(error.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (highlight) setFocus((f) => ({ bounds: boundsOf(highlight.cells), revision: f.revision + 1 })); }, [highlight]);
  const season = useMemo(() => saveSeason(doc), [doc]);
  const sprites = useMemo(() => art ? buildFarmScene(doc, {}, art, season, false, FARM_SCENE) : [], [doc, art, season]);
  const ground = useMemo(() => farmGround(doc, {}, FARM_SCENE), [doc]);
  const inArea = useMemo(() => new Set(area), [area]);
  const marks = useMemo(() => [
    { cells: area, ...AREA_MARK },
    ...(highlight ? [{ cells: highlight.cells, ...HIGHLIGHT_MARK }] : []),
  ], [area, highlight]);
  const adding = selected.filter((id) => !inArea.has(id)).length, removing = selected.length - adding;

  return <section className="farm-editor daily-map" aria-label={tr('农田范围地图')}>
    <header className="farm-header">
      <div className="farm-title">
        <strong>{tr('农田范围')}</strong>
        <span>{tr('绿色格子是记住的农田；框选空地或田地后，可以加入或移出。')}</span>
      </div>
      <div className="farm-segments" role="group" aria-label={tr('地图工具')}>
        <button type="button" aria-pressed={tool === 'inspect'} onClick={() => setTool('inspect')}>{tr('框选')}</button>
        <button type="button" aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>{tr('平移')}</button>
      </div>
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
          <p><span className="daily-swatch is-highlight" aria-hidden="true" />{tr('{label}：{count} 格', { label: highlight.label, count: highlight.cells.length })}</p>
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
