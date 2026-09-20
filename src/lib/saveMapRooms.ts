import { MAP_DATA, mapObjects } from './saveMap';
import { flagEnabled } from './saveProgress';
import type { SerDocument } from './ser';
import type { MapArt, RoomFixture } from './saveMapScene';

export interface MapRoom {
  id: string;
  scene: number;
  name: string;
  description: string;
  floor: number;
  bounds: number[];
  file: string;
  fixtures?: RoomFixture[];
}

/** Only the current house layout and constructed outbuildings are editable. */
export function availableMapRooms(doc: SerDocument, art: MapArt): MapRoom[] {
  const objects = mapObjects(doc);
  const level = flagEnabled(doc, 142) ? 4 : flagEnabled(doc, 141) ? 3 : flagEnabled(doc, 140) ? 2 : 1;
  const house = MAP_DATA.scenes.find(s => s.code === `MAP_ID_MYHOUSE_LV${level}_01`)!;
  const rooms: MapRoom[] = [];
  const add = (scene: number, name: string, description: string, home = false) => {
    for (const [floor, layout] of (art.rooms?.[scene] ?? []).entries()) {
      rooms.push({ id: `${scene}:${floor}`, scene, floor, name: home ? `我的家 · ${floor === 0 ? '一楼' : '二楼'}` : name, description, ...layout });
    }
  };
  add(house.id, '我的家', ['破旧房屋', '修缮后', '两层住宅', '扩建后的两层住宅'][level - 1], true);
  if (flagEnabled(doc, 143)) add(211040001, '我的家 · 地下室', '已建造地下室');
  const built = new Set(objects.flatMap(o => {
    const map = o.spec?.mapId || art.objects[o.id]?.mapId;
    return map ? [map] : [];
  }));
  for (const scene of MAP_DATA.scenes) {
    if (!built.has(scene.id) || scene.code.includes('MYHOUSE')) continue;
    const number = scene.code.match(/_(0[1-4])(?:_MIRROR)?$/)?.[1];
    const name = scene.code.includes('AVIARY') ? '禽舍' : scene.code.includes('LIVESTOCK') ? '畜舍' : '温室';
    add(scene.id, `${name}${number ? ` ${Number(number)}` : ''}`, '单层');
  }
  return rooms;
}
