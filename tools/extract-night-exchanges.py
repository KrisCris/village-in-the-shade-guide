"""Materialize three manually traced exchange branches, not string-only guesses."""
import hashlib
import json
import runpy
import struct
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.localization import build_name

reader=runpy.run_path('tools/inspect-lua54.py')['read_chunk']
archive=FafullfsArchive.open(Path('E:/Games/SteamLibrary/steamapps/common/Village in the Shade/data.dat'))
features=read_table(archive.read_entry('data/database/itemfeature.dat'))
feature_ids={g[0]:struct.unpack_from('<Q',r)[0] for r,g in zip(features.records,_string_groups(features),strict=True)}
creatures=read_table(archive.read_entry('data/database/creature.dat'))
names={g[0]:build_name(ja=g[1],zh_hant=g[5],internal=g[0],overrides={}).zh_hans for g in _string_groups(creatures)}
items=json.loads(Path('data/generated/build-24969282/entities/items.json').read_text(encoding='utf-8'))
exchanges=[]
for role,mode,feature_keys in [
    ('thunder_beast','对话选择一种',['ITEM_FEATURE_CROPS_SPRING']),
    ('tofu_boy','对话选择一种',[]),
    ('nekomata','随机一种',['ITEM_FEATURE_FISH','ITEM_FEATURE_SMALL_FISH']),
]:
    source=f'data/script/ai_creature_horror_{role}.lub'
    raw=archive.read_entry(source)
    proto=reader(raw)
    sensor,present=proto['children'][1],proto['children'][3]
    assert 'GameSubInventoryItem' in sensor['constants'] and 'DropItemCreate' in present['constants']
    assert all(key in sensor['constants'] for key in feature_keys)
    if mode=='随机一种': assert 'RandomRange' in present['constants']
    else: assert 'GAME_FLAG_POPUP_SELECT_1' in present['constants']
    accepted=[item['id'] for item in items if any(feature_ids[key] in item.get('feature_ids',[]) for key in feature_keys)] if feature_keys else ['ITEM_ID_TOFU']
    if not feature_keys: assert 'ITEM_ID_TOFU' in sensor['constants']
    rewards=[k for k in present['constants'] if isinstance(k,str) and k.startswith(('ITEM_ID_SPECIAL_JEWELS_','ITEM_ID_SPECIAL_MIRROR_','ITEM_ID_SPECIAL_SWORD'))]
    exchanges.append(dict(id=role,name=names[f'CREATURE_ID_HORROR_{role.upper()}'],input_item_ids=accepted,input_quantity=1,reward_item_ids=rewards,reward_mode=mode,condition='先交谈完成首次交换对话，再选中所需物品交付；该怪异须已出现',source=source,source_sha256=hashlib.sha256(raw).hexdigest(),functions={'sensorCheck':[sensor['start'],sensor['end']],'present':[present['start'],present['end']]}))
Path('data/sources/game-night-exchanges.json').write_text(json.dumps({'exchanges':exchanges},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print([(e['name'],len(e['input_item_ids']),len(e['reward_item_ids']),e['reward_mode']) for e in exchanges])
