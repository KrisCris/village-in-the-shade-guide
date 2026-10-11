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
  exportMapLayout,
  importMapLayout,
  parseMapLayout,
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
import TrimmedSprite from './TrimmedSprite';
import '../../styles/save-map.css';

import SearchableSelect from '../controls/SearchableSelect';
import { availableMapRooms } from '../../lib/saveMapRooms';
import { tr } from '../../i18n/active';
const ICONS: Record<string, string> = {
  inspect: 'M6 3.5l12.5 7.2-5.6 1.4L10 17.6z',
  pan: 'M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  plant: 'M12 21v-8.5M12 12.5C12 8.4 9 5.5 4.5 5.5c0 4.1 3 7 7.5 7zM12 10.5c0-3.4 2.4-6 6.5-6 0 3.4-2.4 6-6.5 6z',
  place: 'M4 11 12 4l8 7M6 9.4V20h12V9.4M10 20v-5h4v5',
  water: 'M12 3.5c3.4 4.4 5.8 7.4 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-3.2 2.4-6.2 5.8-10.6z',
  soil: 'M4 6h16v12H4zM4 10h16M4 14h16',
  ridge: 'M3 9.5c3-3 6 3 9 0s6-3 9 0M3 15.5c3-3 6 3 9 0s6-3 9 0',
  canal: 'M3 8c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 13c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 18c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0',
  clear: 'M8.5 20H20M5.6 14.6l8-8a2 2 0 0 1 2.8 0l2.3 2.3a2 2 0 0 1 0 2.8L12.2 18H9z M9.3 11l4.9 4.9',
  undo: 'M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2',
  redo: 'M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
};
function Icon({ name }: { name: string }) {
  return <svg className="farm-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}
const TOOL_GROUPS = [
  [['inspect', tr('选择')], ['pan', tr('平移')]],
  [['plant', tr('种植')], ['place', tr('设施')]],
  [['water', tr('浇水')], ['soil', tr('耕地')], ['ridge', tr('田垄')], ['canal', tr('水田')]],
  [['clear', tr('清理')]]
];
const TOOL_NAMES: Record<string, string> = Object.fromEntries(TOOL_GROUPS.flat());
const SEASONS = [tr('春'), tr('夏'), tr('秋'), tr('冬')];
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
    [message, setMessage] = useState(tr('选择一块田地开始，或滚轮放大查看。'));
  const [past, setPast] = useState<MapEdits[]>([]),
    [future, setFuture] = useState<MapEdits[]>([]);
  const [roomId, setRoomId] = useState('outdoor');
  const rooms = useMemo(() => art ? availableMapRooms(model.doc, art, edits) : [], [model, art, edits]);
  useEffect(()=>{
    if(roomId==='outdoor'||rooms.some(r=>r.id===roomId))return;
    const [scene,floor]=roomId.split(':').map(Number),old=MAP_DATA.objects.find(s=>s.mapId===scene);
    const next=rooms.find(r=>r.floor===floor&&(old?.code.includes('MYHOUSE')?r.home:MAP_DATA.objects.some(s=>s.mapId===r.scene&&s.buildingFamily===old?.buildingFamily&&s.slot===old?.slot)));
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
    setMessage(next ? `${next.name} · ${next.description}` : tr('选择一块田地开始，或滚轮放大查看。'));
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase('/maps/farm/manifest.json'), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(tr('场景素材载入失败。'));
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
      ? (names.names?.crops?.[s.id] ?? tr('作物 {id}', { id: s.id }))
      : (MAP_DATA.objects.find((o) => o.id === s.id)?.name ?? art?.fixedObjects?.find(o=>o.id===s.id)?.name ??
        (art?.objects[s.id]?.model.startsWith('arc_110') ? tr('我的家') : tr('场景设施 {id}', { id: s.id })));
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
            name: t.building ? `${t.name}${t.level>1?tr(' · {level} 级', { level: t.level }):''}` : t.itemId ? itemLabel(names, String(t.itemId)) : t.name,
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
        ? tr('选择物体后点击地图放置，按 R 切换朝向。')
        : next === 'plant'
          ? tr('选择作物，再点击或拖动种植。新增作物从种子开始生长。')
          : next === 'inspect'
            ? tr('点击选择，拖动框选；中键或双指平移。')
            : tr('在地图上点击或拖动使用工具。')
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
      setMessage(sprite ? nameOf(sprite) : cell ? tr('此处可选择种植或放置工具。') : tr('道路、河岸与固定地形。'));
      return;
    }
    if (!cell || !areaAvailable(model.doc, cell.area)) {
      setMessage(cell ? tr('这块田地尚未购买。') : tr('这里不在可编辑区域内。'));
      return;
    }
    if (tool === 'place') {
      if (!template) {
        setMessage(tr('先从左侧选择设施。'));
        return;
      }
      try {
        const next=addMapPlacement(model.doc,current.current,{scene:sceneId,cell:cell.id,template:placementId(),angle,...(moving?{move:moving}:{})});
        applyMapEdits(model.doc, next);
        commit(next);
        setMessage(moving ? tr('设施已移动，可撤销。') : tr('设施已加入草稿，可继续放置。'));
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
      setMessage(tr('这里不能耕作，或已被设施占用。'));
      return;
    }
    if(tool==='clear') {
      const next=clearMapArea(model.doc,current.current,sceneId,targets.map(c=>c.id),[],clearLayer);
      commit(next);setMessage(tr('已清理 {count} 格，可整笔撤销。', { count: targets.length }));return;
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
    setMessage(tr('已修改 {count} 格。可撤销，导出存档前会核验布局。', { count: targets.length }));
  }
  function paintCell(id:number,paint:CellPaint):CellPaint {
    const previous=current.current.cells?.[`${sceneId}:${id}`],cropId=previous?.crop!==undefined?previous.crop:savedCells.get(id)?.crop;
    const clear=paint.soil!==undefined&&cropId&&cropPlacementProblem(cropId,paint.soil);
    return {...previous,...paint,...(clear?{crop:null,growth:undefined,form:undefined}:{})};
  }
  function editGrowth(paint:CellPaint) {
    if(!chosen?.cell)return;
    commit({...current.current,cells:{...current.current.cells,[`${sceneId}:${chosen.cell}`]:{...current.current.cells?.[`${sceneId}:${chosen.cell}`],...paint}}});
    setMature(false);setMessage(tr('生长状态已修改，可撤销。'));
  }
  function matureSelection() {
    const cells={...current.current.cells};let count=0;
    for(const id of selectedCells){const state=cropGrowth(model.doc,current.current,sceneId,id),stages=state?.forms['1'];if(stages?.length){cells[`${sceneId}:${id}`]={...cells[`${sceneId}:${id}`],form:1,growth:stages.at(-1)![0]};count++;}}
    commit({...current.current,cells});setMature(false);setMessage(tr('已将 {count} 株设为成熟，可撤销。', { count }));
  }
  function clearSelection(layer: ClearLayer) {
    commit(clearMapArea(model.doc,current.current,sceneId,selectedCells,selection,layer));
    setSelected(undefined);setSelection([]);setSelectedCells([]);setMessage(tr('选区已批量清理，可撤销。'));
  }
  function paintSelection(paint: CellPaint) {
    const cells=terrain.filter(c=>selectedCells.includes(c.id)&&(c.mask&1)&&areaAvailable(model.doc,c.area)&&!blocked(c)&&(paint.crop==null||!cropPlacementProblem(paint.crop,soilAt(c.id))));
    if(!cells.length){setMessage(tr('选区内没有可耕作的空地。'));return;}
    commit({...current.current,cells:{...current.current.cells,...Object.fromEntries(cells.map(c=>[`${sceneId}:${c.id}`,paintCell(c.id,paint)]))}});
    setMessage(tr('已批量处理 {count} 格，可整次撤销。', { count: cells.length }));
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
    if(!variant&&options.length<2){setMessage(tr('这件物体没有其他朝向。'));return;}
    if(tool==='place'){setAngle(nextAngle);if(variant)setTemplate(variant.id);return;}
    try {
      const base=current.current;
      const cell=originalDraft?.cell??(chosen&&pickCell(chosen)?.id);
      if(!cell)return;
      const next=addMapPlacement(model.doc,base,{scene:sceneId,cell,template:variant?.id??active.id,angle:nextAngle,...(existing?{move:existing.uid}:{})});
      commit(next);
      if(originalDraft)setSelected(`new:${next.objects!.findIndex(e=>!e.move&&e.cell===cell&&e.template===(variant?.id??active.id))}`);
      setMessage(tr('朝向已修改，可撤销。'));
    }catch(e){setMessage((e as Error).message);}
  }
  function upgrade(id:number) {
    if(!chosen?.uid)return;
    const cell=landId(chosen.x,chosen.y);
    try {commit(addMapPlacement(model.doc,current.current,{scene:sceneId,cell,template:id,move:chosen.uid,angle:occupied.find(o=>o.uid===chosen.uid)?.angle??45}));setSelected(undefined);setMessage(tr('建筑升级已加入草稿，可撤销。'));}
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
      new Blob([JSON.stringify(exportMapLayout(model.doc, edits))], {
        type: 'application/json'
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'village-layout.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  if (loadError) return <p role="alert">{loadError}{tr('请刷新重试。')}</p>;
  if (!art) return <p role="status">{tr('正在载入农场地图…')}</p>;
  const brushTool = ['plant', 'water', 'soil', 'ridge', 'canal', 'clear'].includes(tool);
  const availableTools = TOOL_GROUPS.map(group => group.filter(([id]) => !room || terrain.some(c => c.mask & 1) || ['inspect', 'pan', 'place', 'clear'].includes(id))).filter(group => group.length);
  const activeTemplate = templates.find(t => t.id === template);
  const layerToggles: Array<[string, boolean, Dispatch<SetStateAction<boolean>>]> = ([
    [tr('成熟预览（不改变生长进度）'), mature, setMature],
    [tr('网格'), grid, setGrid],
    [tr('地形禁放区'), restricted, setRestricted],
    [tr('地名'), labels, setLabels],
    [tr('作物与树木'), plants, setPlants],
    [tr('建筑与设施'), facilities, setFacilities]
  ] as Array<[string, boolean, Dispatch<SetStateAction<boolean>>]>).filter(([label]) => !room || [tr('网格'), tr('建筑与设施'), tr('地形禁放区')].includes(label) || terrain.some(c => c.mask & 1) && label !== tr('地名'));
  const pickPalette = (p: { id: number; kind: 'crop' | 'object' }) => {
    p.kind === 'crop' ? setCrop(p.id) : setTemplate(p.id);
    setAngle(templates.find(t => t.id === p.id)?.building ? 0 : 45);
    setMoving('');
  };
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
        <div className="farm-title">
          <strong>{room ? room.name : tr('农场布局')}</strong>
          <span>{room ? room.description : tr('三块田地 · 游戏原始场景')}</span>
        </div>
        <div className="farm-place">
          <SearchableSelect id="farm-room-select" aria-label={tr('所在位置')} value={roomId} onChange={e => changeRoom(e.target.value)}>
            <option value="outdoor">{tr('室外 · 三块田地')}</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {r.description}</option>)}
          </SearchableSelect>
          {room
            ? <div className="farm-segments" role="group" aria-label={tr('房屋楼层')}>{rooms.filter(r => r.scene === room.scene || (room.home && r.home)).map(r => <button type="button" key={r.id} aria-pressed={r.id === roomId} onClick={() => changeRoom(r.id)}>{r.floorName ?? tr('室内全貌')}</button>)}</div>
            : <nav className="farm-segments" aria-label={tr('定位田地')}>
              <button type="button" title={tr('三块田地')} onClick={() => setFocus((f) => ({ bounds: FARM_BOUNDS, revision: f.revision + 1 }))}>{tr('全貌')}</button>
              {FARM_REGIONS.map((r) => {
                const owned = areaAvailable(model.doc, r.id);
                return <button type="button" key={r.id} title={`${r.description}${owned ? '' : tr(' · 未购买')}`} className={owned ? undefined : 'is-locked'} onClick={() => setFocus((f) => ({ bounds: r.bounds, revision: f.revision + 1 }))}>{r.name}</button>;
              })}
            </nav>}
        </div>
        <button
          type="button"
          className="farm-icon-button"
          aria-label={tr('全屏')}
          title={tr('全屏')}
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else root.current?.requestFullscreen().catch(() => setMessage(tr('浏览器未能进入全屏。')));
          }}
        >
          <Icon name="expand" />
        </button>
      </header>
      <div className="farm-toolbar" role="toolbar" aria-label={tr('地图工具')}>
        {availableTools.map((group, index) => <div className="farm-tool-group" key={index}>
          {group.map(([id, label]) => <button type="button" key={id} aria-pressed={tool === id} onClick={() => changeTool(id)} title={id === 'canal' ? tr('水渠／水田') : label}>
            <Icon name={id} /><span>{label}</span>
          </button>)}
        </div>)}
        <div className="farm-tool-group farm-history">
          <button type="button" disabled={!past.length} onClick={undo} title={tr('撤销（Ctrl+Z）')}><Icon name="undo" /><span>{tr('撤销')}</span></button>
          <button type="button" disabled={!future.length} onClick={redo} title={tr('重做（Ctrl+Shift+Z）')}><Icon name="redo" /><span>{tr('重做')}</span></button>
        </div>
      </div>
      <div className="farm-workspace">
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
            setMessage(tr('已框选 {cells} 格、{objects} 个物体，可批量清理。', { cells: cells.length, objects: items.length }));
          }}
          ghost={tool === 'place' ? spriteArt(art, 'object', template, season, undefined, angle) : undefined}
          previewValid={previewValid}
          focus={focus}
          onHover={setHover}
          onChoose={choose}
          onStroke={finishStroke}
        />
        <aside className="farm-panel" aria-label={TOOL_NAMES[tool]}>
          {['plant', 'place'].includes(tool) ? (
            <div className="farm-palette">
              <h3>{tool === 'plant' ? tr('选择作物') : tr('选择设施')}</h3>
              {tool === 'plant'
                ? <div className="farm-segments" role="group" aria-label={tr('作物季节')}>
                  {[[-1, tr('全部')], ...SEASONS.map((s, i) => [i, s])].map(([id, label]) => <button type="button" key={id} aria-pressed={cropSeason === String(id)} onClick={() => { setCropSeason(String(id)); setLimit(40); }}>{label}</button>)}
                </div>
                : <>
                  <div className="farm-segments farm-categories" role="group" aria-label={tr('设施类别')}>
                    {[['machine', tr('加工设备')], ['building', tr('建筑')], ['floor', tr('地板／道路')], ['furniture', tr('家具／装饰')]].filter(([id]) => !room || id !== 'building').map(([id, label]) => <button type="button" key={id} aria-pressed={category === id} onClick={() => { setCategory(id); setMachineFilter(''); setSearch(''); setLimit(40); }}>{label}</button>)}
                  </div>
                  {category === 'machine' && <SearchableSelect aria-label={tr('设备类别')} value={machineFilter} onChange={e => { setMachineFilter(e.target.value); setLimit(40); }}><option value="">{tr('全部设备类别')}</option>{Array.from(new Map(templates.filter(t => t.category === 'machine').map(t => [t.script, t])).values()).map(t => <option key={t.script} value={t.script}>{t.name}</option>)}</SearchableSelect>}
                </>}
              <input
                id="farm-palette-search"
                className="farm-search"
                aria-label={tool === 'plant' ? tr('搜索作物') : tr('搜索设施')}
                placeholder={tr('名称、拼音或 ID')}
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
                      <button type="button" key={p.id} aria-pressed={(tool === 'plant' ? crop : template) === p.id} onClick={() => pickPalette(p)} title={p.name}>
                        {sprite ? <TrimmedSprite className="farm-sprite" src={withBase(`/maps/farm/${sprite.file}`)} /> : <span className="farm-sprite farm-no-art" aria-hidden="true">◇</span>}
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
                {!filtered.length && <p className="farm-empty">{tr('没有匹配的项目。')}</p>}
              </div>
              <div className="farm-palette-foot">
                <small>{filtered.length} {tr('项')}{moving ? tr(' · 正在移动已选设施') : ''}</small>
                {tool === 'place' && <button type="button" onClick={rotate} disabled={!activeTemplate || (!activeTemplate.reverse && activeTemplate.rotations.length < 2)}>{tr('↻ 旋转（R）')}</button>}
              </div>
              {tool === 'plant' && selectedCells.length > 0 && <button type="button" className="farm-primary" onClick={() => paintSelection({ crop, growth: 0, form: 1 })}>{tr('种植到选区（{count} 格）', { count: selectedCells.length })}</button>}
            </div>
          ) : tool === 'clear' ? (
            <div className="farm-section">
              <h3>{tr('清理')}</h3>
              <p>{tr('拖动清理选定层级，每笔都可撤销。')}</p>
              <div className="farm-choices" role="group" aria-label={tr('清理层级')}>
                {([['crops', tr('作物与树木')], ['floor', tr('地板／道路')], ['objects', tr('设施与建筑')], ['reset', tr('全部清空并恢复平地')]] as Array<[ClearLayer, string]>).map(([id, label]) => <button type="button" key={id} aria-pressed={clearLayer === id} onClick={() => setClearLayer(id)}>{label}</button>)}
              </div>
              {!room && <div className="farm-reset">
                <h4>{tr('整块田地')}</h4>
                <div className="farm-segments" role="group" aria-label={tr('整块田地')}>
                  {FARM_REGIONS.map(r => <button type="button" key={r.id} aria-pressed={resetArea === String(r.id)} onClick={() => setResetArea(String(r.id))}>{r.name}</button>)}
                </div>
                <button type="button" onClick={() => { const cells = terrain.filter(c => c.area === Number(resetArea) && areaAvailable(model.doc, c.area)); commit(clearMapArea(model.doc, current.current, sceneId, cells.map(c => c.id), [], 'reset')); setMessage(tr('这块田地已恢复平地，可撤销。')); }}>{tr('清空整块田地并恢复平地')}</button>
              </div>}
            </div>
          ) : ['water', 'soil', 'ridge', 'canal'].includes(tool) ? (
            <div className="farm-section">
              <h3>{tool === 'canal' ? tr('水渠／水田') : TOOL_NAMES[tool]}</h3>
              <p>{tr('在地图上点击或拖动使用工具。')}</p>
              {tool === 'canal' && <p>{tr('画出水田后再种稻米、山葵。转换地形会清除不适合该土壤的作物，可撤销。')}</p>}
            </div>
          ) : (
            <div className="farm-section farm-selection">
              {chosen ? (
                <>
                  <h3>{nameOf(chosen)}</h3>
                  <small>
                    {chosen.kind === 'crop' ? (mature ? tr('成熟预览') : tr('存档中的生长阶段')) : chosen.key.startsWith('new:')?tr('新增设施'):chosen.key.startsWith('fixed:')||chosen.key.startsWith('fixture:')?tr('固定场景设施'):tr('存档中的设施')}
                    {chosen.edited ? tr(' · 已修改') : ''}
                  </small>
                  {chosen.art && <TrimmedSprite className="farm-selection-art" src={withBase(`/maps/farm/${chosen.art.file}`)} label={nameOf(chosen)} />}
                  {chosen.movable && <div className="farm-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setTool('place');
                        setTemplate(chosen.id);
                        setMoving(chosen.uid!);
                        setAngle(occupied.find(o=>o.uid===chosen.uid)?.angle??45);
                        setMessage(tr('点击新的位置移动这件设施。按 Esc 取消。'));
                      }}
                    >
                      {tr('移动这件设施')}
                    </button>
                    {chosen.kind==='object'&&<button type="button" onClick={rotate}>{tr('↻ 调整朝向（R）')}</button>}
                    <button type="button" className="farm-danger" onClick={()=>{commit(clearMapArea(model.doc,current.current,sceneId,[],[chosen.key],chosen.floor?'floor':'objects'));cancelSelection();setMessage(tr('已删除所选物体，可撤销。'));}}>{tr('删除这件')}{templates.find(t=>t.id===chosen.id)?.building?tr('建筑'):tr('设施')}</button>
                  </div>}
                  {chosen.uid&&templates.find(t=>t.id===chosen.id)?.building&&<div className="farm-actions">{templates.filter(t=>{const active=templates.find(s=>s.id===chosen.id)!;return active.upgrade?t.id===active.upgrade:t.buildingFamily===active.buildingFamily&&t.slot===active.slot&&t.mirror===active.mirror&&t.level===active.level+1;}).map(t=><button type="button" key={t.id} onClick={()=>upgrade(t.id)}>{tr('升级为 {name} · {level} 级', { name: t.name, level: t.level })}</button>)}</div>}
                  {chosen.kind==='crop'&&chosen.cell&&<MapGrowthControls state={cropGrowth(model.doc,edits,sceneId,chosen.cell)} onChange={editGrowth}/>}
                  {!selection.length && chosen.kind === 'crop' && chosen.cell && (
                    <button
                      type="button"
                      className="farm-danger"
                      onClick={() => {
                        commit(clearMapArea(model.doc,current.current,sceneId,[chosen.cell!],[],'crops'));
                        setSelected(undefined);
                      }}
                    >
                      {tr('清除这株作物')}
                    </button>
                  )}
                </>
              ) : !(selection.length > 0 || selectedCells.length > 0) && (
                <>
                  <h3>{tool === 'pan' ? tr('平移') : tr('从真实场景开始')}</h3>
                  <p>{room ? tr('点击家具查看详情，选择移动后点击新位置。') : tr('点击上方田地名称定位。放大后，点击作物或设施查看详情。')}</p>
                  <p>{tr('选择种植、设施等工具后，地图会显示落点预览。')}</p>
                </>
              )}
              {(selection.length > 0 || selectedCells.length > 0) && <div className="farm-multi-selection">
                <h4>{tr('已框选 {count} 格 · {count2} 个物体', { count: selectedCells.length, count2: selection.length })}</h4>
                <div className="farm-actions">{[['crops',tr('清除作物')],['floor',tr('清除地板')],['objects',tr('清除设施')],['reset',tr('全部重置为平地')]].map(([id,label])=><button type="button" key={id} onClick={()=>clearSelection(id as ClearLayer)}>{label}</button>)}</div>
                <div className="farm-actions"><button type="button" onClick={()=>paintSelection({watered:true})}>{tr('批量浇水')}</button><button type="button" onClick={()=>paintSelection({soil:1})}>{tr('批量耕地')}</button><button type="button" onClick={()=>paintSelection({soil:2})}>{tr('批量田垄')}</button><button type="button" onClick={()=>paintSelection({soil:3})}>{tr('批量水田')}</button><button type="button" onClick={matureSelection}>{tr('作物／树木全部成熟')}</button><button type="button" onClick={()=>changeTool('plant')}>{tr('在选区种植…')}</button></div>
                {selection.length > 0 && <div className="farm-selection-list">{sprites.filter(s => selection.includes(s.key)).slice(0, selectionLimit).map(s => <button type="button" key={s.key}
                  aria-pressed={selected === s.key} onClick={() => setSelected(s.key)}>{nameOf(s)}</button>)}</div>}
                {selection.length > selectionLimit && <button type="button" onClick={() => setSelectionLimit(n => n + 40)}>{tr('显示更多')}</button>}
                <button type="button" onClick={() => { setSelection([]); setSelectedCells([]); setSelected(undefined); }}>{tr('取消框选')}</button>
              </div>}
              {selectedPoint && (
                <small>
                  {tr('位置')} {Math.round(chosen?.x ?? selectedPoint.x)}, {Math.round(chosen?.y ?? selectedPoint.y)}
                </small>
              )}
            </div>
          )}
          {brushTool && (
            <div className="farm-brush">
              <h4>{tr('笔刷')}</h4>
              <div className="farm-segments" role="group" aria-label={tr('笔刷')}>
                {[1, 3, 5].map((n) => (
                  <button type="button" key={n} aria-pressed={brush === n} onClick={() => setBrush(n)}>
                    {n}×{n}
                  </button>
                ))}
              </div>
            </div>
          )}
          <details className="farm-layer-options">
            <summary>{room ? tr('图层') : tr('季节与图层')}</summary>
            {!room && <>
              <div className="farm-segments" role="group" aria-label={tr('预览季节')}>
                {SEASONS.map((s, i) => (
                  <button type="button" key={s} aria-pressed={season === i} onClick={() => setSeason(i)}>
                    {s}
                  </button>
                ))}
              </div>
              <small>{tr('仅切换预览，不修改存档季节。')}</small>
            </>}
            <div className="farm-switches">
              {layerToggles.map(([label, value, set]) => (
                <button type="button" role="switch" aria-checked={value} key={label} onClick={() => set(!value)}>
                  <span className="farm-switch" aria-hidden="true" />{label}
                </button>
              ))}
            </div>
            {restricted&&<small>{tr('斜纹表示当前工具不能使用的地形；已有物体和完整占地以放置预览为准。')}</small>}
          </details>
        </aside>
      </div>
      <footer className="farm-footer">
        <span className="farm-edit-count">{mapEditCount(edits)} {tr('处修改')}</span>
        <p role="status">{message}</p>
        <div className="farm-files">
          <button
            type="button"
            onClick={() => {
              try {
                applyMapEdits(model.doc, edits);
                setMessage(tr('布局结构与占地检查通过。'));
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            {tr('检查布局')}
          </button>
          <button type="button" onClick={download} title={tr('保存整个农场的田地与设施，可作为备份，或导入到其他存档。')}>
            {tr('导出布局')}
          </button>
          <button type="button" onClick={() => presetInput.current?.click()} title={tr('用布局文件重建这个存档的农场；多余的设施会被移除，装有物品的容器会保留。')}>
            {tr('导入布局')}
          </button>
          <button
            type="button"
            disabled={!mapEditCount(edits)}
            onClick={() => {
              commit({});
              setMessage(tr('已恢复原存档布局，可撤销此操作。'));
            }}
          >
            {tr('恢复原布局')}
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
            const text = await file.text();
            if (JSON.parse(text)?.version === 2) {
              const result = importMapLayout(model.doc, parseMapLayout(text));
              applyMapEdits(model.doc, result.edits);
              commit(result.edits);
              setMessage([
                tr('已按布局重建农场，放置 {count} 件物体。', { count: result.placed }),
                result.skipped ? tr('{count} 项超出本存档已开放的范围，已跳过。', { count: result.skipped }) : '',
                result.kept ? tr('{count} 个仍装有物品的容器已保留。', { count: result.kept }) : '',
                tr('可撤销。')
              ].join(''));
            } else {
              const next = parseMapPreset(text);
              applyMapEdits(model.doc, next);
              commit(next);
              setMessage(tr('布局已导入。'));
            }
          } catch (error) {
            setMessage((error as Error).message);
          }
          input.value = '';
        }}
      />
    </section>
  );
}
