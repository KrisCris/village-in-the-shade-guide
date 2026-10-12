import { MAP_DATA, draftObjects, mapBuildingFlags, type MapEdits } from './saveMap';
import { flagEnabled } from './saveProgress';
import type { SerDocument } from './ser';
import type { MapArt, RoomFixture } from './saveMapScene';
import { tr } from '../i18n/active';

export interface MapRoom {
  id: string;
  scene: number;
  name: string;
  description: string;
  floor: number;
  /** Player house floors and basement, shown as floor tabs. */
  home?: boolean;
  floorName?: string;
  bounds: number[];
  file: string;
  scenery?: string;
  fixtures?: RoomFixture[];
}

/** Only the current house layout and constructed outbuildings are editable. */
export function availableMapRooms(doc: SerDocument, art: MapArt, edits: MapEdits = {}): MapRoom[] {
  const objects = draftObjects(doc, edits), progress=mapBuildingFlags(edits,doc);
  const level = flagEnabled(doc, 142,progress) ? 4 : flagEnabled(doc, 141,progress) ? 3 : flagEnabled(doc, 140,progress) ? 2 : 1;
  const house = MAP_DATA.scenes.find(s => s.code === `MAP_ID_MYHOUSE_LV${level}_01`)!;
  const rooms: MapRoom[] = [];
  const add = (scene: number, name: string, description: string, home?: 'house' | 'basement') => {
    for (const [floor, layout] of (art.rooms?.[scene] ?? []).entries()) {
      const floorName = home === 'house' ? (floor === 0 ? tr('一楼') : tr('二楼')) : home === 'basement' ? tr('地下室') : undefined;
      rooms.push({ id: `${scene}:${floor}`, scene, floor, name: floorName ? tr('我的家 · {floor}', { floor: floorName }) : name, description, ...(home && { home: true, floorName }), ...layout });
    }
  };
  add(house.id, tr('我的家'), [tr('破旧房屋'), tr('修缮后'), tr('两层住宅'), tr('扩建后的两层住宅')][level - 1], 'house');
  if (flagEnabled(doc, 143)) add(211040001, tr('我的家'), tr('已建造地下室'), 'basement');
  const built = new Set(objects.flatMap(o => {
    const map = o.spec?.mapId || art.objects[o.id]?.mapId;
    return map ? [map] : [];
  }));
  for (const scene of MAP_DATA.scenes) {
    if (!built.has(scene.id) || scene.code.includes('MYHOUSE')) continue;
    const number = scene.code.match(/_(0[1-4])(?:_MIRROR)?$/)?.[1];
    const name = scene.code.includes('AVIARY') ? tr('鸡舍') : scene.code.includes('LIVESTOCK') ? tr('畜舍') : scene.code.includes('BARN') ? tr('仓库') : tr('温室');
    add(scene.id, `${name}${number ? ` ${Number(number)}` : ''}`, tr('单层'));
  }
  return rooms;
}
