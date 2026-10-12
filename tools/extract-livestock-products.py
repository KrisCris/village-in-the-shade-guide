"""Extract native livestock production candidates and juvenile/adult links.

No per-drop quantity or probability is asserted: those also depend on runtime
production state. Zero item IDs (e.g. rooster's empty result) are retained only
in the raw evidence, not represented as an obtainable item.
"""
import argparse
import json
import struct
from pathlib import Path
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.icons import _find_texture_archive, _table_string, icon_bounds
from honogurashi_extractor.texture import decode_nltx_image

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--image-dir',type=Path,default=Path('public/icons/generated/livestock'))
add_game_dir(parser)
args=parser.parse_args()
archive=FafullfsArchive.open(args.game_dir/'data.dat')
table=read_table(archive.read_entry('data/database/livestock.dat'))
u32=lambda r,o:struct.unpack_from('<I',r,o)[0]
u64=lambda r,o:struct.unpack_from('<Q',r,o)[0]
rows=list(zip(table.records,_string_groups(table),strict=True))
animals={u64(r,0):g[0] for r,g in rows}
items={i['numeric_id']:i['id'] for i in json.loads(Path('data/generated/build-25311578/entities/items.json').read_text(encoding='utf-8'))}
result=[]
icon_table=read_table(archive.read_entry('data/database/icon.dat'))
texture_table=read_table(archive.read_entry('data/database/texture.dat'))
icons={u32(r,0):r for r in icon_table.records}
textures={u32(r,0):r for r in texture_table.records}
for r,g in rows:
    cursor=104+8*u32(r,100)
    count=u32(r,cursor+8)
    assert cursor+12+16*count <= len(r)
    raw=[dict(item_numeric_id=u64(r,cursor+12+16*i),weight=u32(r,cursor+20+16*i)) for i in range(count)]
    assert all(not x['item_numeric_id'] or x['item_numeric_id'] in items for x in raw)
    adult=u64(r,76)
    assert not adult or adult in animals
    variants_offset=cursor+12+16*count+100
    variants=[u64(r,variants_offset+8*i) for i in range(3)]
    assert all(not variant or variant in items for variant in variants)
    icon_id=u64(r,cursor+12+16*count+44)
    icon_path=None
    if icon_id and not any(variants):
        icon=icons[icon_id]
        texture_path=_table_string(texture_table,textures[u32(icon,24)],24)
        texture_archive=_find_texture_archive(archive.path.parent,{texture_path})
        atlas=decode_nltx_image(texture_archive.read_entry(texture_path))
        x,y,w,h=icon_bounds(icon)
        assert x+w<=atlas.width and y+h<=atlas.height
        output=args.image_dir/f'{g[0]}.webp'
        output.parent.mkdir(parents=True,exist_ok=True)
        atlas.crop((x,y,x+w,y+h)).save(output,'WEBP',lossless=True)
        icon_path=f'/icons/generated/livestock/{g[0]}.webp'
    result.append(dict(livestock_id=g[0],adult_id=animals.get(adult),icon_id=icon_id,icon_path=icon_path,variant_item_ids=[items[v] for v in variants if v],product_item_ids=[items[x['item_numeric_id']] for x in raw if x['item_numeric_id']],raw_candidates=raw,source=f'livestock.dat:{u64(r,0)}; adult_id@76; production array@{cursor+8}; variant items@{variants_offset}'))
Path('data/sources/game-livestock-products.json').write_text(json.dumps(dict(animals=result),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('animals:',len(result),'productive adults:',sum(bool(r['product_item_ids']) for r in result))
