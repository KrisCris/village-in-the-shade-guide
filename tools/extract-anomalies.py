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
latenightevent.dat supplies per-event conditions; event.dat supplies the start events'
required and excluded flags.
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

ns=runpy.run_path('tools/inspect-lua54.py')
read_chunk,OPS=ns['read_chunk'],ns['OPS']
data=FafullfsArchive.open(game_dir(__doc__)/'data.dat')
reviewed={
    'event_check_late_night':'376eb632105911c4bde30ad9bb728e5e3acaa6260ba70b5fa87e656653cc22a2',
    'gimmick_shinto_altar':'2e5594a5e4b313e109d9e9766a13b39d51148ecd1a451214466950e6a88e3ebf',
    'gimmick_event_black_daruma':'69286045c8a396852fb5a17dd9951083ad0dbc17ae4e4011a3c9526d2e2468e4',
    'event_horror_statue_game':'19d2887a777717d8090ce876791370ae4df00c2f4677ce532a15f85fb41d392a',
    'event_horror_eye_of_hand':'4192f7f6143eb887df97b0fbff177ba6d7cb554e8c96564bb47218c67ba13949',
    'event_horror_soot_sprite':'d87ab5d936d9e9b21d00e7756e54664b748e8b7ecf0577c31d31199e39a3fc5a',
    'event_horror_grass':'2cd7ccd8be4c870bd64b1ffc20505948268a78e69f5e0a6c8c8da16cdb53270b',
    'event_horror_mask':'90a184b52bfdff9601bcbb1ada828506ee94375fa6cc5c59d90cf23dd6bd5cd2',
    'event_horror_demon':'d44bba0759db4013ed959235c6563f0d90c413df6c8984fbda16b972e823024f',
    'event_horror_hat_ghost':'fdd69160f321a5580ddcf6bb310b20091a3eacaab5d5ab0ccdac3625002f251b',
    'event_horror_fujin_raijin':'5fd88804116ee8e2239d2ed35b5788b2ce13d617bcc701dfae230c14506da28e',
    'event_horror_snow_woman':'cfd05957dd7859e74feb008aafd05d34e08feb4ee15f7c912ccab22e69c7fcbb',
    'event_horror_unknown_livestocs':'b4800dcceec164f4ca9f911ece3809559478695ab7104957f63384c021ee7838',
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

out=dict(
    source='latenightevent.dat, event.dat, gamevalue.dat, placementitem.dat, cropsharvest.dat + scripts '+', '.join(f'{k}.lub' for k in reviewed),
    script_sha256=reviewed,
    late_night=late_night,
    altar=dict(item='ITEM_ID_SHINTO_ALTAR',pickup_event='EVENT_ID_STORY_01_200',**altar_pickup),
    tablets=tablet_list,
    mask_night_pickups=candle_groups,
    events=late_events,
    unknown_livestock=unknown_livestock,
)
Path('data/sources/game-anomalies.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(len(late_events),'events,',len(tablet_list),'tablets')
