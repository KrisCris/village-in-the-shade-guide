import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';
import { ANIMALS, animalHouses, animalResidents } from './saveAnimals';
import { readFloat, readSigned, type SerDocument } from './ser';
import places from '../../data/sources/game-save-placements.json';
import { addMapPlacement, landPosition, placementProblem, sceneCells, stablePosition, type MapEdits } from './saveMap';
let model: ReturnType<typeof parseSaveModel>;
const ascii = (value: bigint) => { let text = ''; for (let v = value; v > 0n; v >>= 8n) text += String.fromCharCode(Number(v & 255n)); return text; };
function buildingRecord(doc: SerDocument, id: number) {
  const record = doc.children(doc.resolve('gimmickList_')!).findLast(node => readSigned(doc, doc.resolve('p/pData_/dataID', node)!) === BigInt(id))!;
  const entries = doc.children(doc.resolve('p/statusValueMap_', record)!), status: Record<string, number> = {};
  for (let i = 0; i < entries.length; i += 2) status[ascii(readSigned(doc, doc.resolve('id_', entries[i])!))] = Number(readSigned(doc, entries[i + 1]));
  return { angle: readFloat(doc, doc.resolve('p/angle_', record)!), tag: ascii(readSigned(doc, doc.resolve('p/tag_/id_', record)!)), status };
}
beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
describe.skipIf(!hasPrivateSaveFixtures)('animal placement rules', () => {
  it('keeps multiple constructed buildings and the stable in separate groups', () => {
    const flags = Object.fromEntries(places.placements.flatMap(place => place.requires).filter(Boolean).map(flag => [flag, true]));
    const expanded = parseSaveModel(decodeSave(exportSave(model, [], {}, { flags }), 'expanded-houses'));
    const houses = animalHouses(expanded.doc);
    expect(houses.filter(house => house.type === 0).length).toBeGreaterThan(1);
    expect(houses.filter(house => house.type === 1).length).toBeGreaterThan(1);
    expect(new Set(houses.map(house => house.id)).size).toBe(houses.length);
    const stable = houses.find(house => house.type === 2)!;
    expect(stable.title).toBe('马棚');
    expect(stable.slots.map(slot => slot.id)).toEqual([412, 413, 414]);
    expect(() => exportSave(expanded, [], {}, {}, {}, { moves: { 1: 412 } })).toThrow();
  });
  it('names barns and coops after their building slot, so a new one never renames the old', () => {
    const before = animalHouses(model.doc).map(house => house.title);
    const titles = animalHouses(model.doc, { flags: { 101: true, 109: true } }).map(house => house.title);
    expect(titles).toEqual(['畜舍 1', '畜舍 2', '禽舍 1', '禽舍 2']);
    expect(titles).toEqual(expect.arrayContaining(before));
  });
  it('derives four barn and eight aviary positions from construction flags', () => {
    const houses = animalHouses(model.doc);
    expect(houses.map(house => [house.type, house.slots.length])).toEqual([[0, 4], [1, 8]]);
    expect(houses[0].slots[0]).toMatchObject({ id: 109, x: 71730, y: 58500 });
    expect(houses[1].slots[0]).toMatchObject({ id: 317, x: 23580, y: 81450 });
  });
  it('swaps residents, updates home and current coordinates, and retains simultaneous friendship edits', () => {
    const resident = animalResidents(model.doc)[1];
    const love = model.doc.resolve(`livestockList_/${resident.index}/p/loveRate_/this->value_`)!;
    const restored = parseSaveModel(decodeSave(exportSave(model, pendingChanges(model, { [love.offset]: '1500' }), {}, {}, {}, { moves: { 1: 318, 3: 317 } }), 'edited'));
    expect(animalResidents(restored.doc)[1].placement).toBe(318);
    expect(readFloat(restored.doc, restored.doc.resolve('livestockList_/1/p/basePos_/x')!)).toBe(23535);
    expect(readFloat(restored.doc, restored.doc.resolve('livestockList_/1/p/pos_/y')!)).toBe(81360);
    expect(readSigned(restored.doc, restored.doc.resolve('livestockList_/1/p/loveRate_/this->value_')!)).toBe(1500n);
    expect(() => exportSave(model, [], {}, {}, {}, { moves: { 1: 318 } })).toThrow('占用');
    expect(() => exportSave(model, [], {}, {}, {}, { moves: { 1: 109 } })).toThrow('不兼容');
  });
  it('adds a named animal to a free compatible position and preserves existing residents', () => {
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, {}, { added: { 321: { species: 1, name: '新伙伴' } } }), 'edited'));
    const residents = animalResidents(restored.doc);
    expect(residents).toHaveLength(11);
    expect(residents.at(-1)).toMatchObject({ name: '新伙伴', species: 1, placement: 321 });
    const ids = residents.map(resident => readSigned(restored.doc, restored.doc.resolve(`livestockList_/${resident.index}/p/uniqueID_`)!));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('adds absent turkey, colored chick and a brown chick using their own data and texture', () => {
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, {}, { added: {
      321: { species: 5, variant: 0, name: '火鸡' },
      322: { species: 19, variant: 0, name: '红色小鸡' },
      323: { species: 2, variant: 1, name: '咖啡小鸡' },
    } }), 'edited'));
    const residents = animalResidents(restored.doc);
    expect(residents.slice(-3).map(r => [r.species, r.variant])).toEqual([[5, 0], [19, 0], [2, 1]]);
    const chick = residents.at(-1)!;
    const get = (path: string) => restored.doc.resolve(`livestockList_/${chick.index}/p/${path}`)!;
    expect(readSigned(restored.doc, get('pReplaceTexData_/dataID'))).toBe(609n);
    expect(readSigned(restored.doc, get('growStatus_'))).toBe(0n);
    // An adult starts at the age its baby form grows up at, like the adults the game writes.
    const turkey = residents.at(-3)!;
    expect(readSigned(restored.doc, restored.doc.resolve(`livestockList_/${turkey.index}/p/growStatus_`)!)).toBe(10n);
    const grown = animalResidents(model.doc).filter(r => r.species === 1 || r.species === 7);
    expect(grown.map(r => readSigned(model.doc, model.doc.resolve(`livestockList_/${r.index}/p/growStatus_`)!))).toEqual(grown.map(r => BigInt(ANIMALS.find(a => a.adultId === r.species)!.growDays)));
    expect(restored.doc.children(get('statusValueMap_'))).toHaveLength(0);
    expect(readSigned(restored.doc, get('loveRate_/this->value_'))).toBe(0n);
    expect(ANIMALS.find(a => a.id === 2)).toMatchObject({ growDays: 5, adultId: 1 });
    expect(ANIMALS.find(a => a.id === 1)?.variants.map(v => v.texture)).toEqual([618, 620, 621]);
    expect(residents.slice(0,10).map(r => [r.name, r.species, r.placement])).toEqual(animalResidents(model.doc).map(r => [r.name,r.species,r.placement]));
  });
  it('stands an added horse at the stable attachment point and keeps it there when the stable moves', () => {
    // No stable on the map: the stable positions exist only once one is built.
    expect(() => exportSave(model, [], {}, { flags: { 145: true } }, {}, { added: { 410: { species: 17, name: '马' } } })).toThrow();
    let map: MapEdits = {};
    for (const cell of sceneCells(100000001).filter(t => t.mask & 1)) {
      const placement = { scene: 100000001, cell: cell.id, template: 112010000 };
      if (!placementProblem(model.doc, map, placement)) { map = addMapPlacement(model.doc, map, placement); break; }
    }
    const stable = stablePosition(model.doc, map)!;
    expect(stable).toMatchObject(landPosition(map.objects![0].cell));
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, {}, { added: { 410: { species: 17, variant: 1, name: '栗子' } } }, map), 'horse'));
    const horse = animalResidents(restored.doc).at(-1)!;
    expect(horse).toMatchObject({ species: 17, variant: 1, placement: 410, name: '栗子' });
    const get = (path: string) => readFloat(restored.doc, restored.doc.resolve(`livestockList_/${horse.index}/p/${path}`)!);
    // posIN02 of the stable model; the foal grows up after 20 days.
    expect([get('pos_/x'), get('pos_/y'), get('basePos_/x'), get('basePos_/y')]).toEqual([stable.x - 102, stable.y - 121, stable.x - 102, stable.y - 121]);
    expect(readSigned(restored.doc, restored.doc.resolve(`livestockList_/${horse.index}/p/growStatus_`)!)).toBe(20n);
    expect(buildingRecord(restored.doc, 112010000)).toEqual({ angle: 0, tag: '', status: { build: 0, food01: 0, food02: 0, food03: 0 } });
  });
  it('saves new barns and coops the way the game does', () => {
    let map: MapEdits = {};
    for (const template of [111200010, 111100010]) for (const cell of sceneCells(100000001).filter(t => t.mask & 1)) {
      const placement = { scene: 100000001, cell: cell.id, template, angle: 135 };
      if (!placementProblem(model.doc, map, placement)) { map = addMapPlacement(model.doc, map, placement); break; }
    }
    expect(map.objects!.map(object => object.angle)).toEqual([0, 0]);
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, {}, {}, map), 'homes'));
    // Only the first coop slot carries the "aviary" tag in game-built saves.
    expect(buildingRecord(restored.doc, 111200010)).toEqual({ angle: 0, tag: '', status: { openUpd: 1 } });
    expect(buildingRecord(restored.doc, 111100010)).toEqual({ angle: 0, tag: '', status: { openUpd: 1 } });
  });
  it('rejects nonexistent coats, incompatible homes and story creatures', () => {
    for (const animal of [{species:1,variant:99},{species:100,variant:0},{species:7,variant:0}]) {
      expect(() => exportSave(model, [], {}, {}, {}, {added:{321:{...animal,name:'无效'}}})).toThrow();
    }
  });
});
