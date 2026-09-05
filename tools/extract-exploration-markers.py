"""Join creature spawn anchor prefixes to the overworld's named anchors."""
import json
import re
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

game=Path('E:/Games/SteamLibrary/steamapps/common/Village in the Shade')
data=FafullfsArchive.open(game/'data.dat')
maps=FafullfsArchive.open(game/'data/map_1_00.dat')
creatures=read_table(data.read_entry('data/database/creature.dat'))
groups=list(_string_groups(creatures))
assert any(g[0]=='CREATURE_ID_HORROR_TREASURE_BOX' and 'pop_treasureBox' in g for g in groups)
assert any(g[0]=='CREATURE_ID_HORROR_TOFU_BOY' and 'pop_exchangeCreature' in g for g in groups)
map_name='data/map/map_0000_spr.ymwr.head'
blob=maps.read_entry(map_name)
if blob.startswith(b'YKCMP_V1'): blob=zlib.decompress(blob[20:])
markers=[]
for match in re.finditer(rb'(pop_treasureBox|pop_exchangeCreature)(\d+)\x00',blob):
    x,y=struct.unpack_from('<ii',blob,match.start()+32)
    kind='treasure' if match[1]==b'pop_treasureBox' else 'exchange'
    markers.append(dict(anchor=match[0][:-1].decode(),map=map_name,x=x,y=y,kind=kind,label=f'玉手箱 {int(match[2])+1}' if kind=='treasure' else '交换怪异生成点'))
assert len(markers)==9 and len({m['anchor'] for m in markers})==9
Path('data/sources/game-exploration-markers.json').write_text(json.dumps(dict(source='creature.dat spawn anchor prefixes + map_0000_spr.ymwr.head',markers=markers),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('exploration markers:',len(markers))
