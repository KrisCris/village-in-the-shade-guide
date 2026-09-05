"""Export native appearance variant membership; do not infer groups from names."""
import json
import struct
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

game=Path(r'E:\Games\SteamLibrary\steamapps\common\Village in the Shade')
archive=FafullfsArchive.open(game/'data.dat')
groups=[]
for table_name,offset in [('playercrothing',200),('playerheadaccessory',240)]:
    table=read_table(archive.read_entry(f'data/database/{table_name}.dat'))
    for record,strings in zip(table.records,_string_groups(table),strict=True):
        ids=[struct.unpack_from('<Q',record,offset+i*8)[0] for i in range(10)]
        ids=[value for value in ids if value]
        if not ids:
            continue
        flag=struct.unpack_from('<Q',record,offset+80)[0]
        groups.append(dict(id=strings[0],name_ja=strings[1],item_numeric_ids=ids,unlock_flag=flag,source=f'{table_name}.dat'))
Path('data/sources/game-appearance-groups.json').write_text(json.dumps(dict(groups=groups),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'appearance groups: {len(groups)}; variants: {sum(len(g["item_numeric_ids"]) for g in groups)}')
