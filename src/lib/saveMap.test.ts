import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel } from './saveModel';
import { applyMapEdits, addMapPlacement, clearMapArea, placementProblem, MAP_CROPS, MAP_DATA, mapCells, mapObjects, parseMapPreset, sceneCells, areaAvailable, landPosition, landId } from './saveMap';
import { readFloat, readSigned, encodeSigned, serializeSer, SerDocument, SerTag, type SerNode } from './ser';
import { animalHouses, ANIMALS, animalResidents } from './saveAnimals';
import { mapBuildingFlags } from './saveMap';
import { footprint, containsPoint } from './saveMapGeometry';

describe('map presets', () => {
  it('rejects incompatible and malformed layouts', () => {
    for (const edits of [{ cells: [] }, { cells: { '1:1': 3 } }, { objects: {} }, { objects: [{ scene: 1, cell: 2, template: 3, move: 'oops' }] }]) {
      expect(() => parseMapPreset(JSON.stringify({ version: 1, game: 'honogurashi', edits }))).toThrow();
    }
    expect(() => parseMapPreset('{"version":2}')).toThrow();
  });
});
describe.skipIf(!hasPrivateSaveFixtures)('map static save roundtrips', () => {
  let model: ReturnType<typeof parseSaveModel>;
  beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
  it('roundtrips an unchanged map without altering the serialized tree', () => {
    const restored = parseSaveModel(decodeSave(exportSave(model, []), 'copy'));
    expect(mapCells(restored.doc).map(c => [c.id, c.crop, c.soil])).toEqual(mapCells(model.doc).map(c => [c.id, c.crop, c.soil]));
    expect(mapObjects(restored.doc).length).toBe(mapObjects(model.doc).length);
  });
  it('plants, waters and clears a verified free farming cell without changing other cells', () => {
    const scene = MAP_DATA.scenes.find(s => s.code === 'MAP_ID_OPENWORLD')!;
    const existing = mapCells(model.doc), objects = mapObjects(model.doc);
    const target = sceneCells(scene.id).find(c => (c.mask & 1) && areaAvailable(model.doc, c.area) && existing.some(e => e.id === c.id && e.crop) && !objects.some(o => c.x >= o.x + Math.min(o.bounds[0], -22) && c.x <= o.x + Math.max(o.bounds[2], 22) && c.y >= o.y + Math.min(o.bounds[1], -22) && c.y <= o.y + Math.max(o.bounds[3], 22)))!;
    expect(target).toBeTruthy();
    const key = `${scene.id}:${target.id}`, crop = MAP_CROPS[0].numeric_id;
    const restored = new SerDocument(applyMapEdits(model.doc, { cells: { [key]: { crop, watered: true, soil: 2 } } }));
    const changed = mapCells(restored).find(c => c.id === target.id)!;
    expect(changed).toMatchObject({ crop, soil: 2 });
    expect(readSigned(restored, restored.resolve('p/pFarmlandStatus_/p/water_/this->value_', changed.node)!)).toBe(1n);
    expect(mapCells(restored).filter(c => c.id !== target.id).map(c => [c.id, c.crop, c.soil])).toEqual(existing.filter(c => c.id !== target.id).map(c => [c.id, c.crop, c.soil]));
    const cleared = new SerDocument(applyMapEdits(restored, { cells: { [key]: { crop: null } } }));
    expect(mapCells(cleared).find(c => c.id === target.id)?.crop).toBe(0);
  });
  it('rejects invalid scene coordinates before writing', () => {
    expect(() => applyMapEdits(model.doc, { cells: { '999999:1': { crop: null } } })).toThrow('可耕作');
    expect(() => applyMapEdits(model.doc, { objects: [{ scene: 999999, cell: 1, template: 1 }] })).toThrow('不可放置');
  });
  it('clears every selected crop and resets ridges, while preserving cells outside the selection', () => {
    const original=mapCells(model.doc), ids=original.filter(c=>c.crop&&c.soil).slice(0,8).map(c=>c.id);
    expect(ids.length).toBe(8);
    const edits=clearMapArea(model.doc,{},100000001,ids,[],'reset');
    const result=mapCells(new SerDocument(applyMapEdits(model.doc,edits)));
    expect(result.filter(c=>ids.includes(c.id)).every(c=>!c.crop&&!c.soil)).toBe(true);
    expect(result.filter(c=>!ids.includes(c.id)).map(c=>[c.id,c.crop,c.soil])).toEqual(original.filter(c=>!ids.includes(c.id)).map(c=>[c.id,c.crop,c.soil]));
  });
  it('clears a draft object using its original array index after a moved object', () => {
    const objects=mapObjects(model.doc), old=objects.find(o=>o.movable)!;
    const edits={objects:[{scene:100000001,cell:landId(old.x,old.y),template:old.id,move:old.uid},{scene:100000001,cell:1,template:241000000}]};
    const cleared=clearMapArea(model.doc,edits,100000001,[],['new:1'],'objects');
    expect(cleared.objects).toEqual([edits.objects[0]]);
  });
  it('creates a previously absent container with native capacity and empty inventory', () => {
    const objects=mapObjects(model.doc),spec=MAP_DATA.objects.find(s=>s.storage===30&&s.category==='furniture'&&!objects.some(o=>o.id===s.id))!;
    expect(spec).toBeTruthy();
    const target=sceneCells(100000001).find(c=>c.area===1&&!placementProblem(model.doc,{}, {scene:100000001,cell:c.id,template:spec.id,angle:45}))!;
    expect(target).toBeTruthy();
    const doc=new SerDocument(applyMapEdits(model.doc,{objects:[{scene:100000001,cell:target.id,template:spec.id,angle:45}]}));
    const added=mapObjects(doc).find(o=>o.id===spec.id)!;
    const slots=doc.children(doc.resolve('p/itemList_',added.node)!);
    expect(slots).toHaveLength(30);
    expect(slots.every(n=>!doc.children(n).length)).toBe(true);
  },60_000);
  it('writes the same bounds and status as a floor tile the game placed', () => {
    const scene=100000001,read=(doc:SerDocument,node:SerNode)=>({
      aabb:['l','t','r','b'].map(k=>readFloat(doc,doc.resolve(`p/baseAABB_/${k}`,node)!)),
      status:doc.children(doc.resolve('p/statusValueMap_',node)!).map(n=>Number(readSigned(doc,n.tag===SerTag.Object?doc.resolve('id_',n)!:n)))
    });
    const game=mapObjects(model.doc).find(o=>o.id===202800200&&o.angle===45);
    const target=sceneCells(scene).find(c=>c.area===1&&!placementProblem(model.doc,{},{scene,cell:c.id,template:202800200,angle:45}))!;
    const doc=new SerDocument(applyMapEdits(model.doc,{objects:[{scene,cell:target.id,template:202800200,angle:45}]}));
    const added=mapObjects(doc).find(o=>o.uid===String(readSigned(doc,doc.resolve('statusUniqueIDGenerator_/idSeed_')!)))!;
    // 0x6573 is the packed key "se".
    expect(read(doc,added.node)).toEqual(game?read(model.doc,game.node):{aabb:[-64,-64,64,64],status:[0x6573,1]});
    expect(read(doc,added.node).aabb).toEqual([-64,-64,64,64]);
  },60_000);
  it('places objects with the bounds the game stores for them', () => {
    const scene=100000001,boxes=(doc:SerDocument,node:SerNode)=>['l','t','r','b'].map(k=>+readFloat(doc,doc.resolve(`p/baseAABB_/${k}`,node)!).toFixed(2));
    let checked=0;
    for(const game of mapObjects(model.doc).filter(o=>o.movable&&!o.parent&&[241000000,240040000,240400000].includes(o.id))) {
      const target=sceneCells(scene).find(c=>c.area===1&&!placementProblem(model.doc,{},{scene,cell:c.id,template:game.id,angle:game.angle}));
      if(!target)continue;
      const doc=new SerDocument(applyMapEdits(model.doc,{objects:[{scene,cell:target.id,template:game.id,angle:game.angle}]}));
      const added=mapObjects(doc).at(-1)!;
      expect(boxes(doc,added.node),`${game.id} @${game.angle}`).toEqual(boxes(model.doc,game.node));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  },120_000);
  it('allows two single-cell machines on adjacent diagonal cells', () => {
    const terrain=sceneCells(100000001);
    const candidates=terrain.filter(c=>(c.mask&2)&&areaAvailable(model.doc,c.area));
    let pair:typeof candidates=[];
    for(const cell of candidates) {
      const other=candidates.find(c=>c.x===cell.x+45&&c.y===cell.y+45);if(!other)continue;
      const first={scene:100000001,cell:cell.id,template:240030000,angle:45};
      if(placementProblem(model.doc,{},first))continue;
      const second={...first,cell:other.id};
      if(!placementProblem(model.doc,{objects:[first]},second)){pair=[cell,other];break;}
    }
    expect(pair.length).toBe(2);
    const result=mapObjects(new SerDocument(applyMapEdits(model.doc,{objects:pair.map(c=>({scene:100000001,cell:c.id,template:240030000,angle:45}))})));
    expect(result.length).toBe(mapObjects(model.doc).length+2);
  },60_000);
  it('accepts a mature tree for sap collection and rejects empty ground', () => {
    const tree=mapCells(model.doc).find(c=>c.crop>=1000&&c.crop<=1004&&sceneCells(100000001).some(t=>t.id===c.id));
    expect(tree).toBeTruthy();
    const growth=model.doc.resolve('p/pCropsStatus_/p/growth_/this->value_',tree!.node)!;
    const doc=new SerDocument(serializeSer(model.doc,{payloads:new Map([[growth.offset,encodeSigned(1000n,growth.size)]])}));
    const placement={scene:100000001,cell:tree!.id,template:240250000};
    expect(placementProblem(model.doc,{},placement)).toContain('成熟树木');
    expect(placementProblem(doc,{},placement)).toBeNull();
    const added=new SerDocument(applyMapEdits(doc,{objects:[placement]}));
    expect(mapObjects(added).filter(o=>o.id===240250000).length).toBe(mapObjects(doc).filter(o=>o.id===240250000).length+1);
    expect(placementProblem(doc,{cells:{[`100000001:${placement.cell}`]:{crop:null}}},placement)).toContain('成熟树木');
  });
  it.each([111200001,111110001,111020000])('upgrades building %i together with residents and indoor contents', id => {
    const before=mapObjects(model.doc), building=before.find(o=>o.id===id)!,spec=building.spec!;
    const upgraded=MAP_DATA.objects.find(s=>spec.upgrade?s.id===spec.upgrade:s.buildingFamily===spec.buildingFamily&&s.level===spec.level+1&&s.slot===spec.slot)!;
    const edits=addMapPlacement(model.doc,{}, {scene:100000001,cell:landId(building.x,building.y),template:upgraded.id,move:building.uid,angle:building.angle});
    expect(edits.objects!.length).toBeGreaterThan(1);
    const restored=parseSaveModel(decodeSave(exportSave(model,[],{},{},{},{},edits),'upgraded-copy'));
    const after=mapObjects(restored.doc);
    expect(after.find(o=>o.uid===building.uid)?.id).toBe(upgraded.id);
    // Every indoor object's identity and item payload survives migration.
    const itemTree=(doc:SerDocument,node:import('./ser').SerNode):unknown=>doc.children(node).length?doc.children(node).map(n=>[n.name,itemTree(doc,n)]):node.tag===0?Array.from(doc.payload(node)):null;
    for(const move of edits.objects!.filter(e=>e.move&&e.move!==building.uid)) {
      const old=before.find(o=>o.uid===move.move)!,next=after.find(o=>o.uid===move.move)!;
      expect(next).toMatchObject({id:old.id,angle:old.angle,...landPosition(move.cell)});
      expect(itemTree(restored.doc,restored.doc.resolve('p/itemList_',next.node)!)).toEqual(itemTree(model.doc,model.doc.resolve('p/itemList_',old.node)!));
    }
    expect(animalResidents(restored.doc).map(r=>[r.name,r.species,r.variant])).toEqual(animalResidents(model.doc).map(r=>[r.name,r.species,r.variant]));
    if(spec.upgrade) {
      const house=animalHouses(restored.doc).find(h=>h.id===upgraded.mapId)!;
      expect(house).toBeTruthy();
      expect(animalResidents(restored.doc).some(r=>house.slots.some(s=>s.id===r.placement))).toBe(true);
      expect(animalHouses(restored.doc).some(h=>h.id===spec.mapId)).toBe(false);
    }
  },60_000);
  it('can upgrade the same barn twice in one draft without leaving its contents in the intermediate room', () => {
    const building=mapObjects(model.doc).find(o=>o.id===111200001)!;
    let edits=addMapPlacement(model.doc,{}, {scene:100000001,cell:landId(building.x,building.y),template:111210001,move:building.uid});
    const contents=edits.objects!.filter(e=>e.move!==building.uid).map(e=>e.move);
    edits=addMapPlacement(model.doc,edits,{scene:100000001,cell:landId(building.x,building.y),template:111220001,move:building.uid});
    const finalMap=MAP_DATA.objects.find(o=>o.id===111220001)!.mapId;
    expect(edits.objects!.filter(e=>contents.includes(e.move)).every(e=>e.scene===finalMap)).toBe(true);
    expect(()=>exportSave(model,[],{},{},{},{},edits)).not.toThrow();
  },60_000);
  it('adds a barn from a matching template and opens its animal slots in the same export', () => {
    const objects = mapObjects(model.doc);
    const donor = objects.find(o => o.movable && o.spec?.building && MAP_DATA.objects.some(s => s.family === o.spec!.family && !objects.some(e => e.spec?.mapId === s.mapId)))!;
    expect(donor).toBeTruthy();
    const spec = MAP_DATA.objects.find(s => s.family === donor.spec!.family && !objects.some(e => e.spec?.mapId === s.mapId))!;
    const scene = MAP_DATA.scenes.find(s => s.code === 'MAP_ID_OPENWORLD')!;
    const terrain = sceneCells(scene.id);
    const valid = new Set(terrain.filter(c => (c.mask & 4) && areaAvailable(model.doc, c.area)).map(c => `${c.x},${c.y}`));
    const candidates = terrain.filter(c => {
      if (!(c.mask & 4) || !areaAvailable(model.doc, c.area)) return false;
      const [l,t,r,b] = donor.bounds, box = {l:c.x+Math.min(l,-22), t:c.y+Math.min(t,-22), r:c.x+Math.max(r,22), b:c.y+Math.max(b,22)};
      if (objects.some(o => !o.spec?.floor && box.l < o.x + Math.max(o.bounds[2],22) && box.r > o.x + Math.min(o.bounds[0],-22) && box.t < o.y + Math.max(o.bounds[3],22) && box.b > o.y + Math.min(o.bounds[1],-22))) return false;
      for (let x=Math.ceil(box.l/45)*45;x<=box.r;x+=45) for(let y=Math.ceil(box.t/45)*45;y<=box.b;y+=45) if ((Math.round(x/45)+Math.round(y/45))%2 === (Math.round(c.x/45)+Math.round(c.y/45))%2 && !valid.has(`${x},${y}`)) return false;
      return true;
    });
    expect(candidates.length).toBeGreaterThan(0);
    const target = candidates[0];
    const objectsDraft = [{ scene: scene.id, cell: target.id, template: spec.id }];
    const edits = { objects: objectsDraft };
    const builtMap = new SerDocument(applyMapEdits(model.doc, edits));
    const footprintCells = sceneCells(scene.id).filter(c => footprint(spec, target).some(poly => containsPoint(poly,c)));
    for (const cell of mapCells(builtMap).filter(c=>footprintCells.some(t=>t.id===c.id))) expect([cell.crop,cell.soil]).toEqual([0,0]);
    expect(() => applyMapEdits(model.doc, edits)).not.toThrow();
    expect(animalHouses(model.doc, mapBuildingFlags(edits!)).some(h => h.id === spec.mapId)).toBe(true);
    const house = animalHouses(model.doc, mapBuildingFlags(edits!)).find(h => h.id === spec.mapId)!;
    const species = ANIMALS.find(a => a.houseType === house.type)!;
    const animals = { added: { [house.slots[0].id]: { species: species.id, name: '新邻居' } } };
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, {}, animals, edits), 'layout'));
    expect(animalResidents(restored.doc).at(-1)).toMatchObject({ name: '新邻居', placement: house.slots[0].id });
    expect(animalHouses(restored.doc).length).toBe(animalHouses(model.doc).length + 1);
    expect(mapObjects(restored.doc).filter(o => o.id === spec.id)).toHaveLength(1);
    expect(animalHouses(restored.doc).some(h => h.id === spec.mapId)).toBe(true);
    const ids = mapObjects(restored.doc).map(o => o.uid);
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);
});
