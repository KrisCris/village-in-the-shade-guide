"""Read-only save-map terrain catalog. Shares the verified YMWR layout with extract-farmland.py."""
import argparse
import re
import json
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--game-dir', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path('data/sources/game-save-map.json'))
args = parser.parse_args()
game = args.game_dir
data = FafullfsArchive.open(game / 'data.dat')
maps = FafullfsArchive.open(game / 'data/map_1_00.dat')
u32 = lambda b, o: struct.unpack_from('<I', b, o)[0]
u64 = lambda b, o: struct.unpack_from('<Q', b, o)[0]
table = lambda name: read_table(data.read_entry('data/database/' + name + '.dat'))
origins = {}
for row in table('mapgroup').records:
    if u64(row, 0) != 1:
        continue
    for i in range(u32(row, 32)):
        o = 36 + i * 16
        origins[u64(row, o)] = [u32(row, o + 8), u32(row, o + 12)]
scenes = []
for row, strings in zip(table('map').records, _string_groups(table('map')), strict=True):
    mid = u64(row, 0)
    if mid not in origins:
        continue
    if not any(k in strings[0] for k in ['OPENWORLD', 'MYHOUSE', 'GREENHOUSE', 'LIVESTOCK_HOUSE', 'AVIARY']):
        continue
    path = strings[2] + '.head'
    try:
        blob = maps.read_entry(path)
    except KeyError:
        continue
    if blob.startswith(b'YKCMP_V1'):
        blob = zlib.decompress(blob[20:])
    header = struct.unpack_from('<19I', blob)
    assert header[4:6] == (0, 0)
    start = 76 + header[3] * 72
    assert start + header[12] * 112 <= len(blob)
    cells = {}
    for i in range(header[12]):
        offset = start + i * 112
        x, y = struct.unpack_from('<ii', blob, offset)
        for index, (dx, dy) in enumerate(((1, 0), (0, 1), (2, 1), (1, 2))):
            mask = u64(blob, offset + 48 + index * 8)
            X, Y = 2 * x + dx, 2 * y + dy
            key = (X, Y)
            # Keep the intersection on seams: never manufacture placement permission.
            cells[key] = cells.get(key, mask) & mask
    usable = [[x, y, m & 199, (m >> 36) & 7] for (x, y), m in sorted(cells.items()) if m & 71]
    if usable:
        scenes.append(dict(id=mid, code=strings[0], label=strings[1], origin=origins[mid], cells=usable))
items = {i['numeric_id']: i for i in json.loads(Path('data/generated/build-24969282/entities/items.json').read_text(encoding='utf-8'))}
placements = json.loads(Path('data/sources/game-save-placements.json').read_text(encoding='utf-8'))['placements']
objects = []
for row, strings in zip(table('gimmick').records, _string_groups(table('gimmick')), strict=True):
    item = items.get(u32(row, len(row) - 48))
    building = bool(re.match(r'GIMMICK_ID_ARCHITECTURE_(LIVESTOCK_HOUSE|AVIARY)', strings[0]))
    if item or building:
        map_id = int(strings[strings.index('mapID') + 1]) if building and 'mapID' in strings else 0
        place = next((p for p in placements if p['mapId'] == map_id), {})
        family = re.sub(r'_0[1-4](?=_MIRROR$|$)', '_SLOT', strings[0]) if building else strings[0]
        objects.append(dict(id=u64(row, 0), itemId=item['numeric_id'] if item else 0, name=item['name']['zh_hans'] if item else ('禽舍' if 'AVIARY' in strings[0] else '畜舍') + strings[0].split('ARCHITECTURE_')[1].replace('LIVESTOCK_HOUSE','').replace('AVIARY',''), code=strings[0], family=family, building=building, mapId=map_id, requires=place.get('requires',[]), excludes=place.get('excludes',[]), floor='FLOOR' in strings[0] or 'CARPET' in strings[0]))
args.output.write_text(json.dumps(dict(source='YMWR masks bits 0/1/2/6; mapgroup origins; map.dat; gimmick item at end-48', scenes=scenes, objects=objects), ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{len(scenes)} scenes, {len(objects)} object definitions')
