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

Native code in village.exe (hash below), re-trace when it changes:
- 0x14024B460 (planting): a seed item with +0x184 set (泥の種) stores a uniform random pick among crops with
  type 0, exactly one planting season equal to the current one, the tile's farmland in their soil list, a
  preferred soil other than the paddy (3), and no CROPS_FEATURE_GIANT_CROPS.
- 0x1402B3F74: the grown mud seed is replaced by that pick, which is marked as mud-grown (+0x72).
- 0x1402B412A-0x1402B4288 (daily growth): when a mud-grown crop enters the first stage whose form field (+0x98)
  is set, a crop whose stage names a giant (+0xA8) becomes it if 0x1401E3D90 finds the 24 surrounding tiles of
  the 5x5 square clear (farmable ground, no object, no type 2/6 crop, no CROPS_FEATURE_GIANT_NOT_REMOVE_CROPS);
  0x1401E37D0 then removes the crops within 2 tiles. A failed check unmarks the crop, which stays ordinary.
  Without a giant the crop takes that form (CROPS_FORM_DISASTER). Nothing here is random.
- 0x1402B3BAC (season change): a mature mud-grown crop 34 (枝豆) takes CROPS_FORM_DISASTER instead of
  CROPS_FORM_WITHERED_HARVESTABLE.
- 0x14021AC00-0x14021B2C0 (catch roll): each fishing.dat row weighs int(weight*100). While bait is active,
  GAME_VALUE_GIMMICK_BAIT_TYPE holds its gimmick: 撒き餌 halves trash (fish.dat kind 0), 良質な撒き餌 halves
  trash and multiplies fish (kind 1) by 1.2, 白い撒き餌 gives white fish (kind 2) 3/97 of the running total.
  Without bait white fish get 1/99 of it. 怪異魚 (kind 3) keep their weight.
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
game=game_dir(__doc__)
exe_hash=hashlib.sha256((game/'village.exe').read_bytes()).hexdigest()
assert exe_hash=='ac7d955baa915929b185df85cfa13f7e81ad57a9c68f308da769739775869a05', 'Unreviewed executable build'
data=FafullfsArchive.open(game/'data.dat')
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
item_rows=json.loads(Path('data/generated/build-25311578/entities/items.json').read_text(encoding='utf-8'))
items={it['numeric_id']:it['id'] for it in item_rows}
cursed_items={it['id'] for it in item_rows if 10 in (it.get('feature_ids') or [])}
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

# What a mud seed grows into (see the native notes above).
u32=lambda r,o:struct.unpack_from('<I',r,o)[0]
i64=lambda r,o:struct.unpack_from('<q',r,o)[0]
def ids(name): return {g[0]:u32(r,0) for r,g in table(name)}
crop_feature,crop_form,soil=ids('cropsfeature'),ids('cropsform'),ids('farmland')
assert (crop_feature['CROPS_FEATURE_GIANT_CROPS'],crop_form['CROPS_FORM_DISASTER'],crop_form['CROPS_FORM_WITHERED_HARVESTABLE'])==(19,3,9)
assert (soil['FARMLAND_PLOWED'],soil['FARMLAND_FURROW'],soil['FARMLAND_RICEFIELD'])==(1,2,3)
assert read_table(data.read_entry('data/database/crops.dat')).language_count==6
def crop_record(r):
    """type, three season lists, soil list, preferred soil, a word, features, 80 fixed bytes, growth states."""
    c=84;kind=u32(r,80);lists=[]
    for _ in range(3):
        n=u32(r,c);lists.append([u32(r,c+4+4*i) for i in range(n)]);c+=4+4*n
    n=u32(r,c);soils=[i64(r,c+4+8*i) for i in range(n)];c+=4+8*n
    preferred=i64(r,c);c+=12
    n=u32(r,c);features=[i64(r,c+4+8*i) for i in range(n)];c+=4+8*n
    master=i64(r,c);c+=80
    states={}
    count=u32(r,c);c+=4
    for _ in range(count):
        state,n=u32(r,c),u32(r,c+4);c+=8
        states[state]=[(u32(r,c+k*272+0x98),i64(r,c+k*272+0xA8)) for k in range(n)];c+=n*272
    assert c<=len(r)
    return dict(kind=kind,plant=lists[1],soils=soils,preferred=preferred,features=features,master=master,states=states)
crop_rows={g[0]:(i64(r,0),crop_record(r)) for r,g in table('crops')}
crop_names={number:name for name,(number,_) in crop_rows.items()}
def drops(r):
    out=[];c=20
    for _ in range(u32(r,16)):
        state,n=u32(r,c),u32(r,c+4);c+=8
        for _ in range(n):
            m=u32(r,c+4);c+=8
            for _ in range(m):
                out.append(dict(state=state,item=items.get(u32(r,c)),action=u32(r,c+8),low=u32(r,c+20),high=u32(r,c+24),chance=u32(r,c+28)));c+=44
    return out
harvest_records={u32(r,0):r for r,g in table("cropsharvest")}
harvest=lambda number:drops(harvest_records[number])
actions={u32(r,0):g[0] for r,g in table('action')}
mud_crop=crop_rows['CROPS_ID_MUD_SEEDS'][1]
assert mud_crop['soils']==[1,2]
seasons=('spring','summer','autumn','winter')
mud_pool={season:[] for season in seasons}
giants={}
for name,(number,c) in crop_rows.items():
    if not (c['kind']==0 and len(c['plant'])==1 and c['preferred']!=3 and 19 not in c['features'] and c['master']):
        continue
    assert c['soils']==[1,2],name  # every candidate takes plowed fields and ridges alike
    form,giant=next(((f,g) for f,g in c['states'][1] if f),(0,0))
    entry=dict(crop=name,ridge=c['preferred']==2)
    if giant:
        assert form==3
        rows=harvest(giant)
        assert {(r['low'],r['high'],r['chance']) for r in rows}=={(5,10,100)}
        cursed=sorted({r['item'] for r in rows if r['item'] in cursed_items});normal=sorted({r['item'] for r in rows if r['item'] not in cursed_items})
        assert len(cursed)==len(normal)==1
        entry.update(outcome='giant',giant=crop_names[giant],item=cursed[0])
        giants[crop_names[giant]]=dict(cursed=cursed[0],normal=normal[0],quantity=[5,10],actions=sorted({actions[r['action']] for r in rows}))
    elif form==3 or number==34:
        assert number!=34 or (name=='CROPS_ID_EDAMAME' and form==0)
        cursed=[r for r in harvest(number) if r['state']==3]
        assert len({r['item'] for r in cursed})==1 and cursed[0]['item'] in cursed_items and {(r['low'],r['high']) for r in cursed}=={(1,1)}
        entry.update(outcome='season_end' if number==34 else 'cursed',item=cursed[0]['item'])
    else:
        assert form==0,name
        entry.update(outcome='none')
    mud_pool[seasons[c['plant'][0]]].append(entry)
assert sum(e['outcome'] in ('cursed','giant','season_end') for p in mud_pool.values() for e in p)==18

# Bait in the catch roll (see the native notes above).
fish_kind={items[u32(r,0)]:u32(r,16) for r in read_table(data.read_entry('data/database/fish.dat')).records}
assert {k for i,k in fish_kind.items() if i.startswith('ITEM_ID_FISHING_GHOST_FISH_')}=={3} and {k for i,k in fish_kind.items() if i.startswith('ITEM_ID_TRASH_')}=={0}
bait_gimmick={items[u32(r,0)]:gimmicks[u32(r,404)] for r,g in table('item') if g[0].startswith('ITEM_ID_SPRINKLING_BAIT')}
assert bait_gimmick=={'ITEM_ID_SPRINKLING_BAIT':'GIMMICK_ID_SPRINKLING_BAIT','ITEM_ID_SPRINKLING_BAIT_HIGH_GRADE':'GIMMICK_ID_SPRINKLING_BAIT_GOOD','ITEM_ID_SPRINKLING_BAIT_WHITE':'GIMMICK_ID_SPRINKLING_BAIT_WHITE'}

out=dict(
    source='event scripts '+', '.join(f'{k}.lub' for k in reviewed)+' + gamedefine.dat, gamevalue.dat, crops.dat, cropsharvest.dat, fish.dat, placementitem.dat + village.exe',
    script_sha256=reviewed,
    executable_sha256=exe_hash,
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
    mud_pool=mud_pool,
    giants=giants,
    cursed_pull=dict(frames=define('HORROR_MULFORM_HARVEST_TIME'),interval=define('HORROR_MULFORM_HARVEST_DAMAGE_INTERVAL'),damage=define('HORROR_MULFORM_HARVEST_DAMAGE_VALUE'),per_heart=100),
    fish_kind=fish_kind,
    bait=dict(gimmicks=bait_gimmick,trash_multiplier={'ITEM_ID_SPRINKLING_BAIT':0.5,'ITEM_ID_SPRINKLING_BAIT_HIGH_GRADE':0.5,'ITEM_ID_SPRINKLING_BAIT_WHITE':1}),
)
Path('data/sources/game-curse-items.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print([(p['id'],[(g['gimmick'],g['count'],len(g['entries'])) for g in p['groups']]) for p in pools])
