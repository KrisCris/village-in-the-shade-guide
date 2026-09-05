"""Join treasure recipe documents through their native acquisition popup targets."""
import json
import struct
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

archive=FafullfsArchive.open(Path('E:/Games/SteamLibrary/steamapps/common/Village in the Shade/data.dat'))
items={i['numeric_id']:i for i in json.loads(Path('data/generated/build-24969282/entities/items.json').read_text(encoding='utf-8'))}
popups=read_table(archive.read_entry('data/database/intangeble.dat'))
popups={struct.unpack_from('<Q',r)[0]:(r,g) for r,g in zip(popups.records,_string_groups(popups),strict=True)}
treasures=read_table(archive.read_entry('data/database/treasurebox.dat'))
documents=[]
for r in treasures.records:
    popup=popups.get(struct.unpack_from('<Q',r,16)[0])
    if not popup or not popup[1][0].startswith('INTANGEBLE_ID_CRAFT_RECIPE_'): continue
    document=items[struct.unpack_from('<Q',r,8)[0]]
    target=items[struct.unpack_from('<Q',popup[0],84)[0]]
    documents.append(dict(document_item_id=document['id'],target_item_id=target['id'],popup_id=popup[1][0],source='treasurebox.dat:8,16 → intangeble.dat:84'))
Path('data/sources/game-recipe-documents.json').write_text(json.dumps(dict(documents=documents),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('linked recipe documents:',len(documents))
