import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import {
  MAP_DATA,
  MAP_CROPS,
  mapObjects,
  areaAvailable,
  applyMapEdits,
  parseMapPreset,
  mapEditCount,
  landPosition,
  sceneCells,
  type MapEdits,
  type CellPaint
} from '../../lib/saveMap';
import {
  buildFarmScene,
  farmGround,
  FARM_BOUNDS,
  FARM_REGIONS,
  FARM_SCENE,
  pickFarmCell,
  saveSeason,
  spriteArt,
  type MapArt,
  type Point,
  type SceneSprite
} from '../../lib/saveMapScene';
import { withBase } from '../../lib/sitePath';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';
import MapCanvas from './MapCanvas';
import '../../styles/save-map.css';

import SearchableSelect from '../controls/SearchableSelect';
import { availableMapRooms } from '../../lib/saveMapRooms';
const TOOLS = [
  ['inspect', '↖', '选择'],
  ['pan', '✥', '平移'],
  ['plant', '♧', '种植'],
  ['place', '⌂', '设施'],
  ['water', '◉', '浇水'],
  ['soil', '▱', '耕地'],
  ['ridge', '≋', '田垄'],
  ['clear', '⌫', '清除作物']
];
interface Props {
  model: SaveModel;
  edits: MapEdits;
  names: SaveNameTables;
  onChange: Dispatch<SetStateAction<MapEdits>>;
}

export default function MapPanel({ model, edits, names, onChange }: Props) {
  const root = useRef<HTMLElement>(null),
    presetInput = useRef<HTMLInputElement>(null),
    current = useRef(edits);
  current.current = edits;
  const stroke = useRef<MapEdits | null>(null);
  const [art, setArt] = useState<MapArt | null>(null),
    [loadError, setLoadError] = useState('');
  const [tool, setTool] = useState('inspect'),
    [crop, setCrop] = useState(MAP_CROPS[0].numeric_id),
    [template, setTemplate] = useState(0),
    [moving, setMoving] = useState('');
  const [season, setSeason] = useState(() => saveSeason(model.doc)),
    [brush, setBrush] = useState(1),
    [search, setSearch] = useState(''),
    [limit, setLimit] = useState(40);
  const [grid, setGrid] = useState(false),
    [plants, setPlants] = useState(true),
    [facilities, setFacilities] = useState(true),
    [labels, setLabels] = useState(true);
  const [mature, setMature] = useState(false);
  const [selected, setSelected] = useState<string>(),
    [hover, setHover] = useState<Point | null>(null),
    [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [focus, setFocus] = useState({ bounds: FARM_BOUNDS, revision: 0 }),
    [message, setMessage] = useState('选择一块田地开始，或滚轮放大查看。');
  const [past, setPast] = useState<MapEdits[]>([]),
    [future, setFuture] = useState<MapEdits[]>([]);
  const [roomId, setRoomId] = useState('outdoor');
  const rooms = useMemo(() => art ? availableMapRooms(model.doc, art) : [], [model, art]);
  const room = rooms.find(r => r.id === roomId);
  const sceneId = room?.scene ?? FARM_SCENE;
  const viewArt = useMemo(() => art && room ? { ...art, bounds: room.bounds, background: room.file, fixtures: room.fixtures } : art, [art, room]);
  const terrain = useMemo(() => sceneCells(sceneId).filter(c => !room || (c.x >= room.bounds[0] && c.x <= room.bounds[2] && c.y >= room.bounds[1] && c.y <= room.bounds[3])), [sceneId, room]);
  const pickCell = (p: Point) => pickFarmCell(p, terrain);
  function changeRoom(id: string) {
    const next = rooms.find(r => r.id === id);
    setRoomId(id); setSelected(undefined); setSelectedPoint(null); setMoving(''); setHover(null); setTool('inspect');
    setFocus(f => ({ bounds: next?.bounds ?? FARM_BOUNDS, revision: f.revision + 1 }));
    setMessage(next ? `${next.name} · ${next.description}` : '选择一块田地开始，或滚轮放大查看。');
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase('/maps/farm/manifest.json'), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('场景素材载入失败。');
        return r.json();
      })
      .then(setArt)
      .catch((e) => {
        if (e.name !== 'AbortError') setLoadError(e.message);
      });
    return () => controller.abort();
  }, []);
  const objects = useMemo(() => mapObjects(model.doc), [model]);
  const templates = useMemo(
    () =>
      MAP_DATA.objects.filter((spec) =>
        objects.some(
          (o) => o.movable && (o.id === spec.id || (spec.building && o.spec?.family === spec.family))
        )
      ),
    [objects]
  );
  const sprites = useMemo(
    () => (viewArt ? buildFarmScene(model.doc, edits, viewArt, season, mature, sceneId) : []),
    [model, edits, viewArt, season, mature, sceneId]
  );
  const ground = useMemo(() => farmGround(model.doc, edits, sceneId).filter(c => !room || terrain.some(t => t.id === c.id)), [model, edits, sceneId, room, terrain]);
  const chosen = sprites.find((s) => s.key === selected),
    target = hover && pickCell(hover);
  const spec = templates.find((s) => s.id === template);
  const occupied = useMemo(
    () =>
      objects
        .map((o) => {
          const move = edits.objects?.findLast((e) => e.move === o.uid);
          return { ...o, ...(move ? landPosition(move.cell) : {}) };
        })
        .concat(
          (edits.objects ?? [])
            .filter((e) => !e.move)
            .flatMap((e) => {
              const donor = objects.find((o) => o.id === e.template);
              return donor ? [{ ...donor, ...landPosition(e.cell), uid: `new:${e.cell}` }] : [];
            })
        ),
    [objects, edits.objects]
  );
  function blocked(point: Point) {
    return occupied.some(
      (o) =>
        o.blocksPlacement &&
        point.x >= o.x + Math.min(o.bounds[0], -22) &&
        point.x <= o.x + Math.max(o.bounds[2], 22) &&
        point.y >= o.y + Math.min(o.bounds[1], -22) &&
        point.y <= o.y + Math.max(o.bounds[3], 22) &&
        o.uid !== moving
    );
  }
  function canPlace() {
    if (!target || !spec) return false;
    const donor = objects.find(
      (o) => o.movable && (o.id === template || (spec.building && o.spec?.family === spec.family))
    );
    if (!donor) return false;
    const [l, t, r, b] = donor.bounds,
      mask = spec.building ? 4 : 2;
    const box = {
      l: target.x + Math.min(l, -22),
      t: target.y + Math.min(t, -22),
      r: target.x + Math.max(r, 22),
      b: target.y + Math.max(b, 22)
    };
    if (!spec.floor && sprites.some(s => s.kind === 'crop' && s.x >= box.l && s.x <= box.r && s.y >= box.t && s.y <= box.b)) return false;
    if (
      !spec.floor &&
      occupied.some(
        (o) =>
          o.uid !== moving &&
          o.blocksPlacement &&
          box.l < o.x + Math.max(o.bounds[2], 22) &&
          box.r > o.x + Math.min(o.bounds[0], -22) &&
          box.t < o.y + Math.max(o.bounds[3], 22) &&
          box.b > o.y + Math.min(o.bounds[1], -22)
      )
    )
      return false;
    for (let x = Math.ceil(box.l / 45) * 45; x <= box.r; x += 45)
      for (let y = Math.ceil(box.t / 45) * 45; y <= box.b; y += 45) {
        if (
          (Math.round(x / 45) + Math.round(y / 45)) % 2 !==
          (Math.round(target.x / 45) + Math.round(target.y / 45)) % 2
        )
          continue;
        const c = terrain.find((c) => c.x === x && c.y === y);
        if (!c || !(c.mask & mask) || !areaAvailable(model.doc, c.area)) return false;
      }
    return true;
  }
  const previewValid =
    !!target &&
    areaAvailable(model.doc, target.area) &&
    (tool === 'inspect' ||
      tool === 'pan' ||
      (!!(target.mask & (tool === 'place' ? (spec?.building ? 4 : 2) : 1)) &&
        (tool === 'place' ? canPlace() : !blocked(target))));
  const nameOf = (s: SceneSprite) =>
    s.kind === 'crop'
      ? (names.names?.crops?.[s.id] ?? `作物 ${s.id}`)
      : (MAP_DATA.objects.find((o) => o.id === s.id)?.name ??
        (art?.objects[s.id]?.model.startsWith('arc_110') ? '我的家' : `场景设施 ${s.id}`));
  const palette = useMemo(
    () =>
      tool === 'plant'
        ? MAP_CROPS.map((c) => ({
            id: c.numeric_id,
            name: names.names?.crops?.[c.numeric_id] ?? c.name.zh_hans,
            kind: 'crop' as const
          }))
        : templates.filter(t => !room || !t.building).map((t) => ({
            id: t.id,
            name: t.itemId ? itemLabel(names, String(t.itemId)) : t.name,
            kind: 'object' as const
          })),
    [tool, templates, names, room]
  );
  const indexed = useMemo(
    () => palette.map((p) => ({ ...p, searchText: buildSaveSearchText(`${p.name} ${p.id}`) })),
    [palette]
  );
  const filtered = indexed.filter((p) => p.searchText.includes(normalizeSearch(search)));
  function commit(next: MapEdits) {
    const previous = current.current;
    if (!stroke.current) {
      setPast((p) => [...p.slice(-29), previous]);
      setFuture([]);
    }
    current.current = next;
    onChange(next);
  }
  function changeTool(next: string) {
    setTool(next);
    setMoving('');
    setSearch('');
    setLimit(40);
    setMessage(
      next === 'place'
        ? '选择设施，再点击地图放置。新增设施使用存档中的同型模板。'
        : next === 'plant'
          ? '选择作物，再点击或拖动种植。新增作物从种子开始生长。'
          : next === 'inspect'
            ? '点击查看作物或设施；拖动空白处浏览地图。'
            : '在地图上点击或拖动使用工具。'
    );
  }
  function choose(p: Point, sprite?: SceneSprite) {
    const cell = pickCell(p);
    setSelectedPoint(p);
    if (tool === 'inspect') {
      setSelected(sprite?.key);
      setMessage(sprite ? nameOf(sprite) : cell ? '此处可选择种植或放置工具。' : '道路、河岸与固定地形。');
      return;
    }
    if (!cell || !areaAvailable(model.doc, cell.area)) {
      setMessage(cell ? '这块田地尚未购买。' : '这里不在可编辑区域内。');
      return;
    }
    if (tool === 'place') {
      if (!template) {
        setMessage('先从左侧选择设施。');
        return;
      }
      const next = {
        ...current.current,
        objects: [
          ...(current.current.objects ?? []).filter((o) => !moving || o.move !== moving),
          { scene: sceneId, cell: cell.id, template, ...(moving ? { move: moving } : {}) }
        ]
      };
      try {
        applyMapEdits(model.doc, next);
        commit(next);
        setMessage(moving ? '设施已移动，可撤销。' : '设施已加入草稿，可继续放置。');
        if (moving) {
          setTool('inspect');
          setMoving('');
        }
      } catch (e) {
        setMessage((e as Error).message);
      }
      return;
    }
    const paint: CellPaint =
      tool === 'plant'
        ? { crop, soil: 1 }
        : tool === 'clear'
          ? { crop: null }
          : tool === 'water'
            ? { watered: true }
            : { soil: tool === 'ridge' ? 2 : 1 };
    const radius = (brush - 1) / 2;
    const targets = terrain.filter(
      (c) =>
        Math.abs((c.x + c.y - cell.x - cell.y) / 90) <= radius &&
        Math.abs((c.y - c.x - cell.y + cell.x) / 90) <= radius &&
        c.mask & 1 &&
        areaAvailable(model.doc, c.area) &&
        !blocked(c)
    );
    if (!targets.length) {
      setMessage('这里不能耕作，或已被设施占用。');
      return;
    }
    const next = {
      ...current.current,
      cells: {
        ...current.current.cells,
        ...Object.fromEntries(
          targets.map((c) => [
            `${sceneId}:${c.id}`,
            { ...current.current.cells?.[`${sceneId}:${c.id}`], ...paint }
          ])
        )
      }
    };
    commit(next);
    setMessage(`已修改 ${targets.length} 格。可撤销，导出存档前会核验布局。`);
  }
  function finishStroke(start: boolean) {
    if (start) {
      stroke.current = current.current;
      return;
    }
    if (stroke.current && stroke.current !== current.current) {
      const previous = stroke.current;
      setPast((p) => [...p.slice(-29), previous]);
      setFuture([]);
    }
    stroke.current = null;
  }
  function undo() {
    if (!past.length) return;
    const value = past[past.length - 1],
      previous = current.current;
    setFuture((p) => [previous, ...p]);
    setPast((p) => p.slice(0, -1));
    current.current = value;
    onChange(value);
  }
  function redo() {
    if (!future.length) return;
    const value = future[0],
      previous = current.current;
    setPast((p) => [...p, previous]);
    setFuture((p) => p.slice(1));
    current.current = value;
    onChange(value);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, game: 'honogurashi', edits }, null, 2)], {
        type: 'application/json'
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'village-layout.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  if (loadError) return <p role="alert">{loadError}请刷新重试。</p>;
  if (!art) return <p role="status">正在载入农场地图…</p>;
  return (
    <section
      ref={root}
      className="farm-editor"
      onKeyDown={(e) => {
        if (
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === 'z' &&
          !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
        ) {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if (e.key === 'Escape') {
          changeTool('inspect');
        }
      }}
    >
      <header className="farm-header">
        <div>
          <strong>{room ? room.name : '农场布局'}</strong>
          <span>{room ? room.description : '三块田地 · 游戏原始场景'}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else root.current?.requestFullscreen().catch(() => setMessage('浏览器未能进入全屏。'));
          }}
        >
          ⛶ 全屏
        </button>
      </header>
      <div className="farm-room-switch">
        <label htmlFor="farm-room-select">所在位置</label>
        <SearchableSelect id="farm-room-select" value={roomId} onChange={e => changeRoom(e.target.value)}>
          <option value="outdoor">室外 · 三块田地</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {r.description}</option>)}
        </SearchableSelect>
        {room && <div className="farm-floor-tabs" role="group" aria-label="房屋楼层">{rooms.filter(r => r.scene === room.scene || (room.name.startsWith('我的家') && r.name.startsWith('我的家'))).map(r => <button type="button" key={r.id} aria-pressed={r.id === roomId} onClick={() => changeRoom(r.id)}>{r.name.startsWith('我的家') ? r.name.split(' · ')[1] : '室内全貌'}</button>)}</div>}
      </div>
      {!room && <nav className="farm-regions" aria-label="定位田地">
        <button
          type="button"
          onClick={() => setFocus((f) => ({ bounds: FARM_BOUNDS, revision: f.revision + 1 }))}
        >
          <strong>全貌</strong>
          <small>三块田地</small>
        </button>
        {FARM_REGIONS.map((r) => (
          <button
            type="button"
            key={r.id}
            onClick={() => setFocus((f) => ({ bounds: r.bounds, revision: f.revision + 1 }))}
          >
            <strong>{r.name}</strong>
            <small>
              {r.description}
              {!areaAvailable(model.doc, r.id) ? ' · 未购买' : ''}
            </small>
          </button>
        ))}
      </nav>}
      <div className="farm-workspace">
        <aside className="farm-sidebar">
          <div className="farm-tools" role="group" aria-label="地图工具">
            {TOOLS.filter(([id]) => !room || terrain.some(c => c.mask & 1) || ['inspect', 'pan', 'place'].includes(id)).map(([id, icon, label]) => (
              <button type="button" key={id} aria-pressed={tool === id} onClick={() => changeTool(id)}>
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          {!['inspect', 'pan', 'place'].includes(tool) && (
            <div className="farm-brush">
              <span>笔刷</span>
              {[1, 3, 5].map((n) => (
                <button type="button" key={n} aria-pressed={brush === n} onClick={() => setBrush(n)}>
                  {n}×{n}
                </button>
              ))}
            </div>
          )}
          {['plant', 'place'].includes(tool) ? (
            <div className="farm-palette">
              <label htmlFor="farm-palette-search">{tool === 'plant' ? '选择作物' : '选择设施'}</label>
              <input
                id="farm-palette-search"
                placeholder="名称、拼音或 ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(40);
                }}
              />
              <div
                className="farm-palette-scroll"
                onScroll={(e) => {
                  const t = e.currentTarget;
                  if (t.scrollHeight - t.scrollTop - t.clientHeight < 180)
                    setLimit((n) => Math.min(n + 40, filtered.length));
                }}
              >
                <div className="farm-palette-grid">
                  {filtered.slice(0, limit).map((p) => {
                    const sprite = spriteArt(art, p.kind, p.id, season);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        aria-pressed={(tool === 'plant' ? crop : template) === p.id}
                        onClick={() => {
                          p.kind === 'crop' ? setCrop(p.id) : setTemplate(p.id);
                          setMoving('');
                        }}
                        title={p.name}
                      >
                        {sprite ? (
                          <img src={withBase(`/maps/farm/${sprite.file}`)} alt="" loading="lazy" />
                        ) : (
                          <span className="farm-no-art">◇</span>
                        )}
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
                {!filtered.length && <p>没有匹配的项目。</p>}
              </div>
              <small>
                {filtered.length} 项{moving ? ' · 正在移动已选设施' : ''}
              </small>
            </div>
          ) : (
            <div className="farm-selection">
              {chosen ? (
                <>
                  <strong>{nameOf(chosen)}</strong>
                  {chosen.art && <img src={withBase(`/maps/farm/${chosen.art.file}`)} alt={nameOf(chosen)} />}
                  <small>
                    {chosen.kind === 'crop' ? (mature ? '成熟预览' : '存档中的生长阶段') : '存档中的设施'}
                    {chosen.edited ? ' · 已修改' : ''}
                  </small>
                  {chosen.movable && (
                    <button
                      type="button"
                      onClick={() => {
                        setTool('place');
                        setTemplate(chosen.id);
                        setMoving(chosen.uid!);
                        setMessage('点击新的位置移动这件设施。按 Esc 取消。');
                      }}
                    >
                      移动这件设施
                    </button>
                  )}
                  {chosen.kind === 'crop' && chosen.cell && (
                    <button
                      type="button"
                      onClick={() => {
                        commit({
                          ...current.current,
                          cells: {
                            ...current.current.cells,
                            [`${sceneId}:${chosen.cell}`]: {
                              ...current.current.cells?.[`${sceneId}:${chosen.cell}`],
                              crop: null
                            }
                          }
                        });
                        setSelected(undefined);
                      }}
                    >
                      清除这株作物
                    </button>
                  )}
                </>
              ) : (
                <>
                  <strong>从真实场景开始</strong>
                  <p>{room ? '点击家具查看详情，选择移动后点击新位置。' : '点击上方田地名称定位。放大后，点击作物或设施查看详情。'}</p>
                  <p>选择种植、设施等工具后，地图会显示落点预览。</p>
                </>
              )}
              {selectedPoint && (
                <small>
                  位置 {Math.round(chosen?.x ?? selectedPoint.x)}, {Math.round(chosen?.y ?? selectedPoint.y)}
                </small>
              )}
            </div>
          )}
          <details className="farm-layer-options">
            <summary>{room ? '图层' : '季节与图层'}</summary>
            {!room && <><div className="farm-seasons">
              {['春', '夏', '秋', '冬'].map((s, i) => (
                <button type="button" key={s} aria-pressed={season === i} onClick={() => setSeason(i)}>
                  {s}
                </button>
              ))}
            </div>
            <small>仅切换预览，不修改存档季节。</small></>}
            {[
              ['成熟预览（不改变生长进度）', mature, setMature],
              ['网格', grid, setGrid],
              ['地名', labels, setLabels],
              ['作物与树木', plants, setPlants],
              ['建筑与设施', facilities, setFacilities]
            ].filter(([label]) => !room || ['网格','建筑与设施'].includes(String(label)) || terrain.some(c => c.mask & 1) && label !== '地名').map(([label, value, set]) => (
              <label key={String(label)}>
                <input
                  type="checkbox"
                  checked={value as boolean}
                  onChange={(e) => (set as Dispatch<SetStateAction<boolean>>)(e.target.checked)}
                />
                {label as string}
              </label>
            ))}
          </details>
        </aside>
        <MapCanvas
          art={viewArt!}
          terrain={terrain}
          regions={room ? [] : FARM_REGIONS}
          homeBounds={room?.bounds ?? FARM_BOUNDS}
          season={season}
          sprites={sprites}
          ground={ground}
          tool={tool}
          grid={grid}
          plants={plants}
          facilities={facilities}
          labels={labels}
          brush={brush}
          selected={selected}
          ghost={tool === 'place' ? spriteArt(art, 'object', template, season, undefined, objects.find(o => o.uid === moving || (!moving && o.id === template))?.angle) : undefined}
          previewValid={previewValid}
          focus={focus}
          onHover={setHover}
          onChoose={choose}
          onStroke={finishStroke}
        />
      </div>
      <footer className="farm-footer">
        <div className="farm-history">
          <button type="button" disabled={!past.length} onClick={undo}>
            ↶ 撤销
          </button>
          <button type="button" disabled={!future.length} onClick={redo}>
            ↷ 重做
          </button>
          <span>{mapEditCount(edits)} 处修改</span>
        </div>
        <p role="status">{message}</p>
        <div className="farm-files">
          <button
            type="button"
            onClick={() => {
              try {
                applyMapEdits(model.doc, edits);
                setMessage('布局结构与占地检查通过。');
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            检查布局
          </button>
          <button type="button" onClick={download}>
            导出布局
          </button>
          <button type="button" onClick={() => presetInput.current?.click()}>
            导入布局
          </button>
          <button
            type="button"
            disabled={!mapEditCount(edits)}
            onClick={() => {
              commit({});
              setMessage('已恢复原存档布局，可撤销此操作。');
            }}
          >
            恢复原布局
          </button>
        </div>
      </footer>
      <input
        ref={presetInput}
        type="file"
        hidden
        accept=".json,application/json"
        onChange={async (e) => {
          const input = e.currentTarget,
            file = input.files?.[0];
          if (!file) return;
          try {
            const next = parseMapPreset(await file.text());
            applyMapEdits(model.doc, next);
            commit(next);
            setMessage('布局已导入。');
          } catch (error) {
            setMessage((error as Error).message);
          }
          input.value = '';
        }}
      />

    </section>
  );
}
