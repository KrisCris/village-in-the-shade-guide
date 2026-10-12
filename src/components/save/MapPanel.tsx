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
  soilForCrop,
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
  isMirrorScene,
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
  land: 'M3 17.5 12 13l9 4.5M3 13.5 12 9l9 4.5M5.5 8.5 12 5l6.5 3.5',
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
  [['plant', tr('种植')], ['place', tr('设施')], ['land', tr('土地')], ['clear', tr('清理')]]
];
type LandKind = 'soil' | 'ridge' | 'canal' | 'water';
const LAND_KINDS: Array<[LandKind, string, string]> = [
  ['soil', tr('耕地'), tr('大多数作物都能种。')],
  ['ridge', tr('田垄'), tr('和耕地一样能种大多数作物，外观不同。')],
  ['canal', tr('水田'), tr('稻米等水生作物专用；其他作物不能种在水田。')],
  ['water', tr('浇水'), tr('把田地标记为已浇水。')]
];
const CLEAR_NAMES: Record<string, string> = { objects: tr('设施'), crops: tr('作物与树木'), floor: tr('地板与道路'), soil: tr('田地') };
const TOOL_NAMES: Record<string, string> = Object.fromEntries(TOOL_GROUPS.flat());
const FIXED_NAMES: Record<number, string> = { 112000000: tr('出货箱'), 800010300: tr('泉水') };
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
  const [angle, setAngle] = useState(45), [landKind, setLandKind] = useState<LandKind>('soil');
  const [floors, setFloors] = useState(true), [groundOnly, setGroundOnly] = useState(false);
  const eraseLayer = useRef<ClearLayer | null>(null);
  const [selectedCells, setSelectedCells] = useState<number[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  // The marquee's full selection, so narrowing it to one kind can be undone.
  const [selectionBase, setSelectionBase] = useState<{ keys: string[]; cells: number[] }>({ keys: [], cells: [] });
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
  const viewArt = useMemo(() => art && room ? { ...art, bounds: room.bounds, background: room.file, scenery: room.scenery, fixtures: room.fixtures } : art, [art, room]);
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
    : tool==='inspect'||tool==='pan'||tool==='clear'||!!(target.mask&1)&&!blocked(target));
  const nameOf = (s: SceneSprite) =>
    s.kind === 'crop'
      ? (names.names?.crops?.[s.id] ?? tr('作物 {id}', { id: s.id }))
      : (MAP_DATA.objects.find((o) => o.id === s.id)?.name ?? FIXED_NAMES[s.id] ?? art?.fixedObjects?.find(o=>o.id===s.id)?.name ??
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
            : next === 'clear'
              ? tr('从哪一层开始拖，就只清理那一层。')
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
        // Floors are laid cell by cell while dragging; a full save rebuild per cell would stall the stroke.
        if (!activeTemplate?.floor) applyMapEdits(model.doc, next);
        commit(next);
        setMessage(moving ? tr('设施已移动，可撤销。') : activeTemplate?.floor ? tr('已铺上，可按住拖动连续铺设。') : tr('设施已加入草稿，可继续放置。'));
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
        : landKind === 'water'
          ? { watered: true }
          : { soil: landKind === 'ridge' ? 2 : landKind === 'canal' ? 3 : 1 };
    const radius = (brush - 1) / 2;
    const targets = terrain.filter(
      (c) =>
        Math.abs((c.x + c.y - cell.x - cell.y) / 90) <= radius &&
        Math.abs((c.y - c.x - cell.y + cell.x) / 90) <= radius &&
        (tool==='clear'||c.mask & 1) &&
        areaAvailable(model.doc, c.area) &&
        (tool==='clear'||!blocked(c))
    );
    if (!targets.length) {
      setMessage(tr('这里不能耕作，或已被设施占用。'));
      return;
    }
    if(tool==='clear') {
      // The stroke keeps the layer it started on, so dragging over a field never also removes a facility.
      const layer=eraseLayer.current??=topLayer(cell)??null;
      if(!layer){setMessage(tr('这里没有可清理的内容。'));return;}
      commit(clearMapArea(model.doc,current.current,sceneId,targets.map(c=>c.id),layerKeys(layer,targets),layer));
      setMessage(tr('已清除{what}（{count} 格），可撤销。', { what: CLEAR_NAMES[layer], count: targets.length }));return;
    }
    const next = {
      ...current.current,
      cells: {
        ...current.current.cells,
        ...Object.fromEntries(
          targets.map((c) => [
            `${sceneId}:${c.id}`,
            paintCell(c.id,tool==='plant'?plantPaint(c.id):paint)
          ])
        )
      }
    };
    commit(next);
    setMessage(tr('已修改 {count} 格。可撤销，导出存档前会核验布局。', { count: targets.length }));
  }
  function paintCell(id:number,paint:CellPaint):CellPaint {
    const previous=current.current.cells?.[`${sceneId}:${id}`],cropId=previous?.crop!==undefined?previous.crop:savedCells.get(id)?.crop;
    const clear=paint.crop===undefined&&paint.soil!==undefined&&cropId&&cropPlacementProblem(cropId,paint.soil);
    return {...previous,...paint,...(clear?{crop:null,growth:undefined,form:undefined}:{})};
  }
  /** Planting turns the cell into the soil the crop needs, e.g. rice makes a paddy. */
  function plantPaint(id:number,base:CellPaint={crop,growth:0,form:1}):CellPaint {
    const soil=soilForCrop(base.crop!,soilAt(id));
    return soil===undefined?base:{...base,soil};
  }
  function topLayer(cell:Point&{id:number}):ClearLayer|undefined {
    const covers=(floor:boolean)=>(floor?floors:facilities&&!groundOnly)&&occupied.some(o=>o.movable&&!!o.spec?.floor===floor&&objectFootprint(o).some(poly=>containsPoint(poly,cell)));
    if(covers(false))return 'objects';
    if(plants&&!groundOnly&&sprites.some(s=>s.kind==='crop'&&s.cell===cell.id))return 'crops';
    if(covers(true))return 'floor';
    if(ground.some(g=>g.id===cell.id))return 'soil';
  }
  function layerKeys(layer:ClearLayer,cells:Point[]) {
    if(layer!=='objects'&&layer!=='floor')return [];
    return occupied.filter(o=>o.movable&&!!o.spec?.floor===(layer==='floor')&&objectFootprint(o).some(poly=>cells.some(c=>containsPoint(poly,c))))
      .map(o=>o.uid.startsWith('new:')?o.uid:`object:${o.uid}`);
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
  function clearSelection(layer: ClearLayer | 'visible') {
    const layers:ClearLayer[]=layer==='visible'?[...(plants&&!groundOnly?['crops' as const]:[]),...(facilities&&!groundOnly?['objects' as const]:[]),...(floors?['floor' as const]:[])]:[layer];
    commit(layers.reduce((draft,l)=>clearMapArea(model.doc,draft,sceneId,selectedCells,selection,l),current.current));
    setSelected(undefined);setSelection([]);setSelectedCells([]);setMessage(tr('选区已批量清理，可撤销。'));
  }
  /** Selected objects grouped by what they are, most numerous first. */
  const selectionGroups = useMemo(() => {
    const keys = new Set(selection), groups = new Map<string, { name: string; sprites: SceneSprite[] }>();
    for (const s of sprites) if (keys.has(s.key)) {
      const name = nameOf(s), key = `${s.kind}:${name}`;
      const group = groups.get(key) ?? groups.set(key, { name, sprites: [] }).get(key)!;
      group.sprites.push(s);
    }
    return [...groups.values()].sort((a, b) => b.sprites.length - a.sprites.length);
  }, [selection, sprites, names, art]);
  const tilled = useMemo(() => new Set(ground.map(g => g.id)), [ground]);
  const selectedFields = selectedCells.filter(id => tilled.has(id));
  /** Selected ground cells with nothing on them: no crop, facility or floor. */
  const emptyCells = useMemo(() => {
    if (!selectedCells.length) return [];
    const ids = new Set(selectedCells), crops = new Set(sprites.flatMap(s => s.kind === 'crop' && s.cell !== undefined ? [s.cell] : []));
    const footprints = occupied.filter(o => (o.spec || o.blocksPlacement) && !o.parent).map(objectFootprint);
    return terrain.filter(c => ids.has(c.id) && c.mask & 3 && !crops.has(c.id) && areaAvailable(model.doc, c.area) &&
      !footprints.some(polys => polys.some(poly => containsPoint(poly, c)))).map(c => c.id);
  }, [selectedCells, sprites, occupied, terrain, model]);
  /** Narrow the selection to one kind; crops keep their cells so clearing and maturing still reach them. */
  function keepGroup(group: { name: string; sprites: SceneSprite[] }) {
    setSelection(group.sprites.map(s => s.key));
    setSelectedCells(group.sprites.flatMap(s => s.kind === 'crop' && s.cell !== undefined ? [s.cell] : []));
    setSelected(undefined);
    setMessage(tr('已只保留 {name}（{count} 个）。', { name: group.name, count: group.sprites.length }));
  }
  function keepEmpty() {
    setSelection([]);
    setSelectedCells(emptyCells);
    setSelected(undefined);
    setMessage(tr('已只保留 {count} 格空地。', { count: emptyCells.length }));
  }
  /** Lay the chosen floor or path on every selected cell that does not have one yet. */
  function floorSelection() {
    let next = current.current, placed = 0;
    for (const cell of selectedCells) {
      try {
        next = addMapPlacement(model.doc, next, { scene: sceneId, cell, template, angle });
        placed++;
      } catch { /* this cell already has a floor or cannot take one */ }
    }
    if (!placed) { setMessage(tr('选区里没有能铺的格子：已有地板，或有作物、田地、设施。')); return; }
    commit(next);
    const skipped = selectedCells.length - placed;
    setMessage(skipped ? tr('已铺 {count} 格；{skipped} 格有地板、作物、田地或设施，已跳过。可整次撤销。', { count: placed, skipped }) : tr('已铺 {count} 格，可整次撤销。', { count: placed }));
  }
  function waterSelection() {
    if (!selectedFields.length) { setMessage(tr('选区内没有田地。')); return; }
    commit({ ...current.current, cells: { ...current.current.cells, ...Object.fromEntries(selectedFields.map(id => [`${sceneId}:${id}`, paintCell(id, { watered: true })])) } });
    setMessage(tr('已为 {count} 格田地浇水，可撤销。', { count: selectedFields.length }));
  }
  function paintSelection(paint: CellPaint) {
    const cells=terrain.filter(c=>selectedCells.includes(c.id)&&(c.mask&1)&&areaAvailable(model.doc,c.area)&&!blocked(c));
    if(!cells.length){setMessage(tr('选区内没有可耕作的空地。'));return;}
    commit({...current.current,cells:{...current.current.cells,...Object.fromEntries(cells.map(c=>[`${sceneId}:${c.id}`,paintCell(c.id,paint.crop?plantPaint(c.id,paint):paint)]))}});
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
    eraseLayer.current = null;
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
  const brushTool = ['plant', 'land', 'clear'].includes(tool);
  const availableTools = TOOL_GROUPS.map(group => group.filter(([id]) => !room || terrain.some(c => c.mask & 1) || ['inspect', 'pan', 'place', 'clear'].includes(id))).filter(group => group.length);
  const activeTemplate = templates.find(t => t.id === template);
  const layerToggles: Array<[string, boolean, Dispatch<SetStateAction<boolean>>]> = ([
    [tr('成熟预览（不改变生长进度）'), mature, setMature],
    [tr('网格'), grid, setGrid],
    [tr('地形禁放区'), restricted, setRestricted],
    [tr('地名'), labels, setLabels],
    [tr('作物与树木'), plants, setPlants],
    [tr('建筑与设施'), facilities, setFacilities],
    [tr('地板与道路'), floors, setFloors]
  ] as Array<[string, boolean, Dispatch<SetStateAction<boolean>>]>).filter(([label]) => !room || [tr('网格'), tr('建筑与设施'), tr('地板与道路'), tr('地形禁放区')].includes(label) || terrain.some(c => c.mask & 1) && label !== tr('地名'));
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
          <span>{room ? room.description : tr('全部田地 · 游戏原始场景')}</span>
        </div>
        <div className="farm-place">
          <SearchableSelect id="farm-room-select" aria-label={tr('所在位置')} value={roomId} onChange={e => changeRoom(e.target.value)}>
            <option value="outdoor">{tr('室外 · 农场')}</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {r.description}</option>)}
          </SearchableSelect>
          {room
            ? <div className="farm-segments" role="group" aria-label={tr('房屋楼层')}>{rooms.filter(r => r.scene === room.scene || (room.home && r.home)).map(r => <button type="button" key={r.id} aria-pressed={r.id === roomId} onClick={() => changeRoom(r.id)}>{r.floorName ?? tr('室内全貌')}</button>)}</div>
            : <nav className="farm-segments" aria-label={tr('定位田地')}>
              <button type="button" title={tr('全部田地')} onClick={() => setFocus((f) => ({ bounds: FARM_BOUNDS, revision: f.revision + 1 }))}>{tr('全貌')}</button>
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
          {group.map(([id, label]) => <button type="button" key={id} aria-pressed={tool === id} onClick={() => changeTool(id)} title={label}>
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
          plants={plants && !groundOnly}
          facilities={facilities && !groundOnly}
          floors={floors}
          groundOnly={groundOnly}
          onGroundOnly={(value) => { setGroundOnly(value); setSelection([]); setSelected(undefined); setMessage(value ? tr('仅显示土地、地板和道路；框选和清理只作用于地面。') : tr('显示全部图层。')); }}
          labels={labels}
          brush={brush}
          selected={selected}
          selection={selection}
          selectedCells={selectedCells}
          onRotate={rotate}
          onCancel={cancelSelection}
          onSelect={(items, cells) => {
            setSelectedCells(cells);
            setSelectionBase({ keys: items.map(s => s.key), cells }); setSelection(items.map(s => s.key)); setSelected(undefined);
            setMessage(tr('已框选 {cells} 格、{objects} 个物体，可批量清理。', { cells: cells.length, objects: items.length }));
          }}
          ghost={tool === 'place' ? spriteArt(art, 'object', template, season, undefined, angle) : undefined}
          mirrored={isMirrorScene(sceneId)}
          previewValid={previewValid}
          focus={focus}
          onHover={setHover}
          onChoose={choose}
          onStroke={finishStroke}
          dragPlace={!!activeTemplate?.floor && !moving}
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
              {tool === 'plant' && <p className="farm-note">{tr('会自动改成作物需要的土地，例如稻米种下即为水田。')}</p>}
              {tool === 'plant' && selectedCells.length > 0 && <button type="button" className="farm-primary" onClick={() => paintSelection({ crop, growth: 0, form: 1 })}>{tr('种植到选区（{count} 格）', { count: selectedCells.length })}</button>}
              {tool === 'place' && selectedCells.length > 0 && templates.find(t => t.id === template)?.floor && <button type="button" className="farm-primary" onClick={floorSelection}>{tr('铺到选区（{count} 格）', { count: selectedCells.length })}</button>}
            </div>
          ) : tool === 'clear' ? (
            <div className="farm-section">
              <h3>{tr('清理')}</h3>
              <p>{tr('从哪一层开始拖，就只清理那一层：设施 → 作物与树木 → 地板与道路 → 空田恢复为平地。每笔都可撤销。')}</p>
              <p className="farm-note">{tr('只想清地面？切换到地图左上角的「仅地面」。')}</p>
            </div>
          ) : tool === 'land' ? (
            <div className="farm-section">
              <h3>{tr('土地')}</h3>
              <div className="farm-segments" role="group" aria-label={tr('土地类型')}>
                {LAND_KINDS.map(([id, label]) => <button type="button" key={id} aria-pressed={landKind === id} onClick={() => setLandKind(id)}>{label}</button>)}
              </div>
              <p>{LAND_KINDS.find(([id]) => id === landKind)![2]}</p>
              <p className="farm-note">{tr('种植时会自动改成作物需要的土地，一般不必先整地。改成水田会清除不能种在水田的作物，可撤销。')}</p>
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
                  {chosen.carried && <p className="farm-note">{tr('摆在家具上，会随家具移动和转向；删除家具时一起移除。')}</p>}
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
                {(() => {
                  const kinds = selectionGroups.length + (emptyCells.length ? 1 : 0);
                  const narrowed = selection.length < selectionBase.keys.length || selectedCells.length < selectionBase.cells.length;
                  return kinds > 0 && <>
                    <p className="farm-note">{kinds > 1 ? tr('点一类只保留它，再批量处理。') : tr('地图上高亮的就是这些。')}</p>
                    <div className="farm-selection-groups">
                      {selectionGroups.map(group => {
                        const sprite = group.sprites.find(s => s.art)?.art;
                        return <button type="button" key={group.name} onClick={() => keepGroup(group)} disabled={kinds < 2} title={group.name}>
                          {sprite ? <TrimmedSprite className="farm-sprite" src={withBase(`/maps/farm/${sprite.file}`)} /> : <span className="farm-sprite farm-no-art" aria-hidden="true">◇</span>}
                          <span>{group.name}</span><b>×{group.sprites.length}</b>
                        </button>;
                      })}
                      {emptyCells.length > 0 && <button type="button" onClick={keepEmpty} disabled={kinds < 2}>
                        <span className="farm-sprite farm-empty-cell" aria-hidden="true" />
                        <span>{tr('空地')}</span><b>×{emptyCells.length}</b>
                      </button>}
                    </div>
                    {narrowed && <button type="button" onClick={() => { setSelection(selectionBase.keys); setSelectedCells(selectionBase.cells); }}>{tr('回到完整选区')}</button>}
                  </>;
                })()}
                {selectionGroups.some(g => g.sprites[0].kind === 'crop') && <>
                  <h4>{tr('作物')}</h4>
                  <div className="farm-actions">
                    {selectedFields.length > 0 && <button type="button" onClick={waterSelection}>{tr('浇水')}</button>}
                    <button type="button" onClick={matureSelection}>{tr('全部成熟')}</button>
                  </div>
                </>}
                {selectedCells.length > 0 && <>
                  <h4>{tr('对这 {count} 格', { count: selectedCells.length })}</h4>
                  <div className="farm-actions">
                    <button type="button" onClick={() => changeTool('plant')}>{tr('种植…')}</button>
                    <button type="button" onClick={() => { changeTool('place'); setCategory('floor'); setSearch(''); setLimit(40); setMessage(tr('选择地板或道路，再点「铺到选区」。')); }}>{tr('铺地板／道路…')}</button>
                    {selectedFields.length > 0 && !selectionGroups.some(g => g.sprites[0].kind === 'crop') && <button type="button" onClick={waterSelection}>{tr('浇水')}</button>}
                  </div>
                  <div className="farm-segments" role="group" aria-label={tr('土地类型')}>{([[1, tr('翻成耕地')], [2, tr('翻成田垄')], [3, tr('翻成水田')]] as const).map(([soil, label]) => <button type="button" key={soil} onClick={() => paintSelection({ soil })} title={soil === 3 ? tr('改成水田会清除不能种在水田的作物。') : undefined}>{label}</button>)}</div>
                </>}
                <h4>{tr('清理')}</h4>
                <div className="farm-actions"><button type="button" className="farm-danger" onClick={()=>clearSelection('visible')} title={tr('删除选区内当前显示的作物、设施和地板')}>{tr('删除选中内容')}</button><button type="button" onClick={()=>clearSelection('reset')}>{tr('全部恢复平地')}</button></div>
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
