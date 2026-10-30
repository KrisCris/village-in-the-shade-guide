"""Export quarry floors, rock spawn weights and rock drop rolls from dungeon.dat and cropsharvest.dat.

dungeon.dat records are 168 int32 words: [0] record number, [21:57] twelve
(rock crop id, 0, weight) triples, [147] special-room chance in percent and
[148:160] six (record number, weight) pairs. Every tenth floor is the rest
area and spawns no rocks. Rock drops are cropsharvest.dat 44-byte rolls:
item, action, min, max and an independent chance in percent.
"""
import json
import struct
from pathlib import Path
from honogurashi_extractor.gamedir import game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.localization import localized_block

archive = FafullfsArchive.open(game_dir(__doc__) / 'data.dat')
items = {item['numeric_id']: item['id'] for item in json.loads(Path('data/generated/build-25640656/entities/items.json').read_text(encoding='utf-8')) if item.get('numeric_id')}

dungeon = read_table(archive.read_entry('data/database/dungeon.dat'))
records = {}
for record, group in zip(dungeon.records, _string_groups(dungeon), strict=True):
    words = struct.unpack('<168i', record)
    rocks = {}
    for index in range(21, 57, 3):
        if words[index]:
            rocks[words[index]] = rocks.get(words[index], 0) + words[index + 2]
    rooms = [dict(room=words[index], weight=words[index + 1]) for index in range(148, 160, 2) if words[index]]
    records[words[0]] = dict(code=group[0], ja=group[1], rocks=[dict(rock=k, weight=v) for k, v in rocks.items()],
                             special_chance=words[147] if rooms else 0, special_rooms=rooms)

floors = [dict(floor=number, **{k: v for k, v in record.items() if k not in ('code', 'ja')})
          for number, record in records.items() if record['code'].startswith('DUNGEON_FLOOR_') and record['code'][14:].isdigit()]
special = {number: record['code'] for number, record in records.items() if 'SPECIAL' in record['code']}
for floor in floors:
    floor['special_rooms'] = [dict(room=special[row['room']], weight=row['weight']) for row in floor['special_rooms']]
rooms = [dict(id=record['code'], name_ja=record['ja'], rocks=record['rocks']) for number, record in records.items() if number in special]

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
    source='dungeon.dat + cropsharvest.dat + crops.dat (build 25640656)',
    floors=floors, rooms=rooms, rocks={str(k): v for k, v in sorted(rocks.items())}), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(f'quarry: {len(floors)} floors, {len(rooms)} special rooms, {len(rocks)} rock types')
