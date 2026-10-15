import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel } from './saveModel';
import { encodeSigned, readSigned, serializeSer, SerDocument } from './ser';
import { addMapPlacement, applyMapEdits, clearMapArea, cropGrowth, cropPlacementProblem, cropSoils, landId, mapAnimalEdits, mapBuildingFlags, mapCells, mapChangeGroups, mapObjects, MAP_DATA, placementProblem, sceneCells, soilForCrop, storedGrowth, withoutMapChanges, type MapEdits } from './saveMap';
import { animalHouses, animalResidents } from './saveAnimals';
import { buildFarmScene, type MapArt } from './saveMapScene';
import placements from '../../data/sources/game-save-placements.json';
import { allowedMapTerrain } from './saveMap';
import farmArt from '../../public/maps/farm/manifest.json';

it('reads the native rice and wasabi water-field requirements', () => {
  expect(cropSoils(63)).toEqual([3]); expect(cropSoils(65)).toEqual([3]);
  expect(cropPlacementProblem(63, 1)).toContain('水田');
  expect(cropPlacementProblem(65, 3)).toBeNull();
  expect(cropPlacementProblem(1, 3)).toBeTruthy();
  expect(cropPlacementProblem(1, 2)).toBeNull();
});

it('picks the soil a crop needs when it is planted', () => {
  expect(soilForCrop(63, 1)).toBe(3);
  expect(soilForCrop(63, 0)).toBe(3);
  expect(soilForCrop(63, 3)).toBeUndefined();
  expect(soilForCrop(1, 3)).toBe(1);
  expect(soilForCrop(1, 2)).toBeUndefined();
  expect(soilForCrop(64, 1)).toBe(2);
  for (const id of Object.keys(MAP_DATA.cropRules))
    for (const soil of [0, 1, 2, 3]) expect(cropPlacementProblem(Number(id), soilForCrop(Number(id), soil) ?? soil), `${id} on ${soil}`).toBeNull();
});

describe.skipIf(!hasPrivateSaveFixtures)('map editing follow-up roundtrips', () => {
  let model: ReturnType<typeof parseSaveModel>;
  beforeAll(() => { model=parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'copy')); });
  const scene=100000001;
  it('draws the fixed shipping box independently of movable save objects, including seasonal art', () => {
    for(const season of [0,3]) {
      const sprites=buildFarmScene(model.doc,{},farmArt as MapArt,season);
      const boxes=sprites.filter(s=>s.id===112000000);
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toMatchObject({x:11880,y:21780,movable:false,edited:false});
      expect(boxes[0].art?.file).toBe(farmArt.objects['112000000'].seasons[season]['100'].file);
    }
  });
  it('draws the additional farmland spring as fixed map art', () => {
    const springs=buildFarmScene(model.doc,{},farmArt as MapArt,0).filter(s=>s.id===800010300);
    expect(springs).toHaveLength(1);
    expect(springs[0]).toMatchObject({x:14109,y:22989,movable:false});
    expect(springs[0].art?.file).toBe(farmArt.objects['800010300'].seasons[0]['100'].file);
  });
  it('changes the terrain overlay with cultivation, water crops and fishing restrictions', () => {
    const field=sceneCells(scene).find(c=>c.area===1&&(c.mask&1))!;
    expect(allowedMapTerrain(model.doc,{},scene,'canal').some(c=>c.id===field.id)).toBe(true);
    const edits={cells:{[`${scene}:${field.id}`]:{soil:3,crop:63}}};
    expect(allowedMapTerrain(model.doc,edits,scene,'plant',0,63).some(c=>c.id===field.id)).toBe(true);
    expect(allowedMapTerrain(model.doc,edits,scene,'plant',0,1).some(c=>c.id===field.id)).toBe(false);
    const trap=MAP_DATA.objects.find(o=>o.features.includes('PLACEMENT_FISHING'))!;
    const allowed=allowedMapTerrain(model.doc,{},scene,'place',trap.id);
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.every(c=>c.mask&256)).toBe(true);
    expect(allowed.some(c=>c.id===field.id)).toBe(false);
  });
  it('upgrades a newly placed barn and migrates both existing and newly added residents into that barn', () => {
    const old=mapObjects(model.doc).find(o=>o.id===111200001)!;
    const placement={scene,cell:landId(old.x,old.y),template:111200011,angle:old.angle};
    let edits=clearMapArea(model.doc,{},scene,[],[`object:${old.uid}`],'objects');
    edits=addMapPlacement(model.doc,edits,placement);
    const oldHouse=animalHouses(model.doc,mapBuildingFlags(edits,model.doc)).find(h=>h.id===MAP_DATA.objects.find(o=>o.id===111200011)!.mapId)!;
    const residents=animalResidents(model.doc);
    const originalSlots=animalHouses(model.doc).find(h=>h.id===old.spec!.mapId)!.slots;
    const resident=residents.find(r=>originalSlots.some(s=>s.id===r.placement))!;
    const vacancy=oldHouse.slots[1];
    const addition={species:7,name:'新伙伴'};
    expect(vacancy).toBeTruthy();
    const animals={moves:{[resident.index]:oldHouse.slots[0].id},added:{[vacancy.id]:addition}};
    edits=addMapPlacement(model.doc,edits,{...placement,template:111210011,move:'new:0'});
    expect(edits.objects?.filter(o=>o.template===old.id)).toHaveLength(0);
    expect(edits.objects?.filter(o=>o.template===111210011)).toHaveLength(1);
    const flags=mapBuildingFlags(edits,model.doc), preview=mapAnimalEdits(model.doc,edits,animals,flags);
    const upgraded=MAP_DATA.objects.find(o=>o.id===111210011)!;
    const after=parseSaveModel(decodeSave(exportSave(model,[],{},{},{},animals,edits),'copy'));
    for(const resident of animalResidents(model.doc,animals).filter(r=>oldHouse.slots.some(s=>s.id===r.placement))) {
      const target=preview.moves![resident.index];
      expect(placements.placements.find(s=>s.id===target)?.mapId).toBe(upgraded.mapId);
      expect(animalResidents(after.doc)[resident.index].placement).toBe(target);
    }
    if(vacancy){const target=Number(Object.keys(preview.added!)[0]);expect(placements.placements.find(s=>s.id===target)?.mapId).toBe(upgraded.mapId);expect(animalResidents(after.doc).at(-1)?.placement).toBe(target);}
    expect(mapObjects(after.doc).filter(o=>o.id===111210011)).toHaveLength(1);
    const withoutNew=clearMapArea(model.doc,edits,scene,[],['new:0'],'objects');
    expect(withoutNew.objects?.some(o=>o.template===111210011)).toBe(false);
  },60_000);
  it('never silently relocates upgraded residents into a different barn', () => {
    const old=mapObjects(model.doc).find(o=>o.id===111200001)!;
    const edits=addMapPlacement(model.doc,{}, {scene,cell:landId(old.x,old.y),template:111210001,move:old.uid});
    const oldSlots=animalHouses(model.doc).find(h=>h.id===old.spec!.mapId)!.slots;
    const preview=mapAnimalEdits(model.doc,edits,{},mapBuildingFlags(edits,model.doc));
    for(const r of animalResidents(model.doc).filter(r=>oldSlots.some(s=>s.id===r.placement)))expect(placements.placements.find(s=>s.id===preview.moves![r.index])?.mapId).toBe(MAP_DATA.objects.find(o=>o.id===111210001)!.mapId);
    expect(mapAnimalEdits(model.doc,{}, {}, {}).moves).toEqual({});
  });
  it('rejects crab pots and both trap types on ordinary ground', () => {
    const land=sceneCells(scene).find(c=>c.area===1&&(c.mask&2)&&!(c.mask&3840))!;
    for(const feature of ['PLACEMENT_FISHING','PLACEMENT_BIND_TRAP','PLACEMENT_BOX_TRAP']){
      const spec=MAP_DATA.objects.find(s=>s.features.includes(feature))!;
      expect(placementProblem(model.doc,{}, {scene,cell:land.id,template:spec.id})).toMatch(/钓鱼水域|陷阱/);
    }
    expect(sceneCells(scene).some(c=>c.mask&256)).toBe(true);
    const carpet=MAP_DATA.objects.find(o=>o.features.includes('PLACEMENT_CARPET'))!;
    const clear=clearMapArea(model.doc,{},scene,[land.id],[],'reset');
    const water={...clear,cells:{...clear.cells,[`${scene}:${land.id}`]:{soil:3,crop:null}}};
    expect(placementProblem(model.doc,water,{scene,cell:land.id,template:carpet.id})).toBeNull();
    const machine=MAP_DATA.objects.find(o=>o.category==='machine'&&!o.building&&!o.features.some(f=>f.startsWith('PLACEMENT_')||f==='SCARECROW'))!;
    expect(placementProblem(model.doc,water,{scene,cell:land.id,template:machine.id})).toContain('水田');
  });
  it('keeps floors off crops, tilled fields and standing objects, but lays them on cleared ground', () => {
    const floor=MAP_DATA.objects.find(o=>o.floor&&o.category==='floor')!;
    const lay=(edits:Parameters<typeof placementProblem>[1],cell:number)=>placementProblem(model.doc,edits,{scene,cell,template:floor.id});
    const crop=mapCells(model.doc).find(c=>c.crop)!, field=mapCells(model.doc).find(c=>c.soil&&!c.crop)!;
    expect(lay({},crop.id)).toContain('作物');
    expect(lay({},field.id)).toBeNull();
    expect(addMapPlacement(model.doc,{},{scene,cell:field.id,template:floor.id}).cells?.[`${scene}:${field.id}`]).toEqual({crop:null,soil:0,watered:false});
    const farm=new Set(sceneCells(scene).filter(c=>c.mask&2).map(c=>c.id));
    const standing=mapObjects(model.doc).find(o=>o.movable&&o.spec&&!o.spec.floor&&!o.spec.building&&!o.parent&&farm.has(landId(o.x,o.y)))!;
    expect(lay({},landId(standing.x,standing.y))).toContain('设施');
    expect(lay(clearMapArea(model.doc,{},scene,[field.id],[],'reset'),field.id)).toBeNull();
  });
  it('serializes water fields and native growth stages, including clearing an edited crop', () => {
    const cell=mapCells(model.doc).find(c=>c.crop>0&&c.crop<100&&sceneCells(scene).some(t=>t.id===c.id&&(t.mask&1)))!,key=`${scene}:${cell.id}`;
    const plant={cells:{[key]:{crop:63,soil:3,watered:true}}};
    const state=cropGrowth(model.doc,plant,scene,cell.id)!;
    expect(state.maximum).toBeGreaterThan(0);
    const edits={cells:{[key]:{...plant.cells[key],growth:state.maximum,form:1}}};
    const after=new SerDocument(applyMapEdits(model.doc,edits));
    expect(mapCells(after).find(c=>c.id===cell.id)?.soil).toBe(3);
    expect(cropGrowth(after,{},scene,cell.id)).toMatchObject({growth:state.maximum,days:0,form:1});
    expect(()=>applyMapEdits(model.doc,{cells:{[key]:{crop:63,soil:1}}})).toThrow('水田');
    const clear=clearMapArea(model.doc,edits,scene,[cell.id],[],'crops');
    expect(mapCells(new SerDocument(applyMapEdits(model.doc,clear))).find(c=>c.id===cell.id)?.crop).toBe(0);
    const plain=clearMapArea(model.doc,edits,scene,[cell.id],[],'soil');
    expect(plain.cells?.[key]).toEqual({crop:null,soil:0,watered:false});
    expect(plain.removed).toEqual([]);
  });
  it('keeps growth_ max_ on the last threshold of the written form', () => {
    const range=(doc:SerDocument,id:number)=>{const node=mapCells(doc).find(c=>c.id===id)!.node;return ['min_','max_','this->value_'].map(k=>Number(readSigned(doc,doc.resolve(`p/pCropsStatus_/p/growth_/${k}`,node)!)));};
    const target=mapCells(model.doc).find(c=>c.crop>0&&c.crop<100&&c.soil===2&&sceneCells(scene).some(t=>t.id===c.id&&(t.mask&1)))!,key=`${scene}:${target.id}`;
    // Tea: normal growth tops out at 1000, regrowth at 200.
    const planted=new SerDocument(applyMapEdits(model.doc,{cells:{[key]:{crop:64,growth:800,form:1}}}));
    expect(range(planted,target.id)).toEqual([0,1000,800]);
    expect(cropGrowth(planted,{},scene,target.id)).toMatchObject({stage:4,days:2});
    const regrowing=new SerDocument(applyMapEdits(planted,{cells:{[key]:{form:5,growth:200}}}));
    expect(range(regrowing,target.id)).toEqual([0,200,200]);
  });
  it('groups map changes for review and undoes one group at a time', () => {
    const empty=sceneCells(scene).filter(t=>(t.mask&1)&&!mapCells(model.doc).some(c=>c.id===t.id&&c.crop)).slice(0,3);
    const grown=mapCells(model.doc).find(c=>c.crop>0&&c.crop<100&&sceneCells(scene).some(t=>t.id===c.id))!;
    const movable=mapObjects(model.doc).filter(o=>o.movable);
    const edits:MapEdits={
      cells:{[`${scene}:${empty[0].id}`]:{crop:1,soil:1},[`${scene}:${empty[1].id}`]:{crop:1,soil:1},[`${scene}:${empty[2].id}`]:{soil:0},[`${scene}:${grown.id}`]:{growth:0}},
      objects:[{scene,cell:empty[0].id,template:241000000},{scene,cell:empty[1].id,template:241000000},{scene,cell:empty[2].id,template:movable[0].id,move:movable[0].uid}],
      removed:[movable[1].uid],
    };
    const groups=mapChangeGroups(model.doc,edits);
    expect(groups.map(g=>[g.kind,g.count])).toEqual([['place',2],['move',1],['remove',1],['plant',2],['growth',1],['clearSoil',1]]);
    expect(groups.find(g=>g.kind==='growth')).toMatchObject({crop:grown.crop,growth:{form:expect.any(Number),stage:0}});
    expect(groups.find(g=>g.kind==='remove')!.template).toBe(movable[1].id);
    const placed=withoutMapChanges(edits,groups[0]);
    expect(placed.objects).toEqual([edits.objects![2]]);
    expect(placed.cells).toEqual(edits.cells);
    const planted=withoutMapChanges(edits,groups.find(g=>g.kind==='plant')!);
    expect(Object.keys(planted.cells!)).toEqual([`${scene}:${empty[2].id}`,`${scene}:${grown.id}`]);
    expect(planted.removed).toEqual(edits.removed);
  });
  it('reads a growth value above max_ the way the game clamps it', () => {
    const cell=mapCells(model.doc).find(c=>c.crop===64||c.crop===67)??mapCells(model.doc).find(c=>c.crop>0&&c.crop<100)!;
    const node=model.doc.resolve('p/pCropsStatus_/p/growth_',cell.node)!;
    const max=model.doc.resolve('max_',node)!,value=model.doc.resolve('this->value_',node)!;
    const broken=new SerDocument(serializeSer(model.doc,new Map([[max.offset,encodeSigned(400n,max.size)],[value.offset,encodeSigned(800n,value.size)]])));
    expect(storedGrowth(broken,mapCells(broken).find(c=>c.id===cell.id)!.node)).toBe(400);
  });
  it('keeps processing timers on other devices when a placement is removed', () => {
    // Map edits rebuild the whole gimmick list; blob counts must survive that.
    const timers=(doc:SerDocument)=>new Map(mapObjects(doc).map(o=>[o.uid,['timeValue_','createTime_'].map(name=>{
      const n=doc.resolve(`p/${name}`,o.node)!;return `${n.ref}:${Buffer.from(doc.payload(n)).toString('hex')}`;
    }).join('|')]));
    const before=timers(model.doc),removed=mapObjects(model.doc).find(o=>o.movable)!;
    const after=timers(new SerDocument(applyMapEdits(model.doc,{removed:[removed.uid]})));
    expect([...before.values()].every(value=>value.startsWith('3:'))).toBe(true);
    before.delete(removed.uid);
    expect(after).toEqual(before);
  });
  it('updates an existing tree stage without replacing its crop identity', () => {
    const cell=mapCells(model.doc).find(c=>c.crop===1001)!;
    const state=cropGrowth(model.doc,{},scene,cell.id)!;
    const edits={cells:{[`${scene}:${cell.id}`]:{growth:state.maximum,form:1}}};
    const after=new SerDocument(applyMapEdits(model.doc,edits));
    expect(cropGrowth(after,{},scene,cell.id)).toMatchObject({growth:state.maximum,days:0});
    expect(mapCells(after).find(c=>c.id===cell.id)?.crop).toBe(cell.crop);
    expect(mapCells(after).find(c=>c.id===cell.id)?.soil).toBe(cell.soil);
  });
  it('new objects expose the same selectable identity and move control as stored objects', () => {
    const art={bounds:[0,0,100000,100000],crops:{},objects:{},seasons:[]} as MapArt;
    const sprite=buildFarmScene(model.doc,{objects:[{scene,cell:landId(11000,22000),template:111200011}]},art,0).find(s=>s.key==='new:0');
    expect(sprite).toMatchObject({uid:'new:0',movable:true});
  });
});
