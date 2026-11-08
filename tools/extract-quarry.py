"""Export quarry floors, layouts, rock spawn weights, rock drop rolls and first-arrival rewards.

dungeon.dat records are 168 int32 words:
  [0]        record number
  [6]        monster density: percent of the layout's rock cells that get a monster
  [7]        rock density: percent of the layout's rock cells that get a rock
  [9:21]     four (creature id, 0, weight) triples
  [21:57]    twelve (rock crop id, 0, weight) triples; weights are percents of the rock total
  [57:147]   thirty (map id, 0, weight) layout slots; every shipped weight is 1
  [147]      special-room chance in percent
  [148:160]  six (record number, weight) special-room pairs
Word [8] is not read by the placement code traced below.

village.exe, build 25640656:
- DungeonSetupNextFloor → 0x1400f63e0 picks the next floor. On floors up to 120 it
  rolls rand(100) < special chance, then a weighted special room. The ghost room
  (record 123) is skipped while GAME_FLAG_HORROR_OFF_MODE (flag 399) is set. It then
  picks a layout by weight from the chosen record's pool; a special room with an
  empty pool uses the floor's own pool.
- DungeonPlacementEnemyAndVein → 0x140267990 places rocks and monsters after the map
  loads. 0x1400f67c0 fills an empty special-room rock list (and its rock density) or
  monster list (and its monster density) from the floor record. Candidate cells are
  the unique YMWR cells whose mask has bit 0x10 (0x1401d2730, filter 0x1401d5930).
  With S = density/100 × cells + 0.5 (single precision), nothing is placed when
  trunc(S) is 0. Otherwise each rock type, in list order, is filled to
  max(1, trunc(weight/100 × S + 0.5)) rocks; copper, iron and gold deposit rocks
  (1307–1309) add a shrine-ability bonus to their weight. The pass repeats only while
  it still places rocks and fewer than trunc(S) are down, which covers placements that
  did not fit. Monsters: ceil(density/100 × cells), split by creature weight.
- Rest floors use MAP_ID_DUNGEON_REST (map_3102) and spawn nothing; the first-arrival
  reward comes from event_dungeon_floor_entry (GAME_FLAG_DUNGEON_REWARD_<floor>).
- map.dat also lists dedicated beehive, ghost, darkness and ore-room maps (3206–3210,
  three tilesets each). No dungeon.dat pool or code path loads them in this build.

Rock drops are cropsharvest.dat 44-byte rolls: item, action, min, max and an
independent chance in percent.
"""
import hashlib
import json
import runpy
import struct
from pathlib import Path
from honogurashi_extractor.gamedir import game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.localization import localized_block

ns = runpy.run_path('tools/inspect-lua54.py')
read_chunk, OPS = ns['read_chunk'], ns['OPS']
archive = FafullfsArchive.open(game_dir(__doc__) / 'data.dat')
items = {item['numeric_id']: item['id'] for item in json.loads(Path('data/generated/build-25640656/entities/items.json').read_text(encoding='utf-8')) if item.get('numeric_id')}
item_ids = set(items.values())

# map.dat: id → layout key such as 3301_dg01 (the YMWR file stem) and its Japanese label.
maps = read_table(archive.read_entry('data/database/map.dat'))
map_rows = {struct.unpack_from('<Q', record)[0]: group for record, group in zip(maps.records, _string_groups(maps), strict=True)}
layout_key = lambda map_id: Path(map_rows[map_id][2]).stem.removeprefix('map_')

dungeon = read_table(archive.read_entry('data/database/dungeon.dat'))
records = {}
for record, group in zip(dungeon.records, _string_groups(dungeon), strict=True):
    words = struct.unpack('<168i', record)
    rocks = {}
    for index in range(21, 57, 3):
        if words[index]:
            rocks[words[index]] = rocks.get(words[index], 0) + words[index + 2]
    pool = [(words[index], words[index + 2]) for index in range(57, 147, 3) if words[index]]
    assert all(weight == 1 for _, weight in pool), (group[0], pool)
    rooms = [dict(room=words[index], weight=words[index + 1]) for index in range(148, 160, 2) if words[index]]
    records[words[0]] = dict(code=group[0], ja=group[1], rocks=[dict(rock=k, weight=v) for k, v in rocks.items()],
                             monster_percent=words[6], rock_percent=words[7], layouts=[layout_key(map_id) for map_id, _ in pool],
                             special_chance=words[147] if rooms else 0, special_rooms=rooms)

floors = [dict(floor=number, **{k: v for k, v in record.items() if k not in ('code', 'ja')})
          for number, record in records.items() if record['code'].startswith('DUNGEON_FLOOR_') and record['code'][14:].isdigit()]
special = {number: record['code'] for number, record in records.items() if 'SPECIAL' in record['code']}
bottom = max(floor['floor'] for floor in floors)
for floor in floors:
    floor['special_rooms'] = [dict(room=special[row['room']], weight=row['weight']) for row in floor['special_rooms']]
    floor['kind'] = 'bottom' if floor['floor'] == bottom else 'rest' if not floor['rocks'] else 'normal'
    if floor['kind'] == 'rest':
        assert floor['floor'] % 10 == 0 and [key[:4] for key in floor['layouts']] == ['3102'], floor
    else:
        assert floor['kind'] == 'bottom' or floor['floor'] % 10, floor
rooms = [dict(id=record['code'], name_ja=record['ja'], rocks=record['rocks'], layouts=record['layouts'],
              rock_percent=record['rock_percent'] if record['rocks'] else None,
              monster_percent=record['monster_percent'] if record['monster_percent'] else None)
         for number, record in records.items() if number in special]
# Rooms that fall back to the floor's layouts and rocks (0x1400f63e0, 0x1400f67c0).
assert {room['id'] for room in rooms if not room['layouts']} == {room['id'] for room in rooms if not room['rocks']} == {
    'DUNGEON_FLOOR_SPECIAL_BEE_LV1', 'DUNGEON_FLOOR_SPECIAL_BEE_LV2', 'DUNGEON_FLOOR_SPECIAL_GHOST', 'DUNGEON_FLOOR_SPECIAL_DARKNESS'}
used_maps = {key for source in (*floors, *rooms) for key in source['layouts']}
assert not any(key[:4] in ('3206', '3207', '3208', '3209', '3210') for key in used_maps), used_maps

# First-arrival rewards: each reach_floor_<n> closure calls createReward(flag, item, count).
raw = archive.read_entry('data/script/event_dungeon_floor_entry.lub')
if hashlib.sha256(raw).hexdigest() != '711e3f899aaa4185528ca2ce78475f0f86c15907267a11ec633747c1a9bd127f':
    raise SystemExit('event_dungeon_floor_entry changed; re-trace the rewards before extracting')
script = read_chunk(raw)
kinds = {floor['floor']: floor['kind'] for floor in floors}
rewards = []
for name, child in zip(script['constants'][1:], script['children'][1:], strict=True):
    floor = int(name.removeprefix('reach_floor_'))
    flag = next(c for c in child['constants'] if isinstance(c, str) and c.startswith('GAME_FLAG_DUNGEON_REWARD_'))
    item = next(c for c in child['constants'] if isinstance(c, str) and c.startswith('ITEM_ID_'))
    counts = [(word >> 15) - 65535 for word in child['code'] if OPS[word & 127] == 'LOADI']
    assert flag == f'GAME_FLAG_DUNGEON_REWARD_{floor}' and item in item_ids and len(counts) == 1, (name, flag, item, counts)
    assert kinds[floor] == 'rest', floor
    rewards.append(dict(floor=floor, item=item, count=counts[0]))
assert [reward['floor'] for reward in rewards] == list(range(10, bottom, 10)), rewards

crops = read_table(archive.read_entry('data/database/crops.dat'))
crop_names = {struct.unpack_from('<I', record)[0]: group for record, group in zip(crops.records, _string_groups(crops), strict=True)}
used = {row['rock'] for source in (*floors, *rooms) for row in source['rocks']}
harvest = read_table(archive.read_entry('data/database/cropsharvest.dat'))
rocks = {}
for record in harvest.records:
    word = lambda offset: struct.unpack_from('<I', record, offset)[0]
    if word(0) not in used:
        continue
    drops, cursor = [], 20
    for _ in range(word(16)):
        stages, cursor = word(cursor + 4), cursor + 8
        for _ in range(stages):
            count, cursor = word(cursor + 4), cursor + 8
            for _ in range(count):
                item, action, low, high, chance = (word(cursor + offset) for offset in (0, 8, 20, 24, 28))
                cursor += 44
                drops.append(dict(item=items[item], min=low, max=high, chance=chance))
    group = crop_names[word(0)]
    rocks[word(0)] = dict(code=group[0], names=localized_block(group, 1, 7), drops=drops)
missing = used - rocks.keys()
if missing:
    raise SystemExit(f'rocks without drop rolls: {sorted(missing)}')

Path('data/sources/game-quarry.json').write_text(json.dumps(dict(
    source='dungeon.dat + map.dat + cropsharvest.dat + crops.dat + event_dungeon_floor_entry (build 25640656)',
    floors=floors, rooms=rooms, rewards=rewards, rocks={str(k): v for k, v in sorted(rocks.items())}), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(f'quarry: {len(floors)} floors, {len(rooms)} special rooms, {len(rewards)} rewards, {len(rocks)} rock types, {len(used_maps)} layouts')
