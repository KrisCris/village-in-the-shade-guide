"""Join lostbook.dat's anchor index to named YMWR map anchors."""
import json
import re
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

game = Path(r'E:\Games\SteamLibrary\steamapps\common\Village in the Shade')
archive = FafullfsArchive.open(game / 'data.dat')
maps = FafullfsArchive.open(game / 'data/map_1_00.dat')
table = read_table(archive.read_entry('data/database/lostbook.dat'))
books = {}
for record, group in zip(table.records, _string_groups(table)):
    index = struct.unpack_from('<I', record, len(record)-20)[0]
    books[index] = dict(id=group[0], name=group[5], item_numeric_id=struct.unpack_from('<I',record,len(record)-52)[0], prerequisite_flag=struct.unpack_from('<I',record,len(record)-36)[0])
markers = []
for entry in maps.entries():
    if not entry.name.endswith('.head') or any(s in entry.name for s in ['_sum','_aut','_win']):
        continue
    blob = maps.read_entry(entry.name)
    if blob.startswith(b'YKCMP_V1'):
        blob = zlib.decompress(blob[20:])
    for match in re.finditer(rb'(pop_lost_book|pop_inari_shrine)(\d+)\x00',blob):
        index = int(match[2])
        x,y = struct.unpack_from('<ii',blob,match.start()+32)
        book = books.get(index) if match[1] == b'pop_lost_book' else None
        markers.append(dict(anchor=match[0][:-1].decode(),map=entry.name,x=x,y=y,kind='book' if book else 'shrine',**(book or {})))
output = Path('data/sources/game-map-markers.json')
output.write_text(json.dumps(dict(source='lostbook.dat + named anchors in map_1_00.dat YMWR heads',markers=markers),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'map markers: {len(markers)}; books: {sum(m["kind"]=="book" for m in markers)}')
