"""Join recipe conversation predicates to game-defined recipe and friendship flags."""
import json
import re
import struct
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

game=Path(r'E:\Games\SteamLibrary\steamapps\common\Village in the Shade')
archive=FafullfsArchive.open(game/'data.dat')
flags_table=read_table(archive.read_entry('data/database/gameflag.dat'))
flags={int.from_bytes(record[:8],'little'):strings for record,strings in zip(flags_table.records,_string_groups(flags_table),strict=True)}
table=read_table(archive.read_entry('data/database/charactertalk.dat'))
lessons=[]
for record,strings in zip(table.records,_string_groups(table),strict=True):
    if not any(re.fullmatch(r'recipe_talkStart[123]',value) for value in strings):
        continue
    # This bounded conversation family has one required and two excluded flags.
    assert struct.unpack_from('<I',record,32)[0]==1
    assert struct.unpack_from('<I',record,44)[0]==2
    required,recipe_flag,daily_flag=(struct.unpack_from('<Q',record,offset)[0] for offset in (36,48,56))
    match=re.search(r'_LOVE_LEVEL(\d+)$',flags[required][0])
    assert match and flags[recipe_flag][0].startswith('GAME_FLAG_COOKING_RECIPE_')
    assert flags[daily_flag][0].endswith('_GIVE_COOK_RECIPE')
    lessons.append(dict(character_numeric_id=struct.unpack_from('<Q',record,20)[0],recipe_unlock_flag=recipe_flag,friendship_level=int(match[1]),required_flag=required,excluded_flags=[recipe_flag,daily_flag],talk_numeric_id=struct.unpack_from('<Q',record,148)[0],script=strings[2],function=strings[3],source='charactertalk.dat + gameflag.dat'))
Path('data/sources/game-recipe-lessons.json').write_text(json.dumps(dict(lessons=lessons),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'recipe lessons: {len(lessons)}')
