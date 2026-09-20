import { containsPoint } from '../../lib/saveMapGeometry';
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
  allowedMapTerrain,
  cropGrowth, cropPlacementProblem, mapCells,
  addMapPlacement,
  placementProblem,
  draftObjects,
  objectFootprint,
  clearMapArea,
  type ClearLayer,
  MAP_CROPS,
  areaAvailable,
  applyMapEdits,
  parseMapPreset,
  mapEditCount,
  landId,
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
import MapGrowthControls from './MapGrowthControls';
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
  ['canal', '≈', '水渠／水田'],
  ['clear', '⌫', '清理']
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
    [restricted, setRestricted] = useState(false),
    [plants, setPlants] = useState(true),
    [facilities, setFacilities] = useState(true),
    [labels, setLabels] = useState(true);
  const [mature, setMature] = useState(false);
  const [category, setCategory] = useState('machine'), [cropSeason, setCropSeason] = useState('-1'), [machineFilter, setMachineFilter] = useState('');
  const [angle, setAngle] = useState(45), [clearLayer, setClearLayer] = useState<ClearLayer>('crops');
  const [selectedCells, setSelectedCells] = useState<number[]>([]);
  const [resetArea, setResetArea] = useState('1');
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionLimit, setSelectionLimit] = useState(40);
  const [selected, setSelected] = useState<string>(),
    [hover, setHover] = useState<Point | null>(null),
    [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [focus, setFocus] = useState({ bounds: FARM_BOUNDS, revision: 0 }),
    [message, setMessage] = useState('选择一块田地开始，或滚轮放大查看。');
  const [past, setPast] = useState<MapEdits[]>([]),
    [future, setFuture] = useState<MapEdits[]>([]);
  const [roomId, setRoomId] = useState('outdoor');
  const rooms = useMemo(() => art ? availableMapRooms(model.doc, art, edits) : [], [model, art, edits]);
  useEffect(()=>{
    if(roomId==='outdoor'||rooms.some(r=>r.id===roomId))return;
    const [scene,floor]=roomId.split(':').map(Number),old=MAP_DATA.objects.find(s=>s.mapId===scene);
    const next=rooms.find(r=>r.floor===floor&&(old?.code.includes('MYHOUSE')?r.name.startsWith('我的家'):MAP_DATA.objects.some(s=>s.mapId===r.scene&&s.buildingFamily===old?.buildingFamily&&s.slot===old?.slot)));
    setRoomId(next?.id??'outdoor');setSelection([]);setSelectedCells([]);setSelected(undefined);
    setFocus(f=>({bounds:next?.bounds??FARM_BOUNDS,revision:f.revision+1}));
  },[rooms,roomId]);
  const room = rooms.find(r => r.id === roomId);
  const sceneId = room?.scene ?? FARM_SCENE;
  const viewArt = useMemo(() => art && room ? { ...art, bounds: room.bounds, background: room.file, fixtures: room.fixtures } : art, [art, room]);
  const terrain = useMemo(() => sceneCells(sceneId).filter(c => !room || (c.x >= room.bounds[0] && c.x <= room.bounds[2] && c.y >= room.bounds[1] && c.y <= room.bounds[3])), [sceneId, room]);
  const pickCell = (p: Point) => pickFarmCell(p, terrain);
  function changeRoom(id: string) {
    const next = rooms.find(r => r.id === id);
    setRoomId(id); setSelection([]); setSelectedCells([]); setSelected(undefined); setSelectedPoint(null); setMoving(''); setHover(null); setTool('inspect');
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
  const templates = MAP_DATA.objects;
  const sprites = useMemo(
    () => (viewArt ? buildFarmScene(model.doc, edits, viewArt, season, mature, sceneId) : []),
    [model, edits, viewArt, season, mature, sceneId]
  );
  const ground = useMemo(() => farmGround(model.doc, edits, sceneId).filter(c => !room || terrain.some(t => t.id === c.id)), [model, edits, sceneId, room, terrain]);
  const chosen = sprites.find((s) => s.key === selected),
    target = hover && pickCell(hover);
  const savedCells=useMemo(()=>new Map(mapCells(model.doc).map(c=>[c.id,c])),[model]);
  const soilAt=(id:number)=>current.current.cells?.[`${sceneId}:${id}`]?.soil??savedCells.get(id)?.soil??1;
  const allowedTerrain=useMemo(()=>restricted?allowedMapTerrain(model.doc,edits,sceneId,tool,template,crop):[],[restricted,model,edits,sceneId,tool,template,crop]);
  const occupied = useMemo(()=>draftObjects(model.doc,edits),[model,edits]);
  function blocked(point: Point) {
    return occupied.some(o=>o.uid!==moving && !o.spec?.floor && o.blocksPlacement && objectFootprint(o).some(poly=>containsPoint(poly,point)));
  }
  function placementId(id=template) {
    const spec=templates.find(s=>s.id===id);
    if(!spec?.building || moving || !spec.mapId)return id;
    return templates.find(s=>s.buildingFamily===spec.buildingFamily && s.level===spec.level && s.mirror===spec.mirror && !occupied.some(o=>o.spec?.buildingFamily===s.buildingFamily&&o.spec.slot===s.slot))?.id??id;
  }
  const previewValid=!!target && areaAvailable(model.doc,target.area) && (tool==='place'
    ? !placementProblem(model.doc,{...edits,objects:(edits.objects??[]).filter(e=>!moving||e.move!==moving)},{scene:sceneId,cell:target.id,template:placementId(),angle,...(moving?{move:moving}:{})})
    : tool==='inspect'||tool==='pan'||tool==='clear'||!!(target.mask&1)&&!blocked(target)&&(tool!=='plant'||!cropPlacementProblem(crop,soilAt(target.id))));
  const nameOf = (s: SceneSprite) =>
    s.kind === 'crop'
      ? (names.names?.crops?.[s.id] ?? `作物 ${s.id}`)
      : (MAP_DATA.objects.find((o) => o.id === s.id)?.name ?? art?.fixedObjects?.find(o=>o.id===s.id)?.name ??
        (art?.objects[s.id]?.model.startsWith('arc_110') ? '我的家' : `场景设施 ${s.id}`));
  const palette = useMemo(
    () =>
      tool === 'plant'
        ? MAP_CROPS.filter(c=>cropSeason==='-1'||c.seasons.some(s=>s===['spring','summer','autumn','winter'][Number(cropSeason)])).map((c) => ({
            id: c.numeric_id,
            name: names.names?.crops?.[c.numeric_id] ?? c.name.zh_hans,
            kind: 'crop' as const
          }))
        : templates.filter(t => !t.code.includes('ARCHITECTURE_MYHOUSE_') && (!room || !t.building) && t.category===category && (!t.building || t.slot===1&&!t.mirror) && (category!=='machine'||!machineFilter||t.script===machineFilter)).map((t) => ({
            id: t.id,
            name: t.building ? `${t.name}${t.level>1?` · ${t.level} 级`:''}` : t.itemId ? itemLabel(names, String(t.itemId)) : t.name,
            kind: 'object' as const
          })),
    [tool, names, room, cropSeason, category, machineFilter]
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
        ? '选择物体后点击地图放置，按 R 切换朝向。'
        : next === 'plant'
          ? '选择作物，再点击或拖动种植。新增作物从种子开始生长。'
          : next === 'inspect'
            ? '点击选择，拖动框选；中键或双指平移。'
            : '在地图上点击或拖动使用工具。'
    );
  }
  function choose(p: Point, sprite?: SceneSprite) {
    const cell = pickCell(p);
    // Seedlings can be smaller than a pointer at overview zoom; their cell remains selectable.
    sprite ??= sprites.find(s=>s.kind==='crop'&&s.cell===cell?.id);
    setSelectedPoint(p);
    if (tool === 'inspect') {
      setSelection([]); setSelectedCells([]);
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
      try {
        const next=addMapPlacement(model.doc,current.current,{scene:sceneId,cell:cell.id,template:placementId(),angle,...(moving?{move:moving}:{})});
        applyMapEdits(model.doc, next);
        commit(next);
        setMessage(moving ? '设施已移动，可撤销。' : '设施已加入草稿，可继续放置。');
        if (moving) {
          if(moving.startsWith('new:'))setSelected(`new:${next.objects!.findIndex(e=>!e.move&&e.cell===cell.id&&e.template===template)}`);
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
        ? { crop, growth:0, form:1 }
        : tool === 'clear'
          ? { crop: null }
          : tool === 'water'
            ? { watered: true }
            : { soil: tool === 'ridge' ? 2 : tool==='canal'?3:1 };
    if(tool==='plant'){const problem=cropPlacementProblem(crop,soilAt(cell.id));if(problem){setMessage(problem);return;}}
    const radius = (brush - 1) / 2;
    const targets = terrain.filter(
      (c) =>
        Math.abs((c.x + c.y - cell.x - cell.y) / 90) <= radius &&
        Math.abs((c.y - c.x - cell.y + cell.x) / 90) <= radius &&
        (tool==='clear'||c.mask & 1) &&
        areaAvailable(model.doc, c.area) &&
        (tool==='clear'||!blocked(c)) && (tool!=='plant'||!cropPlacementProblem(crop,soilAt(c.id)))
    );
    if (!targets.length) {
      setMessage('这里不能耕作，或已被设施占用。');
      return;
    }
    if(tool==='clear') {
      const next=clearMapArea(model.doc,current.current,sceneId,targets.map(c=>c.id),[],clearLayer);
      commit(next);setMessage(`已清理 ${targets.length} 格，可整笔撤销。`);return;
    }
    const next = {
      ...current.current,
      cells: {
        ...current.current.cells,
        ...Object.fromEntries(
          targets.map((c) => [
            `${sceneId}:${c.id}`,
            paintCell(c.id,paint)
          ])
        )
      }
    };
    commit(next);
    setMessage(`已修改 ${targets.length} 格。可撤销，导出存档前会核验布局。`);
  }
  function paintCell(id:number,paint:CellPaint):CellPaint {
    const previous=current.current.cells?.[`${sceneId}:${id}`],cropId=previous?.crop!==undefined?previous.crop:savedCells.get(id)?.crop;
    const clear=paint.soil!==undefined&&cropId&&cropPlacementProblem(cropId,paint.soil);
    return {...previous,...paint,...(clear?{crop:null,growth:undefined,form:undefined}:{})};
  }
  function editGrowth(paint:CellPaint) {
    if(!chosen?.cell)return;
    commit({...current.current,cells:{...current.current.cells,[`${sceneId}:${chosen.cell}`]:{...current.current.cells?.[`${sceneId}:${chosen.cell}`],...paint}}});
    setMature(false);setMessage('生长状态已修改，可撤销。');
  }
  function matureSelection() {
    const cells={...current.current.cells};let count=0;
    for(const id of selectedCells){const state=cropGrowth(model.doc,current.current,sceneId,id),stages=state?.forms['1'];if(stages?.length){cells[`${sceneId}:${id}`]={...cells[`${sceneId}:${id}`],form:1,growth:stages.at(-1)![0]};count++;}}
    commit({...current.current,cells});setMature(false);setMessage(`已将 ${count} 株设为成熟，可撤销。`);
  }
  function clearSelection(layer: ClearLayer) {
    commit(clearMapArea(model.doc,current.current,sceneId,selectedCells,selection,layer));
    setSelected(undefined);setSelection([]);setSelectedCells([]);setMessage('选区已批量清理，可撤销。');
  }
  function paintSelection(paint: CellPaint) {
    const cells=terrain.filter(c=>selectedCells.includes(c.id)&&(c.mask&1)&&areaAvailable(model.doc,c.area)&&!blocked(c)&&(paint.crop==null||!cropPlacementProblem(paint.crop,soilAt(c.id))));
    if(!cells.length){setMessage('选区内没有可耕作的空地。');return;}
    commit({...current.current,cells:{...current.current.cells,...Object.fromEntries(cells.map(c=>[`${sceneId}:${c.id}`,paintCell(c.id,paint)]))}});
    setMessage(`已批量处理 ${cells.length} 格，可整次撤销。`);
  }
  function rotate() {
    const active=tool==='place'?templates.find(s=>s.id===template):templates.find(s=>s.id===chosen?.id);
    if(!active)return;
    const existing=chosen?.uid?occupied.find(o=>o.uid===chosen.uid):undefined;
    const originalDraft=chosen?.key.startsWith('new:')?current.current.objects?.[Number(chosen.key.slice(4))]:undefined;
    const degrees:Record<number,number>={1:135,3:45,7:-135,9:-45,2:90,4:180,6:0,8:-90};
    const options=active.rotations.map(c=>degrees[c]);
    const currentAngle=tool==='place'?angle:originalDraft?.angle??existing?.angle??45;
    const nextAngle=options.length?options[(options.indexOf(currentAngle)+1)%options.length]:currentAngle;
    const variant=active.reverse?templates.find(s=>s.id===active.reverse):undefined;
    if(!variant&&options.length<2){setMessage('这件物体没有其他朝向。');return;}
    if(tool==='place'){setAngle(nextAngle);if(variant)setTemplate(variant.id);return;}
    try {
      const base=current.current;
      const cell=originalDraft?.cell??(chosen&&pickCell(chosen)?.id);
      if(!cell)return;
      const next=addMapPlacement(model.doc,base,{scene:sceneId,cell,template:variant?.id??active.id,angle:nextAngle,...(existing?{move:existing.uid}:{})});
      commit(next);
      if(originalDraft)setSelected(`new:${next.objects!.findIndex(e=>!e.move&&e.cell===cell&&e.template===(variant?.id??active.id))}`);
      setMessage('朝向已修改，可撤销。');
    }catch(e){setMessage((e as Error).message);}
  }
  function upgrade(id:number) {
    if(!chosen?.uid)return;
    const cell=landId(chosen.x,chosen.y);
    try {commit(addMapPlacement(model.doc,current.current,{scene:sceneId,cell,template:id,move:chosen.uid,angle:occupied.find(o=>o.uid===chosen.uid)?.angle??45}));setSelected(undefined);setMessage('建筑升级已加入草稿，可撤销。');}
    catch(e){setMessage((e as Error).message);}
  }
  function cancelSelection() {
    setSelected(undefined);setSelection([]);setSelectedCells([]);setSelectedPoint(null);setHover(null);changeTool('inspect');
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
          cancelSelection();
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
            {TOOLS.filter(([id]) => !room || terrain.some(c => c.mask & 1) || ['inspect', 'pan', 'place', 'clear'].includes(id)).map(([id, icon, label]) => (
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
          {tool==='canal'&&<p className="farm-tool-note">画出水田后再种稻米、山葵。转换地形会清除不适合该土壤的作物，可撤销。</p>}
          {tool==='clear' && <div className="farm-clear-options"><label>清理层级</label><SearchableSelect value={clearLayer} onChange={e=>setClearLayer(e.target.value as ClearLayer)}>
            <option value="crops">作物与树木</option><option value="floor">地板／道路</option><option value="objects">设施与建筑</option><option value="reset">全部清空并恢复平地</option>
          </SearchableSelect><small>拖动清理选定层级，每笔都可撤销。</small>
            {!room&&<><label htmlFor="farm-reset-area">整块田地</label><SearchableSelect id="farm-reset-area" value={resetArea} onChange={e=>setResetArea(e.target.value)}>{FARM_REGIONS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</SearchableSelect>
            <button type="button" onClick={()=>{const cells=terrain.filter(c=>c.area===Number(resetArea)&&areaAvailable(model.doc,c.area));commit(clearMapArea(model.doc,current.current,sceneId,cells.map(c=>c.id),[],'reset'));setMessage('这块田地已恢复平地，可撤销。');}}>清空整块田地并恢复平地</button></>}
          </div>}
          {['plant', 'place'].includes(tool) ? (
            <div className="farm-palette">
              <label htmlFor="farm-palette-search">{tool === 'plant' ? '选择作物' : '选择设施'}</label>
              {tool==='plant'?<SearchableSelect aria-label="作物季节" value={cropSeason} onChange={e=>{setCropSeason(e.target.value);setLimit(40);}}>
                <option value="-1">全部季节</option>{['春','夏','秋','冬'].map((s,i)=><option key={i} value={i}>{s}</option>)}
              </SearchableSelect>:<><div className="farm-category-tabs">{[['machine','加工设备'],['building','建筑'],['floor','地板／道路'],['furniture','家具／装饰']].filter(([id])=>!room||id!=='building').map(([id,label])=><button type="button" key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setMachineFilter('');setSearch('');setLimit(40);}}>{label}</button>)}</div>
              {category==='machine'&&<SearchableSelect aria-label="设备类别" value={machineFilter} onChange={e=>{setMachineFilter(e.target.value);setLimit(40);}}><option value="">全部设备类别</option>{Array.from(new Map(templates.filter(t=>t.category==='machine').map(t=>[t.script,t])).values()).map(t=><option key={t.script} value={t.script}>{t.name}</option>)}</SearchableSelect>}
              <button type="button" onClick={rotate}>↻ 旋转（R）</button></>}
              <input
                id="farm-palette-search"
                placeholder="名称、拼音或 ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(40);
                }}
              />
              {tool==='plant'&&selectedCells.length>0&&<button type="button" onClick={()=>paintSelection({crop,growth:0,form:1})}>种植到选区（{selectedCells.length} 格）</button>}
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
                          p.kind === 'crop' ? setCrop(p.id) : setTemplate(p.id);setAngle(templates.find(t=>t.id===p.id)?.building?0:45);
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
                    {chosen.kind === 'crop' ? (mature ? '成熟预览' : '存档中的生长阶段') : chosen.key.startsWith('new:')?'新增设施':chosen.key.startsWith('fixed:')||chosen.key.startsWith('fixture:')?'固定场景设施':'存档中的设施'}
                    {chosen.edited ? ' · 已修改' : ''}
                  </small>
                  {chosen.movable && (
                    <button
                      type="button"
                      onClick={() => {
                        setTool('place');
                        setTemplate(chosen.id);
                        setMoving(chosen.uid!);
                        setAngle(occupied.find(o=>o.uid===chosen.uid)?.angle??45);
                        setMessage('点击新的位置移动这件设施。按 Esc 取消。');
                      }}
                    >
                      移动这件设施
                    </button>
                  )}
                  {chosen.movable&&<button type="button" onClick={()=>{commit(clearMapArea(model.doc,current.current,sceneId,[],[chosen.key],chosen.floor?'floor':'objects'));cancelSelection();setMessage('已删除所选物体，可撤销。');}}>删除这件{templates.find(t=>t.id===chosen.id)?.building?'建筑':'设施'}</button>}
                  {chosen.kind==='object'&&chosen.movable&&<button type="button" onClick={rotate}>↻ 调整朝向（R）</button>}
                  {chosen.uid&&templates.find(t=>t.id===chosen.id)?.building&&<div className="farm-upgrades">{templates.filter(t=>{const active=templates.find(s=>s.id===chosen.id)!;return active.upgrade?t.id===active.upgrade:t.buildingFamily===active.buildingFamily&&t.slot===active.slot&&t.mirror===active.mirror&&t.level===active.level+1;}).map(t=><button type="button" key={t.id} onClick={()=>upgrade(t.id)}>升级为 {t.name} · {t.level} 级</button>)}</div>}
                  {chosen.kind==='crop'&&chosen.cell&&<MapGrowthControls state={cropGrowth(model.doc,edits,sceneId,chosen.cell)} onChange={editGrowth}/>}
                  {!selection.length && chosen.kind === 'crop' && chosen.cell && (
                    <button
                      type="button"
                      onClick={() => {
                        commit(clearMapArea(model.doc,current.current,sceneId,[chosen.cell!],[],'crops'));
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
              {(selection.length > 0 || selectedCells.length > 0) && <div className="farm-multi-selection">
                <strong>已框选 {selectedCells.length} 格 · {selection.length} 个物体</strong>
                <div className="farm-bulk-actions">{[['crops','清除作物'],['floor','清除地板'],['objects','清除设施'],['reset','全部重置为平地']].map(([id,label])=><button type="button" key={id} onClick={()=>clearSelection(id as ClearLayer)}>{label}</button>)}</div>
                <div className="farm-bulk-actions"><button type="button" onClick={()=>paintSelection({watered:true})}>批量浇水</button><button type="button" onClick={()=>paintSelection({soil:1})}>批量耕地</button><button type="button" onClick={()=>paintSelection({soil:2})}>批量田垄</button><button type="button" onClick={()=>paintSelection({soil:3})}>批量水田</button><button type="button" onClick={matureSelection}>作物／树木全部成熟</button><button type="button" onClick={()=>changeTool('plant')}>在选区种植…</button></div>
                <div>{sprites.filter(s => selection.includes(s.key)).slice(0, selectionLimit).map(s => <button type="button" key={s.key}
                  aria-pressed={selected === s.key} onClick={() => setSelected(s.key)}>{nameOf(s)}</button>)}</div>
                {selection.length > selectionLimit && <button type="button" onClick={() => setSelectionLimit(n => n + 40)}>显示更多</button>}
                <button type="button" onClick={() => { setSelection([]); setSelectedCells([]); setSelected(undefined); }}>取消框选</button>
              </div>}
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
              ['地形禁放区', restricted, setRestricted],
              ['地名', labels, setLabels],
              ['作物与树木', plants, setPlants],
              ['建筑与设施', facilities, setFacilities]
            ].filter(([label]) => !room || ['网格','建筑与设施','地形禁放区'].includes(String(label)) || terrain.some(c => c.mask & 1) && label !== '地名').map(([label, value, set]) => (
              <label key={String(label)}>
                <input
                  type="checkbox"
                  checked={value as boolean}
                  onChange={(e) => (set as Dispatch<SetStateAction<boolean>>)(e.target.checked)}
                />
                {label as string}
              </label>
            ))}
            {restricted&&<small>斜纹表示当前工具不能使用的地形；已有物体和完整占地以放置预览为准。</small>}
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
          allowedTerrain={restricted?allowedTerrain:undefined}
          plants={plants}
          facilities={facilities}
          labels={labels}
          brush={brush}
          selected={selected}
          selection={selection}
          selectedCells={selectedCells}
          onRotate={rotate}
          onCancel={cancelSelection}
          onSelect={(items, cells) => {
            setSelectedCells(cells);
            setSelectionLimit(40); setSelection(items.map(s => s.key)); setSelected(items[0]?.key);
            setMessage(`已框选 ${cells.length} 格、${items.length} 个物体，可批量清理。`);
          }}
          ghost={tool === 'place' ? spriteArt(art, 'object', template, season, undefined, angle) : undefined}
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
