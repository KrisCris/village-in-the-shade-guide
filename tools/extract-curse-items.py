"""Cursed-item sources and the HP/stamina cap rewards, traced by hand from event scripts and tables.

Re-trace when a script hash below changes.
- event_horror_abyss (オカミ淵): contactBegin returns until GAME_FLAG_HORROR_SUBEVENT_ABYSS_CARP_GET_INFORMATION
  is set (event_talk_secretary: pay 今野 1000). Throwing needs an item with ITEM_FEATURE_CURSE and adds 1 to
  GAME_VALUE_HORROR_ABYSS_ITEM_COUNT. When the count reaches NEED_COUNT[level] between 0:00 and 5:00 the
  ヌシ appears (event_clear); in daytime a full pool only shows a message. event_clear loops while
  count >= NEED_COUNT[level]: level <= 5 drops ヌシの鱗, level 6 teaches 雨の呼笛, later levels drop
  鯉提灯 赤 or 黒 at random (RandomRange 1–2). Each pass subtracts the need and raises the level, which
  GAME_VALUE_HORROR_ABYSS_LEVEL clamps to 1–7. PlayerAddHPMax gets the number of scales dropped.
- event_horror_inari_shrine (狐のお社): event_clear and event_clear_all each give 狐の油揚げ with
  PlayerAddSTGaugeMax(1). event_monthly_check clears the four GAME_FLAG_FOX_SHRINE_BUNDLE_GROUP flags
  while GAME_VALUE_HORROR_INARI_SHRINE_CLEAR_COUNT < 4. event_clear_all also gives 狛狐の置物 ×2.
- event_rankup rankUp_HP / rankUp_ST: PlayerAddHPMax(1) / PlayerAddSTGaugeMax(1), the あんしん暮し store path.
- event_horror_common: shipping or discarding an ITEM_FEATURE_CURSE crop (crops/flower/fruit category) or fish
  adds the item count to GAME_VALUE_HORROR_VEGETABLE/FISH_MONSTER_POP_COUNT; late-night start pops that many
  怪異野菜 / 怪異魚, and each one that appears subtracts 1 (ai_creature_horror_*_monster).
- gimmick_event_kirakira: a sparkle with no item set gives 泥の種 when Random(100) < 95, else 小型洒水器.
- ai_creature_horror_dorotabo: 泥田坊 plants CROPS_ID_OBJECT_MUD_SEEDS, whose harvest is 幽霊花の花瓶.
- placementitem.dat: per map, groups of {gimmick, required flag pairs, excluded flag pairs, count range,
  entries}. Each entry is {weight, item, weather list, required flag, excluded flag}.
"""
import hashlib
import json
import runpy
import struct
from pathlib import Path
from honogurashi_extractor.gamedir import game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

read_chunk=runpy.run_path('tools/inspect-lua54.py')['read_chunk']
data=FafullfsArchive.open(game_dir(__doc__)/'data.dat')
reviewed={
    'event_horror_abyss':'572f5f481444378cd7c3e928f59ea61c95e4efeb395df5bccc278b8aa640f6fa',
    'event_horror_inari_shrine':'f2e964d2eb56445addce1e861736e194eadf4857e994537d22086b649ca1f821',
    'event_rankup':'3434e0942eef24c77ce6398e136c0ed95f00fea64597e353ab4b0d3da745c1ae',
    'gimmick_event_kirakira':'df450c0ff8da33ca2ef30288d78846a2d72da840b0b49a644081a716f946767a',
    'event_horror_common':'87012d34303cd9e621f54b3caf1480be2acffe40cc8fd6df6d407d941dedd9c2',
    'ai_creature_horror_vegetable_monster':'605b2c00e94da8ab9e2b8147cf5c95dfa3439f6a53da25dadc4d9450e2882f94',
    'ai_creature_horror_fish_monster':'8ed1453024c390b585fb96e32de1c1ca786d2f6840aaa6f71bec57c47ed7d2c2',
    'ai_creature_horror_dorotabo':'50562b1557454516ccca0438c0d86acddac6864d4e5f078aca9f6ce47a551b98',
}
scripts={}
for name,digest in reviewed.items():
    raw=data.read_entry(f'data/script/{name}.lub')
    if hashlib.sha256(raw).hexdigest()!=digest:
        raise ValueError(f'{name} changed; re-trace it before extracting')
    scripts[name]=read_chunk(raw)

def table(name):
    t=read_table(data.read_entry(f'data/database/{name}.dat'))
    return list(zip(t.records,_string_groups(t),strict=True))
defines={g[1]:g[4] for _,g in table('gamedefine') if len(g)>4}
def define(key): return int(defines[key])
values={g[0]:struct.unpack_from('<11i',r) for r,g in table('gamevalue')}
items={it['numeric_id']:it['id'] for it in json.loads(Path('data/generated/build-25311578/entities/items.json').read_text(encoding='utf-8'))}
flags={struct.unpack_from('<I',r)[0]:g[0] for r,g in table('gameflag')}
weathers={1:'WEATHER_ID_SUNNY',2:'WEATHER_ID_RAIN',3:'WEATHER_ID_CLOUDY',4:'WEATHER_ID_SNOW',5:'WEATHER_ID_THUNDERSTORM',6:'WEATHER_ID_PEACH_BLOSSOMS'}
gimmicks={struct.unpack_from('<I',r)[0]:g[0] for r,g in table('gimmick')}
def consts(script,*path):
    proto=scripts[script]
    for i in path: proto=proto['children'][i]
    return proto['constants']
def code_ints(script,*path):
    """Immediate integer operands of LOADI in one function."""
    proto=scripts[script]
    for i in path: proto=proto['children'][i]
    return [(w>>15)-65535 for w in proto['code'] if w&127==1]

# オカミ淵
abyss_main=consts('event_horror_abyss')
levels=[k for k in abyss_main if isinstance(k,str) and k.startswith('ABYSS_NEED_COUNT_LV')]
assert levels==[f'ABYSS_NEED_COUNT_LV{i}' for i in range(1,8)]
contact,clear,talk=consts('event_horror_abyss',0),consts('event_horror_abyss',2),consts('event_horror_abyss',3)
assert contact[1]=='GAME_FLAG_HORROR_SUBEVENT_ABYSS_CARP_GET_INFORMATION' and 'ITEM_FEATURE_CURSE' in contact and 'over_daytime' in contact and 'complete_daytime' in contact
assert ['ITEM_ID_CURSED_HEART_SCALE','RandomRange','ITEM_ID_CURSE_FURNITURE_CARP_LANTERN_1','ITEM_ID_CURSE_FURNITURE_CARP_LANTERN_2']==[c for c in clear if c in ('ITEM_ID_CURSED_HEART_SCALE','RandomRange','ITEM_ID_CURSE_FURNITURE_CARP_LANTERN_1','ITEM_ID_CURSE_FURNITURE_CARP_LANTERN_2')][:4]
assert 'PlayerAddHPMax' in clear and 'GAME_FLAG_WHISTLE_SONG_LEARN_10' in clear
assert 1000 in talk and 'GameSetMoney' in talk and 'GAME_FLAG_HORROR_SUBEVENT_ABYSS_CARP_GET_INFORMATION' in talk
level_value=values['GAME_VALUE_HORROR_ABYSS_LEVEL']
assert level_value[8:11]==(1,1,7),level_value
need=[define(k) for k in levels]
rewards=[{'level':i+1,'need':n,'reward':'ITEM_ID_CURSED_HEART_SCALE' if i<5 else 'WHISTLE_SONG_10' if i==5 else 'CARP_LANTERN_RANDOM'} for i,n in enumerate(need)]

# 狐のお社
inari=scripts['event_horror_inari_shrine']
assert inari['constants'][24:26]==['event_clear','event_clear_all']
for i in (9,10):
    c=consts('event_horror_inari_shrine',i)
    assert 'ITEM_ID_CURSED_FOX_ABURAAGE' in c and 'PlayerAddSTGaugeMax' in c and 1 in code_ints('event_horror_inari_shrine',i)
clear_all=consts('event_horror_inari_shrine',10)
assert 'ITEM_ID_CURSE_FURNITURE_GUARDIAN_FOX' in clear_all and 'EventEndInariBundle' in clear_all and 'GameSetMoney' in clear_all
assert 2 in code_ints('event_horror_inari_shrine',10)
monthly=consts('event_horror_inari_shrine',1)
assert [c for c in monthly if isinstance(c,str) and c.startswith('GAME_FLAG_FOX_SHRINE_BUNDLE_GROUP_')]==[f'GAME_FLAG_FOX_SHRINE_BUNDLE_GROUP_0{i}' for i in range(1,5)]

# あんしん暮し store path
rank=scripts['event_rankup']
assert rank['constants'][9:11]==['rankUp_HP','rankUp_ST']
assert 'PlayerAddHPMax' in consts('event_rankup',9) and 1 in code_ints('event_rankup',9)
assert 'PlayerAddSTGaugeMax' in consts('event_rankup',10) and 1 in code_ints('event_rankup',10)

# Shipping or discarding cursed crops and fish.
common=scripts['event_horror_common']
assert consts('event_horror_common',1)[3:]==['ITEM_FEATURE_CURSE','ItemGetCategoryByID','ITEM_CATEGORY_CROPS','ITEM_CATEGORY_FLOWER','ITEM_CATEGORY_FRUIT']
assert consts('event_horror_common',3)[1]=='GAME_VALUE_HORROR_VEGETABLE_MONSTER_POP_COUNT' and consts('event_horror_common',4)[1]=='GAME_VALUE_HORROR_FISH_MONSTER_POP_COUNT'
for name,key in (('vegetable','VEGETABLE'),('fish','FISH')):
    c=consts(f'ai_creature_horror_{name}_monster',0)
    assert c[1]==f'GAME_VALUE_HORROR_{key}_MONSTER_POP_COUNT' and -1 in code_ints(f'ai_creature_horror_{name}_monster',0)

# A sparkle without a set item.
kira=consts('gimmick_event_kirakira',3)
assert kira[20:23]==['Random','ITEM_ID_CROPS_MUD_SEEDS','ITEM_ID_GIMMICK_SPRINKLER_SMALL'] and 100 in code_ints('gimmick_event_kirakira',3)
assert 'CROPS_ID_OBJECT_MUD_SEEDS' in consts('ai_creature_horror_dorotabo',1)
harvest={g[0]:struct.unpack_from('<i',r,96)[0] for r,g in table('cropsharvest') if len(r)>=100}
assert items[harvest['泥の種(オブジェクト)']]=='ITEM_ID_CURSE_FURNITURE_GHOST_FLOWER_VASE'

# Night pickup pools.
def flag_pairs(ints,pos):
    n=ints[pos]; pairs=[ints[pos+1+2*i] for i in range(n)]
    assert all(ints[pos+2+2*i]==0 for i in range(n))
    return [flags[f] for f in pairs],pos+1+2*n
pools=[]
for record,groups in table('placementitem'):
    ints=list(struct.unpack_from(f'<{len(record)//4}i',record))
    pos,out=8,[]
    for _ in range(ints[7]):
        gimmick,zero,index,unknown=ints[pos:pos+4]
        assert zero==0 and index==len(out) and unknown==0
        required,pos=flag_pairs(ints,pos+4)
        excluded,pos=flag_pairs(ints,pos)
        low,high,count=ints[pos:pos+3]; pos+=3
        entries=[]
        for _ in range(count):
            weight,item,zero=ints[pos:pos+3]; n=ints[pos+5]
            weather=[weathers[w] for w in ints[pos+6:pos+6+n]]
            req,z1,exc,z2,end=ints[pos+6+n:pos+11+n]
            assert zero==z1==z2==0 and end==-1
            entries.append(dict(item=items[item],weight=weight,weather=weather,required_flag=flags.get(req),excluded_flag=flags.get(exc)))
            pos+=11+n
        out.append(dict(gimmick=gimmicks[gimmick],required_flags=required,excluded_flags=excluded,count=[low,high],entries=entries))
    assert len(ints)-pos<=4 or not any(ints[pos:]),groups[0]  # ID_100 ends with one unexplained value (120)
    pools.append(dict(id=groups[0],groups=out))

out=dict(
    source='event scripts '+', '.join(f'{k}.lub' for k in reviewed)+' + gamedefine.dat, gamevalue.dat, cropsharvest.dat, placementitem.dat',
    script_sha256=reviewed,
    caps=dict(
        hp=dict(initial=define('PLAYER_STATUS_HP_INITIAL_VALUE'),max=define('PLAYER_STATUS_HP_MAX_VALUE'),per_heart=define('PLAYER_STATUS_HP_HEART_MAX'),hearts=define('PLAYER_STATUS_HP_HEART_COUNT')),
        stamina=dict(initial=define('PLAYER_STATUS_ST_INITIAL_VALUE'),max=define('PLAYER_STATUS_ST_MAX_VALUE'),per_gauge=define('PLAYER_STATUS_ST_GAUGE_MAX'),gauges=define('PLAYER_STATUS_ST_GAUGE_COUNT')),
    ),
    abyss=dict(info_cost=1000,night_hours=[0,5],levels=rewards,level_range=[level_value[9],level_value[10]]),
    inari=dict(clears=4,stamina_gauges_per_clear=1,final_guardian_fox=2),
    curse_monsters=dict(curse_feature='ITEM_FEATURE_CURSE',leave_hour=5),
    unset_sparkle=dict(mud_seeds_percent=95,other='ITEM_ID_GIMMICK_SPRINKLER_SMALL'),
    dorotabo_harvest='ITEM_ID_CURSE_FURNITURE_GHOST_FLOWER_VASE',
    pickup_pools=pools,
)
Path('data/sources/game-curse-items.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print([(p['id'],[(g['gimmick'],g['count'],len(g['entries'])) for g in p['groups']]) for p in pools])
