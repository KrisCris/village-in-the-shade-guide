import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';
import { ANIMALS, animalHouses, animalResidents } from './saveAnimals';
import { readFloat, readSigned } from './ser';
let model: ReturnType<typeof parseSaveModel>;
beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
describe.skipIf(!hasPrivateSaveFixtures)('animal placement rules', () => {
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
    expect(restored.doc.children(get('statusValueMap_'))).toHaveLength(0);
    expect(readSigned(restored.doc, get('loveRate_/this->value_'))).toBe(0n);
    expect(ANIMALS.find(a => a.id === 2)).toMatchObject({ growDays: 5, adultId: 1 });
    expect(ANIMALS.find(a => a.id === 1)?.variants.map(v => v.texture)).toEqual([618, 620, 621]);
    expect(residents.slice(0,10).map(r => [r.name, r.species, r.placement])).toEqual(animalResidents(model.doc).map(r => [r.name,r.species,r.placement]));
  });
  it('rejects nonexistent coats, incompatible homes and story creatures', () => {
    for (const animal of [{species:1,variant:99},{species:100,variant:0},{species:7,variant:0}]) {
      expect(() => exportSave(model, [], {}, {}, {}, {added:{321:{...animal,name:'无效'}}})).toThrow();
    }
  });
});
