"""Export fish spawn weights per spot, season and time period from fishing.dat.

Each fishing.dat record is one spot: word 10 (offset 40) holds the spawn count,
followed by 36-byte rows of item id, float32 weight at +8, season at +16 and a
time-range string reference at +24/+28. The catch is drawn from the rows for
the current spot, season and period in proportion to their weights.
"""
import json
import struct
from pathlib import Path
from honogurashi_extractor.gamedir import game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

archive = FafullfsArchive.open(game_dir(__doc__) / 'data.dat')
items = {item['numeric_id']: item['id'] for item in json.loads(Path('data/generated/build-25311578/entities/items.json').read_text(encoding='utf-8')) if item.get('numeric_id')}
seasons = ('spring', 'summer', 'autumn', 'winter')
periods = {'7:00-12:00': 'morning', '12:00-18:00': 'day', '18:00-0:00': 'evening', '0:00-6:00': 'late-night'}

fishing = read_table(archive.read_entry('data/database/fishing.dat'))
spots, spawns = [], []
for record, group in zip(fishing.records, _string_groups(fishing), strict=True):
    count = struct.unpack_from('<I', record, 40)[0]
    if not count:
        continue
    spots.append(group[0])
    for index in range(count):
        offset = 44 + index * 36
        item, = struct.unpack_from('<I', record, offset)
        weight, = struct.unpack_from('<f', record, offset + 8)
        season, = struct.unpack_from('<I', record, offset + 16)
        start, length = struct.unpack_from('<II', record, offset + 24)
        time_range = fishing.string_pool[start:start + length].decode('utf-8').rstrip('\0')
        if item not in items or season >= 4 or time_range not in periods or weight <= 0:
            raise SystemExit(f'unexpected spawn in {group[0]}: {item} {season} {time_range} {weight}')
        spawns.append(dict(spot=group[0], season=seasons[season], period=periods[time_range], item=items[item], weight=weight))

Path('data/sources/game-fishing.json').write_text(json.dumps(dict(
    source='fishing.dat (build 25311578)', spots=spots, spawns=spawns), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(f'fishing: {len(spots)} spots, {len(spawns)} spawn rows')
