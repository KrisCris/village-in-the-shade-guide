"""Join lostbook.dat's anchor index to named YMWR map anchors."""
import json
import re
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.texture import decode_nltx_image

game = Path(r'E:\Games\SteamLibrary\steamapps\common\Village in the Shade')
archive = FafullfsArchive.open(game / 'data.dat')
maps = FafullfsArchive.open(game / 'data/map_1_00.dat')
textures = FafullfsArchive.open(game / 'data/texture_1_00.dat')
image_dir = Path('public/maps')
image_dir.mkdir(parents=True, exist_ok=True)
for name in ('minimap_01_spr_tc', 'minimap_11_spr_tc'):
    image = decode_nltx_image(textures.read_entry(f'data/texture/{name}.nltx'))
    image.save(image_dir / f'{name}.webp', lossless=True)

flags = read_table(archive.read_entry('data/database/gameflag.dat'))
flag_names = {struct.unpack_from('<I',r)[0]: g[0] for r,g in zip(flags.records,_string_groups(flags))}

def progress_label(flag):
    name = flag_names.get(flag, '')
    story = re.fullmatch(r'GAME_FLAG_STORY_(\d+)_(START|END)', name)
    if story:
        return f'第{int(story[1])}章' + ('开始' if story[2]=='START' else '结束')
    event = {20301:'手之目',20601:'不倒翁跌倒了',20700:'斗笠妖怪',20801:'煤灰精灵',20901:'面具',21201:'夜间草原',21251:'雪女',21301:'风神雷神'}.get(flag)
    return f'怪异事件开始：{event}' if event else ('无表内前置标记' if not flag else name)
table = read_table(archive.read_entry('data/database/lostbook.dat'))
books = {}
for record, group in zip(table.records, _string_groups(table)):
    index = struct.unpack_from('<I', record, len(record)-20)[0]
    flag = struct.unpack_from('<I',record,len(record)-36)[0]
    books[index] = dict(id=group[0], name=group[5], item_numeric_id=struct.unpack_from('<I',record,len(record)-52)[0], prerequisite_flag=flag, progress_label=progress_label(flag))
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
        if match[1] == b'pop_lost_book' and book is None:
            raise ValueError(f'Unmatched book anchor: {match[0]!r}')
        markers.append(dict(anchor=match[0][:-1].decode(),map=entry.name,x=x,y=y,kind='book' if book else 'shrine',**(book or {})))
output = Path('data/sources/game-map-markers.json')
output.write_text(json.dumps(dict(source='lostbook.dat + named anchors in map_1_00.dat YMWR heads',markers=markers),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'map markers: {len(markers)}; books: {sum(m["kind"]=="book" for m in markers)}')
