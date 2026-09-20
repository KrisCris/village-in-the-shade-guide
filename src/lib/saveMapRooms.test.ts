import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeSave } from './saveEditor';
import { parseSaveModel } from './saveModel';
import { SerDocument, serializeSer } from './ser';
import { availableMapRooms } from './saveMapRooms';
import { buildFarmScene, spriteArt, angleCode, type MapArt } from './saveMapScene';
import { applyMapEdits, mapObjects, sceneCells } from './saveMap';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
const art = JSON.parse(readFileSync('public/maps/farm/manifest.json', 'utf8')) as MapArt;

describe('verified room and furnishing art', () => {
  it('uses the parasol atlas instead of the shared tractor atlas', () => {
    expect(art.objects[245110200].replacement).toBe(2050);
    expect(art.objects[245110400].replacement).toBe(2053);
    expect(spriteArt(art, 'object', 245110200, 0)?.file).not.toBe(spriteArt(art, 'object', 245110000, 0)?.file);
    expect(spriteArt(art, 'object', 245110400, 0)?.file).not.toBe(spriteArt(art, 'object', 245110000, 0)?.file);
  });
  it('preserves the mirrored aviary pivot and reflected footprint', () => {
    const mirrored = spriteArt(art, 'object', 111110001, 3)!;
    const regular = spriteArt(art, 'object', 111110000, 3)!;
    expect(art.objects[111110001].mirror).toBe(true);
    expect(mirrored.w).toBe(regular.w);
    expect(mirrored.x).toBe(-regular.x - regular.w);
    expect(mirrored.file).not.toBe(regular.file);
  });
  it('selects all four saved diagonal furniture directions', () => {
    expect([45,135,-135,-45].map(angleCode)).toEqual([3,1,7,9]);
    expect(new Set([45,135,-135,-45].map(a => spriteArt(art,'object',241000000,0,undefined,a)?.file)).size).toBe(4);
  });
});

describe.skipIf(!hasPrivateSaveFixtures)('save-driven native rooms', () => {
  const load = () => parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'copy')).doc;
  function house(doc: SerDocument, level: number, basement: boolean) {
    const flag = doc.resolve('flags_/flags_')!;
    const bytes = doc.payload(flag).slice();
    for (const id of [140,141,142,143,144]) bytes[id >> 3] &= ~(1 << (id & 7));
    for (const id of [...(level > 1 ? [138+level] : []), ...(basement ? [143] : []), ...(level > 2 ? [144] : [])]) bytes[id >> 3] |= 1 << (id & 7);
    return new SerDocument(serializeSer(doc, { payloads: new Map([[flag.offset, bytes]]) }));
  }
  it.each([1,2,3,4])('exposes only the current level %i, with a separate optional basement', level => {
    for (const basement of [false,true]) {
      const rooms = availableMapRooms(house(load(),level,basement), art).filter(r => r.name.startsWith('我的家'));
      expect(rooms.map(r => r.name)).toEqual(['我的家 · 一楼', ...(level > 2 ? ['我的家 · 二楼'] : []), ...(basement ? ['我的家 · 地下室'] : [])]);
      expect(rooms[0].scene).toBe(211000001+(level-1)*10000);
      expect(rooms.every(r => r.bounds[2]>r.bounds[0] && r.bounds[3]>r.bounds[1])).toBe(true);
    }
  });
  it('isolates upstairs and downstairs, including fixed windows and gated basement stairs', () => {
    const doc=house(load(),3,true), rooms=availableMapRooms(doc,art).filter(r=>r.scene===211020001);
    const scenes=rooms.map(room=>buildFarmScene(doc,{}, {...art,bounds:room.bounds,fixtures:room.fixtures},3,false,room.scene));
    expect(scenes[0].some(s=>s.id===211010010)).toBe(true);
    expect(scenes[0].some(s=>s.id===211010000)).toBe(true);
    expect(scenes[1].every(s=>!scenes[0].some(t=>t.key===s.key && !s.key.startsWith('fixture:')))).toBe(true);
    expect(scenes.flat().filter(s=>!s.art)).toEqual([]);
    const noBasement=house(doc,3,false);
    expect(buildFarmScene(noBasement,{}, {...art,bounds:rooms[0].bounds,fixtures:rooms[0].fixtures},3,false,rooms[0].scene).some(s=>s.id===211010010)).toBe(false);
  });
  it('moves indoor furniture without changing its identity, orientation or other objects', () => {
    const doc=load(), room=availableMapRooms(doc,art)[0], original=mapObjects(doc);
    const object=original.find(o=>o.movable && o.x>room.bounds[0] && o.x<room.bounds[2] && o.y>room.bounds[1] && o.y<room.bounds[3])!;
    expect(object).toBeTruthy();
    let restored: SerDocument | undefined;
    for(const cell of sceneCells(room.scene).filter(c=>c.mask&2 && Math.hypot(c.x-object.x,c.y-object.y)>90)) {
      try {restored=new SerDocument(applyMapEdits(doc,{objects:[{scene:room.scene,cell:cell.id,template:object.id,move:object.uid}]}));break;} catch { /* next valid empty position */ }
    }
    expect(restored).toBeDefined();
    const after=mapObjects(restored!); const moved=after.find(o=>o.uid===object.uid)!;
    expect(moved.id).toBe(object.id);expect(moved.angle).toBe(object.angle);
    expect([moved.x,moved.y]).not.toEqual([object.x,object.y]);
    expect(after.filter(o=>o.uid!==object.uid).map(o=>[o.uid,o.id,o.x,o.y,o.angle])).toEqual(original.filter(o=>o.uid!==object.uid).map(o=>[o.uid,o.id,o.x,o.y,o.angle]));
  });
});
