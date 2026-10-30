"""Extract late-night anomaly (怪異) conditions, triggers and reward cycles.

Traced by hand from the scripts below (hashes in `reviewed`); re-trace when a hash changes.
- event_check_late_night.awakeLateNight_check: every Monday the week's late-night budget is
  RandomRange(3, 4) with a 1–2 day interval; a thunderstorm, day 1, day 15 or an unused item
  on the お化け棚 (GIMMICK_ID_SHINTO_ALTAR) forces a late night; the eve of a festival never
  has one; GAME_FLAG_LATE_NIGHT_START_OFF (set by 清めの塩 on the shelf) cancels the next one.
- gimmick_shinto_altar: maps each 木札 to the forced flag of one late-night event.
- Each event script's clear function drops one reward per clear and advances a reward
  counter (gamevalue.dat holds the counter maximum; the cycle then restarts).
- event_horror_unknown_livestocs: the barn ghost cow is a separate, non-late-night event.
- night_events: the smaller night events outside the late-night rotation (petopeto, giant
  rabbit, phone booth, Japanese doll, dorotabo, cursed produce, the abyss pool lord).
latenightevent.dat supplies per-event conditions; event.dat supplies the start events'
required and excluded flags; gimmick.dat supplies the monument hit counts. map_points reads
anchors and placed gimmicks from the village map heads (identical across seasons) in game
coordinates; the page projects them with the minimap projection.
"""
import hashlib
import json
import re
import runpy
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.gamedir import game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

ns=runpy.run_path('tools/inspect-lua54.py')
read_chunk,OPS=ns['read_chunk'],ns['OPS']
data=FafullfsArchive.open(game_dir(__doc__)/'data.dat')
reviewed={
    'event_check_late_night':'376eb632105911c4bde30ad9bb728e5e3acaa6260ba70b5fa87e656653cc22a2',
    'gimmick_shinto_altar':'2e5594a5e4b313e109d9e9766a13b39d51148ecd1a451214466950e6a88e3ebf',
    'gimmick_event_black_daruma':'69286045c8a396852fb5a17dd9951083ad0dbc17ae4e4011a3c9526d2e2468e4',
    'event_horror_statue_game':'9e77707ce0852f312a24c4e1e32d188a42e7d6570646fa4bfa83050e29ab651e',
    'event_horror_eye_of_hand':'4192f7f6143eb887df97b0fbff177ba6d7cb554e8c96564bb47218c67ba13949',
    'event_horror_soot_sprite':'d87ab5d936d9e9b21d00e7756e54664b748e8b7ecf0577c31d31199e39a3fc5a',
    'event_horror_grass':'2cd7ccd8be4c870bd64b1ffc20505948268a78e69f5e0a6c8c8da16cdb53270b',
    'event_horror_mask':'90a184b52bfdff9601bcbb1ada828506ee94375fa6cc5c59d90cf23dd6bd5cd2',
    'event_horror_demon':'d44bba0759db4013ed959235c6563f0d90c413df6c8984fbda16b972e823024f',
    'event_horror_hat_ghost':'fdd69160f321a5580ddcf6bb310b20091a3eacaab5d5ab0ccdac3625002f251b',
    'event_horror_fujin_raijin':'5fd88804116ee8e2239d2ed35b5788b2ce13d617bcc701dfae230c14506da28e',
    'event_horror_snow_woman':'cfd05957dd7859e74feb008aafd05d34e08feb4ee15f7c912ccab22e69c7fcbb',
    'event_horror_unknown_livestocs':'b4800dcceec164f4ca9f911ece3809559478695ab7104957f63384c021ee7838',
    # Map positions and the smaller night events (map_points / night_events below).
    'event_horror_petopeto':'5982eba8e8f074463594c23b608bed5a443475cd03aee336a14b6ccaf264deeb',
    'ai_creature_horror_petopeto':'9c57700a6f4c32bd26304ee5f35eb100b8e1b8258a182acb6affedc1d65a7896',
    'event_horror_mountain_monster':'f8a397df28449af07f8aaf50d1006cdcc6786ba572b4a5d33aec27309602cd89',
    'event_horror_phone_booth':'08a6212e2f7464310a21e06df92451263dff0f79747eb591c9cb87bfb2f5f644',
    'ai_creature_horror_long_hair_lady':'028dd8c8013e2353fa800210da354cc3419578ce7cf59bcc250629030f2c88a2',
    'event_horror_doll':'c2c6f1aab43115d7948f3c8c136385c42d0c518663e50522eba39e90594a378a',
    'gimmick_furniture_japanese_doll_body':'900343a47ae2e4c031b58f812bc7a4f7d3c628e23164662f78693d0d0209df02',
    'ai_creature_horror_japanese_doll_body':'e5007108bf4c1c4095e7abacf93936fe4ae0e6ca763876797243ec7336a345e1',
    'ai_creature_horror_japanese_doll_head_item':'b1f3dac822c1d00cb3d4c4b1574d6af4ec8a889c95c930c5bc26883cb33f1816',
    'gimmick_event_night_grass':'eea10790b765e80150e4a3fbcdfdaf3980e4edfdda1666aa8c394e483567f4b3',
    'ai_creature_horror_nozuchi_tail':'56e34dde60a89357a88d3e370599b0bee7b3058a1b3952fb264ffdf6929ba850',
    'ai_creature_horror_red_mask_ghost':'3ee2e47f733eb4a12c041fa4417fac81efb346f17a9c35d94010b3c9fee9c452',
    'ai_creature_horror_purple_mask_ghost':'0f9d7fe692a948ac1b87ecb9f22e9b50758902536262a430b0cdad5df3b8c4dd',
    'gimmick_event_hat_gizo':'39a58fc3dd18f90c30f1196a4e9ef1103387c9fc7db9bb9b700f3f6dc40afebc',
    'ai_creature_horror_mizuchi_fujin_template':'0b66495d1fd8510ef11d3254c92bbded4e6389b32680295b7339603f414d17ee',
    'ai_creature_horror_mizuchi_raijin_template':'9ce5c025fa923196e67248b1d20f523a9e05b91a49d6abb0b0a42edaf7588624',
    'gimmick_snow_woman_husband_grave':'472bb109dad3bddd52b6bdfd51a5ab94a3e130a70c0ffbab1e4301eb9537d910',
    'event_horror_grudge_vegetables':'0a02f544d6ba2593679566d746760ea57cda728bfd85628227e96c3c727efb7a',
    'ai_creature_horror_dorotabo':'50562b1557454516ccca0438c0d86acddac6864d4e5f078aca9f6ce47a551b98',
    'mapevent_horror_area':'c16bab5ce0c94bbfd38432e4a16473db218b4dd311ef21236548124e754c1729',
    'event_horror_common':'87012d34303cd9e621f54b3caf1480be2acffe40cc8fd6df6d407d941dedd9c2',
    'ai_creature_horror_vegetable_monster':'605b2c00e94da8ab9e2b8147cf5c95dfa3439f6a53da25dadc4d9450e2882f94',
    'ai_creature_horror_fish_monster':'8ed1453024c390b585fb96e32de1c1ca786d2f6840aaa6f71bec57c47ed7d2c2',
    'event_horror_abyss':'572f5f481444378cd7c3e928f59ea61c95e4efeb395df5bccc278b8aa640f6fa',
    'gimmick_event_evileye_stone_monument':'9d6435b43880c7a178026a16687335a629fa410f8afdafd3f3b38e4a83c21c8e',
}
scripts={}
for name,digest in reviewed.items():
    raw=data.read_entry(f'data/script/{name}.lub')
    if hashlib.sha256(raw).hexdigest()!=digest:
        raise ValueError(f'{name} changed; re-trace it before extracting')
    scripts[name]=read_chunk(raw)

def table(name):
    t=read_table(data.read_entry(f'data/database/{name}.dat'))
    return list(zip(t.records,_string_groups(t)))
flags={struct.unpack_from('<I',r)[0]:g[0] for r,g in table('gameflag')}
event_rows=table('event')
events={struct.unpack_from('<Q',r)[0]:(g[0],r) for r,g in event_rows}
event_hours={g[0]:g[2] for r,g in event_rows}
event_by_name={name:r for name,r in events.values()}
items={struct.unpack_from('<I',r)[0]:g[0] for r,g in table('item')}
defines={g[1]:g[4] for g in _string_groups(read_table(data.read_entry('data/database/gamedefine.dat'))) if len(g)>4}
value_max={g[0]:struct.unpack_from('<I',r,40)[0] for r,g in table('gamevalue')}

def u32(r,o): return struct.unpack_from('<I',r,o)[0]
def u64(r,o): return struct.unpack_from('<Q',r,o)[0]
def u64_list(r,o):
    n=u32(r,o)
    return [u64(r,o+4+8*i) for i in range(n)],o+4+8*n
def flag_name(v): return flags.get(v,v)

def event_flags(name):
    """Required and excluded flag lists of an event.dat row (lists start at byte 72)."""
    r=event_by_name[name]
    need,o=u64_list(r,72)
    deny,_=u64_list(r,o)
    return dict(requires=[flag_name(v) for v in need],excludes=[flag_name(v) for v in deny])

# latenightevent.dat: id, 4 event ids, an unknown scalar, required flags, forced flag,
# a (year, season, day, operator) date gate, then season / day / unknown / weather lists.
WEATHER={1:'sunny',2:'rain',3:'cloudy',4:'snow',5:'thunderstorm',6:'peach_blossom'}
SEASON={0:'spring',1:'summer',2:'autumn',3:'winter'}
late_events=[]
for r,g in table('latenightevent'):
    need,o=u64_list(r,64)
    forced=u64(r,o); o+=8
    date=struct.unpack_from('<4I',r,o); o+=16
    lists=[]
    for _ in range(3):
        n=u32(r,o); lists.append(list(struct.unpack_from(f'<{n}I',r,o+4))); o+=4+4*n
    weathers,o=u64_list(r,o)
    assert o==len(r) or not any(r[o:]),g[0]
    start=events[u64(r,24)][0]
    late_events.append(dict(
        id=g[0],name_ja=g[1],start_event=start,
        encount_event=events[u64(r,48)][0],
        forced_flag=flag_name(forced),
        requires=[flag_name(v) for v in need],
        start_requires=event_flags(start),
        from_date=dict(year=date[0],season=SEASON[date[1]],day=date[2],operator=date[3]) if any(date) else None,
        seasons=[SEASON[v] for v in lists[0]],days=lists[1],
        weathers=[WEATHER[v] for v in weathers],
    ))
assert [e['id'][len('LATE_NIGHT_EVENT_'):] for e in late_events]==['HAND_EYES','STATUE_GAME','SOOT_SPRITE','GRASS','MASK','DEMON','KASA_GHOST','FUJIN_RAIJIN','SNOW_WOMAN']
assert all(e['start_requires']['requires']==['GAME_FLAG_STORY_01_END'] for e in late_events)

# Late-night frequency rules.
check=scripts['event_check_late_night']['children'][1]
k={c for c in check['constants'] if isinstance(c,(str,int))}
assert {'WEEK_MONDAY','GAME_VALUE_LATE_NIGHT_WEEK_MAX','WEATHER_ID_THUNDERSTORM','isBeforeFestival','GIMMICK_ID_SHINTO_ALTAR','GAME_FLAG_LATE_NIGHT_START_OFF'}<=k
late_night=dict(
    hours=[int(defines['DAY_LATE_NIGHT_START_HOUR']),int(defines['DAY_LATE_NIGHT_END_HOUR'])],
    weekly_count=[3,4],first_interval_days=[1,2],
    forced_by=['thunderstorm','day 1','day 15','item on the お化け棚'],
    never='eve of a festival (common.isBeforeFestival)',
    cancelled_by='GAME_FLAG_LATE_NIGHT_START_OFF (清めの塩 on the お化け棚)',
)

# お化け棚 (ITEM_ID_SHINTO_ALTAR): picked up in EVENT_ID_STORY_01_200 (深夜モード_辻で神棚を拾う).
altar_pickup=event_flags('EVENT_ID_STORY_01_200')
assert 'GAME_FLAG_STORY_01_END' in altar_pickup['requires'] and 'GAME_FLAG_HORROR_OFF_MODE' in altar_pickup['excludes']
# gimmick_shinto_altar/3 compares the placed item in this order and picks the flag to set.
seq=[c for c in scripts['gimmick_shinto_altar']['children'][3]['constants'] if isinstance(c,str) and (c.startswith('ITEM_ID_') or c.startswith('GAME_FLAG_'))]
pairs=[]
for c in seq:
    if c.startswith('ITEM_ID_'): pairs.append([c,None])
    elif pairs and pairs[-1][1] is None: pairs[-1][1]=c
tablets={i:f for i,f in pairs if f}
assert tablets=={
    'ITEM_ID_CURSED_DARUMA_MODE':'GAME_FLAG_FORCED_LATE_NIGHT_EVENT_STATUE_GAME',
    'ITEM_ID_CURSED_TENOME_MODE':'GAME_FLAG_FORCED_LATE_NIGHT_EVENT_HAND_EYES',
    'ITEM_ID_CURSED_SUSUWATARI_MODE':'GAME_FLAG_FORCED_LATE_NIGHT_EVENT_SOOT_SPRITE',
    'ITEM_ID_CURSED_TENGU_MODE':'GAME_FLAG_FORCED_LATE_NIGHT_EVENT_MASK',
    'ITEM_ID_CURSED_NODUCHI_MODE':'GAME_FLAG_FORCED_LATE_NIGHT_EVENT_GRASS',
},tablets
# 清めの塩 is compared twice (already-used shelf, then a fresh one) and sets START_OFF.
assert {'ITEM_ID_CURSED_PURIFYING_SALT','GAME_FLAG_LATE_NIGHT_START_OFF'}<={*seq}
# 木札 enter the village / added-farmland night pickups once their anomaly's first flag is set:
# entry = weight, item, …, unlock flag (u64) 20 bytes after the item.
unlock={}
for r,g in table('placementitem'):
    if g[0] not in ('PLACEMENT_ITEM_ID_001','PLACEMENT_ITEM_ID_100'): continue
    for o in range(4,len(r)-24,4):
        name=items.get(u32(r,o),'')
        if name in tablets:
            assert u32(r,o-4)==1
            unlock.setdefault(name,set()).add(flag_name(u64(r,o+20)))
tablet_list=[]
for item,flag in tablets.items():
    event=next(e['id'] for e in late_events if e['forced_flag']==flag)
    (first,)=unlock[item]
    tablet_list.append(dict(item=item,forced_flag=flag,late_night_event=event,pickup_unlock_flag=first))

# お面 night pickups: village groups whose only required flag is GAME_FLAG_HORROR_EVENT_MASK_START.
# Group header = (u32 group id, u32 sparkle gimmick, required-flag list); entries = (weight, item, …).
candle_groups=[]
for r,g in table('placementitem'):
    if g[0]!='PLACEMENT_ITEM_ID_001': continue
    w=struct.unpack_from(f'<{len(r)//4}I',r)
    starts=[i for i,v in enumerate(w) if 500000001<=v<=500000009]+[len(w)]
    for a,b in zip(starts,starts[1:]):
        if w[a+4]!=1 or flag_name(w[a+5])!='GAME_FLAG_HORROR_EVENT_MASK_START': continue
        entries=[dict(item=items[w[i]],weight=w[i-1]) for i in range(a+6,b) if w[i] in items and w[i]>1000 and 0<w[i-1]<100]
        candle_groups.append(dict(group=w[a],sparkle=w[a+2],items=entries))
assert [c['sparkle'] for c in candle_groups]==[2,3,4,5]
assert {'ITEM_ID_CURSED_RED_DEBRIS'}<={e['item'] for e in candle_groups[0]['items']} and {'ITEM_ID_CURSED_BLUE_DEBRIS'}<={e['item'] for e in candle_groups[1]['items']}
assert all(e['item'].startswith('ITEM_ID_CRAFT_RECIPE_') for c in candle_groups[2:] for e in c['items'])

# Reward cycles: the item references in each clear function, in code order.
def refs(p):
    K=p['constants']; out=[]
    for w in p['code']:
        op=OPS[w&127]
        i=w>>24 if op in ('GETTABUP','GETFIELD') else w>>15 if op=='LOADK' else None
        if i is not None and i<len(K) and isinstance(K[i],str) and (K[i].startswith('ITEM_ID_') or K[i]=='GameGetRandomLateNightItemID'):
            if not out or out[-1]!=K[i]: out.append(K[i])
    return out
RANDOM='GameGetRandomLateNightItemID'
def cycle(script,path,counter,rewards):
    p=scripts[script]
    for i in path: p=p['children'][i]
    got=refs(p)
    flat=[x for step in rewards for x,_ in step]
    assert got==flat,(script,got)
    return dict(script=script,counter=counter,counter_max=value_max[counter],
                steps=[[dict(item=x,count=n) for x,n in step] for step in rewards])
rewards={
    'LATE_NIGHT_EVENT_STATUE_GAME':cycle('gimmick_event_black_daruma',[3],'GAME_VALUE_HORROR_DARUMA_REWARD_COUNT',
        [[('ITEM_ID_TOOL_SCARECROW_SPRING',1)],[('ITEM_ID_CURSE_FURNITURE_BLACK_DARUMA',1)],[(RANDOM,10)],[('ITEM_ID_CURSE_FURNITURE_CREEPY_DARUMA',1)]]),
    'LATE_NIGHT_EVENT_HAND_EYES':cycle('event_horror_eye_of_hand',[8],'GAME_VALUE_HORROR_EVILEYESTONE_REWARD_COUNT',
        [[('ITEM_ID_TOOL_SCARECROW_SPRING',1)],[('ITEM_ID_CURSE_FURNITURE_EYEBALL_LANTERN',1)],[(RANDOM,10)],[('ITEM_ID_CURSE_FURNITURE_STONE_MONUMENT',1)]]),
    'LATE_NIGHT_EVENT_SOOT_SPRITE':cycle('event_horror_soot_sprite',[8],'GAME_VALUE_HORROR_SOOT_SPRITE_REWARD_COUNT',
        [[('ITEM_ID_TOOL_SCARECROW_SPRING',1)],[('ITEM_ID_CURSE_FURNITURE_BLACK_CRYSTAL',1)],[(RANDOM,1)],[('ITEM_ID_CURSE_FURNITURE_OBSIDIAN_ROSARY',1)]]),
    'LATE_NIGHT_EVENT_GRASS':cycle('event_horror_grass',[8],'GAME_VALUE_HORROR_NOZUCHI_REWARD_COUNT',
        [[('ITEM_ID_TOOL_SCARECROW_AUTUMN',1)],[('ITEM_ID_CURSE_FURNITURE_MUD_VESSEL',1)],[(RANDOM,10)],[('ITEM_ID_CURSE_FURNITURE_TSUCHINOKO',1)]]),
    'LATE_NIGHT_EVENT_DEMON':cycle('event_horror_demon',[6],'GAME_VALUE_HORROR_DEMON_REWARD_COUNT',
        [[('ITEM_ID_SPECIAL_SWORD',2)],[('ITEM_ID_SPECIAL_JEWELS_02',10)],[('ITEM_ID_SPECIAL_SWORD',2)],[('ITEM_ID_SPECIAL_JEWELS_02',10),('ITEM_ID_SPECIAL_MIRROR_01',1)]]),
    # The 笠 step is skipped once GAME_FLAG_RELEASE_ACCESSORY_12 is set.
    'LATE_NIGHT_EVENT_KASA_GHOST':cycle('event_horror_hat_ghost',[6],'GAME_VALUE_HORROR_HAT_GHOST_REWARD_COUNT',
        [[('ITEM_ID_TOOL_SCARECROW_SUMMER',1)],[('ITEM_ID_CURSE_FURNTURE_KASA_BROWN',1)],[('ITEM_ID_ACCESSORY_12',1)],[('ITEM_ID_CURSE_FURNTURE_KASA_BLACK',1)]]),
    'LATE_NIGHT_EVENT_SNOW_WOMAN':cycle('event_horror_snow_woman',[3],'GAME_VALUE_HORROR_SNOW_WOMAN_REWARD_COUNT',
        [[('ITEM_ID_CURSE_FURNITURE_SNOW_RABBIT',1)],[('ITEM_ID_TOOL_SCARECROW_WINTER',1)],[('ITEM_ID_CURSE_FURNITURE_SNOWMAN',1)],[(RANDOM,10)]]),
}
fujin=cycle('event_horror_fujin_raijin',[5],'GAME_VALUE_HORROR_FUJIN_REWARD_COUNT',
    [[('ITEM_ID_CURSE_FURNITURE_HANGING_SCROLL_01',1)],[('ITEM_ID_TOOL_SCARECROW_SPRING',1)],[('ITEM_ID_TOOL_SCARECROW_AUTUMN',1)]])
raijin=cycle('event_horror_fujin_raijin',[7],'GAME_VALUE_HORROR_RAIJIN_REWARD_COUNT',
    [[('ITEM_ID_CURSE_FURNITURE_HANGING_SCROLL_02',1)],[('ITEM_ID_TOOL_SCARECROW_SUMMER',1)],[('ITEM_ID_TOOL_SCARECROW_WINTER',1)]])
# Clearing both sides while GAME_VALUE_HORROR_FUJIN_RAIJIN_ALIVE is 1 (both were alive at the start) adds a statue.
assert refs(scripts['event_horror_fujin_raijin']['children'][8])==['ITEM_ID_CURSE_FURNITURE_SUSPICIOUS_STATUE']
rewards['LATE_NIGHT_EVENT_FUJIN_RAIJIN']=dict(fujin=fujin,raijin=raijin,both_in_one_night=[dict(item='ITEM_ID_CURSE_FURNITURE_SUSPICIOUS_STATUE',count=1)],
    mizuchi_per_side=value_max['GAME_VALUE_HORROR_FUJIN_MIZUCHI_DEFEAT_COUNT'])
assert value_max['GAME_VALUE_HORROR_RAIJIN_MIZUCHI_DEFEAT_COUNT']==4
for e in late_events: e['rewards']=rewards.get(e['id'])
assert late_events[4]['rewards'] is None  # お面 has no clear reward; its loot is the candle pickups

# 見知らぬ家畜 (ghost cow): dig rewards picked by clear count, then 01→02→03 and 02/03 alternating.
cow=scripts['event_horror_unknown_livestocs']
place=cow['children'][11]['constants']
assert [c for c in place if isinstance(c,str) and c.startswith('CROPS_ID_')]==['CROPS_ID_OBJECT_UNKNOWN_LIVESTOCK_ITEM_02','CROPS_ID_OBJECT_UNKNOWN_LIVESTOCK_ITEM_01','CROPS_ID_OBJECT_UNKNOWN_LIVESTOCK_ITEM_03']
harvest={}
crops={g[0]:struct.unpack_from('<I',r)[0] for r,g in table('crops')}
for r,g in table('cropsharvest'):
    cid=u32(r,0)
    for n in (1,2,3):
        if cid==crops[f'CROPS_ID_OBJECT_UNKNOWN_LIVESTOCK_ITEM_0{n}']:
            harvest[n]=dict(item=items[u32(r,36)],count=u32(r,56))
assert harvest=={1:dict(item='ITEM_ID_HUNTING_LARGE_ANIMAL_BONES',count=3),2:dict(item='ITEM_ID_HUNTING_LARGE_ANIMAL_BONES',count=5),3:dict(item='ITEM_ID_CURSE_FURNITURE_COW_SKULL',count=1)},harvest
start=cow['children'][0]['constants']
assert 'GAME_FLAG_LIVESTOCK_HOUSE_1_EXIST' in start and 'LIVESTOCK_ID_GHOST_COW' in cow['constants']
unknown_livestock=dict(
    check=event_flags('EVENT_ID_UNKNOWN_LIVESTOCK_CHECK'),
    start=event_flags('EVENT_ID_UNKNOWN_LIVESTOCK_START'),
    appears='needs any livestock house; not created on days 21–27',
    move_window=event_hours['EVENT_ID_UNKNOWN_LIVESTOCK_MOVE_OUTDOOR'],
    dig_rewards=[harvest[1],harvest[2],harvest[3]],repeat=[harvest[2],harvest[3]],
    first_clear='GAME_FLAG_WHISTLE_SONG_LEARN_02',
    clear_count_max=value_max['GAME_VALUE_HORROR_UNKNOWN_LIVESTOCK_CLEAR_COUNT'],
)

def consts(script):
    """Every constant of a script, all functions included."""
    out,todo=set(),[scripts[script]]
    while todo:
        p=todo.pop(); todo+=p['children']
        out|={c for c in p['constants'] if isinstance(c,(str,int))}
    return out

# Map positions: named anchors in the village map head ((x, y) 32 bytes after the name; the four
# season heads carry the same anchors), placed gimmicks as (u32 gimmick id, x, y).
maps=FafullfsArchive.open(game_dir(__doc__)/'data/map_1_00.dat')
def head(season):
    b=maps.read_entry(f'data/map/map_0000_ver120_{season}.ymwr.head')
    return zlib.decompress(b[20:]) if b.startswith(b'YKCMP_V1') else b
village=head('spr')
anchor_pos={m[1].decode():struct.unpack_from('<ii',village,m.start()+32) for m in re.finditer(rb'((?:pop|pos|move|event)_[A-Za-z0-9_]+)\x00',village)}
gimmick_ids={g[0]:u32(r,0) for r,g in table('gimmick')}
def placed(gimmick):
    key=struct.pack('<I',gimmick_ids[gimmick])
    assert village.count(key)==1,gimmick
    return struct.unpack_from('<ii',village,village.find(key)+4)
def family(pattern):
    names=sorted(a for a in anchor_pos if re.fullmatch(pattern,a))
    assert names,pattern
    return [dict(anchor=a,x=anchor_pos[a][0],y=anchor_pos[a][1]) for a in names]
POINTS={
    # 手之目: small monuments pop_evilEyeStone (function 16); the big one is created at a constant.
    'evil_eye_stone':r'pop_evilEyeStone\d+','eye_of_hand':r'pop_eye_of_hand\d+',
    'lantern_fixed':r'pop_lanternFixed\d+_\d','lantern_move':r'pop_lanternMove\d+',
    'daruma_stone':r'pop_daruma_stone\d+',
    'boss_soot_sprite':r'pop_bossSootSprite\d+','soot_sprite':r'pop_sootSprite\d+',
    # お面: the native placement reads pop_mask_item_red/blue; MapCreaturePop uses the creature anchors.
    'mask_item_red':r'pop_mask_item_red\d+','mask_item_blue':r'pop_mask_item_blue\d+',
    'purple_mask_ghost':r'pop_purpleMaskGhost\d+','red_merchant':r'pop_redMerchant(?:_\d+)?_\d+','blue_merchant':r'pop_blueMerchant(?:_\d+)?\d*(?:_\d+)?',
    'hat_ghost':r'pop_hat_ghost\d+',
    'mizuchi_fujin':r'pop_mizuchiFujin\d+','mizuchi_fujin_small':r'pop_mizuchiFujinS\d+',
    'mizuchi_raijin':r'pop_mizuchiRaijin\d+','mizuchi_raijin_small':r'pop_mizuchiRaijinS\d+',
    'husband_grave':r'pos_husband_grave\d+','snow_child':r'pop_snowChild\d+','snow_woman_intro':r'event_farm_entrance_pos00',
    'petopeto':r'pop_petopeto\d+','petopeto_goal':r'pos_petopeto_goal\d+',
    'giant_rabbit':r'pop_giant_rabbit\d+',
    'red_phone':r'pop_mobilePhone\d+',
    'doll_body_item':r'pop_japaneseDollBodyItem\d+','doll_walking':r'pop_japaneseDollBodyCreature\d+','doll_route':r'move_japaneseDollBody\d+',
    'demon':r'pop_demon\d+',
    'dorotabo':r'pop_dorotabo\d+','dorotabo_field':r'move_dorotabo\d+',
    'fish_monster':r'pop_fishMonster\d+','abyss_carp':r'pop_abyss_carp\d+',
}
map_points={k:family(v) for k,v in POINTS.items()}
assert {k:len(v) for k,v in map_points.items() if len(v)>1}=={
    'evil_eye_stone':5,'eye_of_hand':2,'lantern_fixed':6,'lantern_move':7,'daruma_stone':97,'boss_soot_sprite':4,'soot_sprite':43,
    'mask_item_red':21,'mask_item_blue':21,'purple_mask_ghost':21,'blue_merchant':4,'hat_ghost':20,
    'mizuchi_fujin':4,'mizuchi_fujin_small':3,'mizuchi_raijin':4,'mizuchi_raijin_small':2,'husband_grave':3,'snow_child':21,'red_phone':5,'doll_route':2,
    'dorotabo':6,'dorotabo_field':6,'fish_monster':30}
eye=consts('event_horror_eye_of_hand')
assert {17280,18630,'pop_evilEyeStone','pop_eye_of_hand'}<=eye
# The small monuments go on RandomSelectIndex(#anchors, 5) of the 5 anchors, i.e. all of them.
assert 'RandomSelectIndex' in consts('event_horror_eye_of_hand')
monument_hits={g[0]:int(g[g.index('breakCount')+1]) for g in _string_groups(read_table(data.read_entry('data/database/gimmick.dat'))) if g[0].startswith('GIMMICK_ID_EVENT_EVILEYE_STONE_MONUMENT_')}
assert monument_hits=={'GIMMICK_ID_EVENT_EVILEYE_STONE_MONUMENT_SMALL':2,'GIMMICK_ID_EVENT_EVILEYE_STONE_MONUMENT_BIG':4},monument_hits
assert 'action_pickaxe' in consts('gimmick_event_evileye_stone_monument')
map_points['evil_eye_monument_big']=[dict(anchor='constant in event_horror_eye_of_hand',x=17280,y=18630)]
for key,gimmick in (('jizo','GIMMICK_ID_EVENT_HAT_GIZO'),('phone_box','GIMMICK_ID_FHONE_BOX')):
    x,y=placed(gimmick)
    map_points[key]=[dict(anchor=gimmick,x=x,y=y)]
# The event scripts read these anchor names.
assert {'pop_hat_ghost','GIMMICK_ID_EVENT_HAT_GIZO'}<=consts('event_horror_hat_ghost')
assert {'pos_husband_grave%02d','RandomRange','event_farm_entrance_pos00'}<=consts('event_horror_snow_woman')
assert {'pop_mobilePhone','GIMMICK_ID_FHONE_BOX'}<=consts('event_horror_phone_booth')
assert {'pos_petopeto_goal00'}<=consts('event_horror_petopeto') and {'pop_giant_rabbit00'}<=consts('event_horror_mountain_monster')
assert {'pop_japaneseDollBodyCreature00'}<=consts('event_horror_doll')
for season in ('sum','aut','win'):
    other=head(season)
    for rows in map_points.values():
        for p in rows:
            if p['anchor'].startswith(('pop_','pos_','move_','event_')):
                m=re.search(rb'(?<![A-Za-z0-9_])'+re.escape(p['anchor']).encode()+rb'\x00',other)
                assert struct.unpack_from('<ii',other,m.start()+32)==(p['x'],p['y']),(season,p)

# Night events outside the late-night rotation: reward lists in code order.
def all_refs(script):
    out=[]
    for p in [scripts[script],*scripts[script]['children']]:
        out+=[x for x in refs(p) if x not in out]
    return out
SCARECROWS=['ITEM_ID_TOOL_SCARECROW_SPRING','ITEM_ID_TOOL_SCARECROW_SUMMER','ITEM_ID_TOOL_SCARECROW_AUTUMN','ITEM_ID_TOOL_SCARECROW_WINTER']
assert all_refs('event_horror_petopeto')==['ITEM_ID_ACCESSORY_01_00','ITEM_ID_ACCESSORY_74',*SCARECROWS]
assert all_refs('event_horror_mountain_monster')==['ITEM_ID_FIGURINE_SEASON_JUGOYA_SET','ITEM_ID_ACCESSORY_05_00','ITEM_ID_CLOTHING_06_00',*SCARECROWS]
assert {'ITEM_ID_CURSE_FURNITURE_OSUG','ITEM_ID_CURSE_FURNITURE_ONIMARU','ITEM_ID_CURSED_BROKEN_MOBILE_PHONE'}<=consts('event_horror_phone_booth')
assert {'INTANGEBLE_ID_CRAFT_RECIPE_12','ITEM_ID_CURSE_FURNITURE_JAPANESE_DOLL_BODY','ITEM_ID_CURSE_FURNITURE_JAPANESE_DOLL_HEAD'}<=consts('event_horror_doll')
# 泥田坊: mapevent_horror_area starts EVENT_ID_GRUDGE_VEGETABLES between 0:00 and 2:59, the first time
# at once, later once 7 days have passed and the last 泥の種 is gone from its field.
assert {'GAME_FLAG_HORROR_EVENT_GRUDGE_VEGETABLES_FIRST_DOROTABO','CROPS_ID_OBJECT_MUD_SEEDS','EVENT_ID_GRUDGE_VEGETABLES'}<=consts('mapevent_horror_area')
assert {'pop_dorotabo%02d','CREATURE_ID_HORROR_DOROTABO'}<=consts('event_horror_grudge_vegetables')
assert {'move_dorotabo00','move_dorotabo05','CROPS_ID_OBJECT_MUD_SEEDS'}<=consts('ai_creature_horror_dorotabo')
crop_rows={g[0]:r for r,g in table('crops')}
mud=[(u32(r,0),r) for r,g in table('cropsharvest') if u32(r,0)==u32(crop_rows['CROPS_ID_OBJECT_MUD_SEEDS'],0)]
(_,mud_row),=mud
assert items[u32(mud_row,36)]=='ITEM_ID_CROPS_MUD_SEEDS' and items[u32(mud_row,96)]=='ITEM_ID_CURSE_FURNITURE_GHOST_FLOWER_VASE',mud_row
# Cursed crops / fish: discarding or shipping adds to a pop count; EVENT_ID_LATE_NIGHT_START pops that many.
# The category checks never match a cursed item, so nothing pops (see extract-curse-items.py).
common_k=consts('event_horror_common')
assert {'ITEM_FEATURE_CURSE','ITEM_CATEGORY_CROPS','ITEM_CATEGORY_FLOWER','ITEM_CATEGORY_FRUIT','ITEM_CATEGORY_FISH','CREATURE_ID_HORROR_VEGETABLE_MONSTER','CREATURE_ID_HORROR_FISH_MONSTER'}<=common_k
assert event_hours['EVENT_ID_LATE_NIGHT_START'].startswith('0:00'),event_hours['EVENT_ID_LATE_NIGHT_START']
veg=consts('ai_creature_horror_vegetable_monster')
assert {'ATTACK_ID_ENEMY_HORROR_STRONG_BODY_SLAM','LIFESPAN_FRAME'}<=veg
# オカミ淵: 今野 sells the tip for 1000; then cursed items thrown into the pool count toward the next level.
abyss=consts('event_horror_abyss')
assert {1000,'CHARA_ID_SECRETARY','ITEM_FEATURE_CURSE','ITEM_ID_CURSED_HEART_SCALE','GAME_FLAG_WHISTLE_SONG_LEARN_10','ITEM_ID_CURSE_FURNITURE_CARP_LANTERN_1','ITEM_ID_CURSE_FURNITURE_CARP_LANTERN_2'}<=abyss
abyss_need=[int(defines[f'ABYSS_NEED_COUNT_LV{i}']) for i in range(1,8)]
assert value_max['GAME_VALUE_HORROR_ABYSS_LEVEL']==7

monuments=dict(tool='pickaxe (action_pickaxe)',needs_light=True,before_hour=5,hits=monument_hits)
night_events=dict(
    dorotabo=dict(event='EVENT_ID_GRUDGE_VEGETABLES',start=event_flags('EVENT_ID_GRUDGE_VEGETABLES'),hours=[0,2],repeat_after_days=7,
        plants='CROPS_ID_OBJECT_MUD_SEEDS',early_harvest='ITEM_ID_CROPS_MUD_SEEDS',grown_harvest='ITEM_ID_CURSE_FURNITURE_GHOST_FLOWER_VASE'),
    cursed_produce=dict(adds_on=['EVENT_ID_LATE_NIGHT_DISCARD_CURSED_CROP','EVENT_ID_LATE_NIGHT_SHIP_CURSED_CROP','EVENT_ID_LATE_NIGHT_DISCARD_CURSED_FISH','EVENT_ID_LATE_NIGHT_SHIP_CURSED_FISH'],
        pops_on='EVENT_ID_LATE_NIGHT_START',vegetable_monster=dict(attack='ATTACK_ID_ENEMY_HORROR_STRONG_BODY_SLAM',charge_frames=120,lifespan_frames=360),
        fish_monster=dict(lifespan_after_lost_frames=1800)),
    abyss=dict(tip_price=1000,npc='CHARA_ID_SECRETARY',hours=[0,4],need_per_level=abyss_need,
        rewards=['+1 max HP (ITEM_ID_CURSED_HEART_SCALE)']*5+['GAME_FLAG_WHISTLE_SONG_LEARN_10','ITEM_ID_CURSE_FURNITURE_CARP_LANTERN_1 or _2 (repeats)']),
    petopeto=dict(goal_event=event_flags('EVENT_ID_PETOPETO_GOAL'),rewards=[dict(item='ITEM_ID_ACCESSORY_01_00',skipped_by='GAME_FLAG_RELEASE_ACCESSORY_01'),dict(item='ITEM_ID_ACCESSORY_74',skipped_by='GAME_FLAG_RELEASE_ACCESSORY_74'),dict(item='random seasonal scarecrow',of=SCARECROWS)]),
    giant_rabbit=dict(rewards=[dict(item='ITEM_ID_FIGURINE_SEASON_JUGOYA_SET'),dict(item='ITEM_ID_ACCESSORY_05_00',skipped_by='GAME_FLAG_RELEASE_ACCESSORY_05'),dict(item='ITEM_ID_CLOTHING_06_00',skipped_by='GAME_FLAG_RELEASE_CLOTHING_06'),dict(item='random seasonal scarecrow',of=SCARECROWS)]),
    phone_booth=dict(start=event_flags('EVENT_ID_PHONE_BOOTH_START'),placement=event_flags('EVENT_ID_PHONE_BOOTH_PLACEMENT'),pickup='ITEM_ID_CURSED_RED_MOBILE_PHONE',after_answer='ITEM_ID_CURSED_BROKEN_MOBILE_PHONE',rewards=['ITEM_ID_CURSE_FURNITURE_OSUG','ITEM_ID_CURSE_FURNITURE_ONIMARU']),
    doll=dict(placement=event_flags('EVENT_ID_DOLL_BODY_PLACEMENT'),pickup='ITEM_ID_CURSE_FURNITURE_JAPANESE_DOLL_BODY',head='ITEM_ID_CURSE_FURNITURE_JAPANESE_DOLL_HEAD',recipe='INTANGEBLE_ID_CRAFT_RECIPE_12'),
)

out=dict(
    source='latenightevent.dat, event.dat, gamevalue.dat, placementitem.dat, cropsharvest.dat, gimmick.dat, map_0000_ver120_*.ymwr.head + scripts '+', '.join(f'{k}.lub' for k in reviewed),
    script_sha256=reviewed,
    late_night=late_night,
    altar=dict(item='ITEM_ID_SHINTO_ALTAR',pickup_event='EVENT_ID_STORY_01_200',**altar_pickup),
    tablets=tablet_list,
    mask_night_pickups=candle_groups,
    events=late_events,
    unknown_livestock=unknown_livestock,
    map_points=map_points,
    night_events=night_events,
    hand_eyes_monuments=monuments,
)
Path('data/sources/game-anomalies.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(len(late_events),'events,',len(tablet_list),'tablets')
