import quarry from '../../data/sources/game-quarry.json';
import art from '../../data/sources/game-quarry-maps.json';
import { expectedRockCounts, rockCounts, sum, tilesetOf, type FloorKind, type RockWeight } from '../domain/quarry';
import { msg } from '../i18n/translate';
import { translatorFor } from '../i18n/server';
import type { Locale } from '../i18n/locales';
import { getCatalog, entityUrl } from './repository';
import { localizePath } from '../i18n/locales';
import { withBase } from '../lib/sitePath';

/**
 * Quarry floors, layouts and rooms from game-quarry.json (tools/extract-quarry.py) and
 * game-quarry-maps.json (tools/extract-quarry-maps.py), shared by the quarry guide and
 * its floor explorer.
 */
export type QuarryFloor = (typeof quarry.floors)[number] & { kind: FloorKind };
export type SpecialRoom = { room: string; weight: number };
type LayoutArt = { map_id: number; label_ja: string; file: string; width: number; height: number; cells: number };

export const floors = quarry.floors as QuarryFloor[];
export const layoutArt = art.layouts as Record<string, LayoutArt>;
export const rocks = quarry.rocks as Record<string, { code: string; names: Record<string, string>; drops: { item: string; min: number; max: number; chance: number }[] }>;
export const rooms = quarry.rooms;
export const rewards = quarry.rewards;

export const ROOM_NAMES: Record<string, string> = {
  DUNGEON_FLOOR_SPECIAL_BEE_LV1: msg('蜂巢房间 Lv1'), DUNGEON_FLOOR_SPECIAL_BEE_LV2: msg('蜂巢房间 Lv2'),
  DUNGEON_FLOOR_SPECIAL_GHOST: msg('幽灵房间'), DUNGEON_FLOOR_SPECIAL_DARKNESS: msg('黑暗房间'),
  DUNGEON_FLOOR_SPECIAL_COPPER: msg('铜矿脉房间'), DUNGEON_FLOOR_SPECIAL_IRON: msg('铁矿脉房间'), DUNGEON_FLOOR_SPECIAL_GOLD: msg('金矿脉房间'),
  DUNGEON_FLOOR_SPECIAL_METEORIC_IRON: msg('陨铁矿脉房间'), DUNGEON_FLOOR_SPECIAL_GEM: msg('宝石矿脉房间'),
};

/** map.dat labels the three looks of each layout 廃坑 / ジャングル / 金継ぎ. */
export const TILESETS = ['', msg('废矿'), msg('丛林'), msg('金缮')];

/** Layout shapes from the developers' map.dat labels (ダンジョン_<shape>_<n>_<tileset>); players never see these names. */
const SHAPES: Record<string, string> = {
  'I字': msg('I 字形'), 'Y字': msg('Y 字形'), '十字': msg('十字形'), 'O時': msg('环形'), 'だだっぴろい': msg('开阔地'), // i18n-ignore
  '碁盤上': msg('棋盘'), '六角': msg('六边形'), '迷路': msg('迷宫'), '敵道塞ぎ': msg('堵路'), 'L字': msg('L 字形'), // i18n-ignore
  'ノの字': msg('弯道'), 'コの字': msg('匚字形'), '渦巻き': msg('漩涡'), '四角': msg('方形'), '半円型': msg('半圆形'), // i18n-ignore
  'アリの巣': msg('蚁穴'), '蜘蛛の巣': msg('蛛网'), // i18n-ignore
};

/** The untranslated name of a layout, e.g. "迷宫 2"; rest and bottom floors have their own maps. */
export function layoutName(key: string): string {
  const label = layoutArt[key].label_ja;
  if (label.startsWith('ダンジョン休憩所')) return msg('休息层'); // i18n-ignore
  if (label === 'ダンジョン最下層') return msg('最底层'); // i18n-ignore
  const [, shape, variant] = label.split('_');
  if (!SHAPES[shape]) throw new Error(`Unnamed quarry layout shape ${shape} (${key})`);
  return `${SHAPES[shape]}\u0000${variant}`;
}

export const layoutCells = (keys: string[]) => keys.map(key => layoutArt[key].cells);

/** A special room's own layouts and rocks, or the floor's when the room has none (0x1400f63e0, 0x1400f67c0). */
export function roomSetup(roomId: string, floor: QuarryFloor) {
  const room = rooms.find(row => row.id === roomId)!;
  return room.layouts.length
    ? { layouts: room.layouts, rocks: room.rocks as RockWeight[], density: room.rock_percent! }
    : { layouts: floor.layouts, rocks: floor.rocks as RockWeight[], density: floor.rock_percent };
}

/** Expected rocks per type on a floor (or room), averaged over its equally likely layouts. */
export function expectedRocks(rows: RockWeight[], density: number, layouts: string[]) {
  return expectedRockCounts(rows, density, layoutCells(layouts));
}

/** Average rocks of each type on a floor, special rooms aside; empty where nothing spawns (rest floors, floor 120). */
export function floorRocks(floor: QuarryFloor): RockWeight[] {
  const rows = floor.rocks as RockWeight[], counts = expectedRocks(rows, floor.rock_percent, floor.layouts);
  return rows.map((row, index) => ({ rock: row.rock, weight: counts[index] })).filter(row => row.weight > 0);
}

/** Rock totals of each layout for this rock list and density. */
export const layoutRockTotals = (rows: RockWeight[], density: number, layouts: string[]) =>
  layouts.map(key => sum(rockCounts(rows, density, layoutArt[key].cells)));

/** Chance that entering a floor makes each special room; the ghost room's share goes to the others in safe mode. */
export function specialChances(floor: QuarryFloor) {
  const total = sum(floor.special_rooms.map(row => row.weight));
  return floor.special_rooms.map(row => ({ room: row.room, chance: floor.special_chance / 100 * row.weight / total }));
}

export type ExplorerLayout = { src: string; width: number; height: number; label: string; tileset: number };
export type ExplorerFloor = {
  floor: number; kind: FloorKind; tileset: number;
  /** Index into `pools`, `mixes` and `specials`. */
  pool: number; mix: number; special: number;
  /** Rock total of each layout in the pool, in pool order. */
  totals: number[];
};
export type ExplorerData = {
  layouts: Record<string, ExplorerLayout>;
  pools: string[][];
  /** Rock names with their expected count on the floor, most common first. */
  mixes: { name: string; count: number }[][];
  specials: { chance: number; rooms: { name: string; chance: number }[] }[];
  rewards: Record<number, { name: string; icon?: string; href?: string; count: number }>;
  tilesets: string[];
  floors: ExplorerFloor[];
};

/** Everything the floor explorer shows, translated, with repeated pools and mixes stored once. */
export function explorerData(locale: Locale): ExplorerData {
  const t = translatorFor(locale);
  const catalog = getCatalog(locale);
  const rockName = (id: number | string) => { const n = rocks[String(id)].names; return (locale === 'zh-CN' ? n['zh-CN'] : n[locale]) || n.ja; };
  const shared = <T,>(list: T[]) => { const index = new Map<string, number>(); return (value: T) => { const key = JSON.stringify(value); if (!index.has(key)) { index.set(key, list.length); list.push(value); } return index.get(key)!; }; };
  const data: ExplorerData = { layouts: {}, pools: [], mixes: [], specials: [], rewards: {}, tilesets: TILESETS.map(name => name && t(name)), floors: [] };
  const pool = shared(data.pools), mix = shared(data.mixes), special = shared(data.specials);
  for (const key of new Set(floors.flatMap(floor => floor.layouts))) {
    const image = layoutArt[key], [shape, variant] = layoutName(key).split('\u0000');
    data.layouts[key] = { src: withBase(`/${image.file}`), width: image.width, height: image.height, label: variant ? `${t(shape)} ${variant}` : t(shape), tileset: tilesetOf(key) };
  }
  for (const floor of floors) {
    // Several rock types share an in-game name (A/B variants), so merge by name.
    const merged = new Map<string, number>();
    for (const row of floorRocks(floor)) merged.set(rockName(row.rock), (merged.get(rockName(row.rock)) ?? 0) + row.weight);
    data.floors.push({
      floor: floor.floor, kind: floor.kind, tileset: Math.max(0, ...floor.layouts.map(tilesetOf)),
      pool: pool(floor.layouts),
      mix: mix([...merged].map(([name, count]) => ({ name, count: Math.round(count * 10) / 10 })).sort((a, b) => b.count - a.count)),
      special: special({ chance: floor.special_chance, rooms: specialChances(floor).map(row => ({ name: t(ROOM_NAMES[row.room]), chance: row.chance })) }),
      totals: layoutRockTotals(floor.rocks as RockWeight[], floor.rock_percent, floor.layouts),
    });
  }
  for (const reward of rewards) {
    const item = catalog.entities.find(entity => entity.kind === 'items' && entity.id === reward.item);
    data.rewards[reward.floor] = { name: item?.name.zh_hans ?? reward.item, icon: item?.icon_path ? withBase(item.icon_path) : undefined,
      href: item ? withBase(localizePath(entityUrl(item), locale)) : undefined, count: reward.count };
  }
  return data;
}
