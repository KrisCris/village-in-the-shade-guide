import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel } from './saveModel';
import { applyMapEdits, MAP_CROPS, MAP_DATA, mapCells, mapObjects, parseMapPreset, sceneCells, areaAvailable, landPosition } from './saveMap';
import { readSigned, SerDocument } from './ser';
import { animalHouses, ANIMALS, animalResidents } from './saveAnimals';
import { mapBuildingFlags } from './saveMap';

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
    const crops = mapCells(model.doc).filter(c => {
      const p = landPosition(c.id);
      return c.crop && p.x >= target.x + Math.min(donor.bounds[0], -22) && p.x <= target.x + Math.max(donor.bounds[2], 22) && p.y >= target.y + Math.min(donor.bounds[1], -22) && p.y <= target.y + Math.max(donor.bounds[3], 22);
    });
    const objectsDraft = [{ scene: scene.id, cell: target.id, template: spec.id }];
    if (crops.length) expect(() => applyMapEdits(model.doc, { objects: objectsDraft })).toThrow('有作物');
    const edits = { objects: objectsDraft, cells: Object.fromEntries(crops.map(c => [`${scene.id}:${c.id}`, { crop: null }])) };
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
