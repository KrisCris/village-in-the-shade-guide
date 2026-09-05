"""Extract values for the manually traced kappa talk/reward control flow."""
import hashlib
import json
import runpy
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

archive=FafullfsArchive.open(Path('E:/Games/SteamLibrary/steamapps/common/Village in the Shade/data.dat'))
raw=archive.read_entry('data/script/ai_creature_horror_kappa.lub')
proto=runpy.run_path('tools/inspect-lua54.py')['read_chunk'](raw)['children'][2]
defines=read_table(archive.read_entry('data/database/gamedefine.dat'))
quantity=next(int(g[4]) for g in _string_groups(defines) if g[0]=='ENUM_KAPPA_CUCUMBER_NUM')
# Verified register flow: selected reward in R12, quantity in R13; DropItemCreate
# receives them as its item and final quantity arguments at instructions 175–182.
rewards=[]
for item_pc,quantity_pc,condition in [(153,154,'首次奖励；已解锁该服装时跳过'),(162,163,'服装之后的奖励阶段'),(169,170,'铜镜之后的奖励阶段；之后回到起始阶段')]:
    item_instruction=proto['code'][item_pc-1]
    quantity_instruction=proto['code'][quantity_pc-1]
    assert item_instruction&127 == 11  # GETTABUP
    assert quantity_instruction&127 == 1  # LOADI
    rewards.append(dict(item_id=proto['constants'][item_instruction>>24],quantity=(quantity_instruction>>15)-65535,condition=condition))
result=dict(input_item_id='ITEM_ID_CROPS_CUCUMBER',input_quantity=quantity,partial_delivery=True,rewards=rewards,
    condition='与河童交谈后分批交付，累计完成当轮剩余需求才发放该阶段奖励；不是同时取得三项奖励',
    source='ai_creature_horror_kappa.lub: talk lines 51–195; event_horror_item_trade.lub: event_reset_summer; gamedefine.dat: KAPPA_CUCUMBER_NUM',source_sha256=hashlib.sha256(raw).hexdigest())
Path('data/sources/game-kappa-exchange.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(result)
