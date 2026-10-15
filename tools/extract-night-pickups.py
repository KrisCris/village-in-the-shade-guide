"""Locate late-night pickups placed by event scripts at named map anchors.

Traced by hand from the event scripts (hashes below); re-trace when a hash changes.
- event_horror_chirping_machine: GET_FLAG_TABLE pairs each 機械の部品 flag with a map.
  event_placement spawns parts 1–15 from GAME_FLAG_STORY_03_START and 16–30 from
  GAME_FLAG_STORY_06_END, each at pop_machine_partNN (NN = part number − 1) until
  its flag is set. The sparkle (GIMMICK_ID_EVENT_KIRAKIRA_MACHINE_PARTS: night=1,
  lightType=-1) pops from TIME_ZONE_LATE_NIGHT to TIME_ZONE_MORNING and only shows
  while the player's light is on.
- event_horror_ghost_rat: event_placement picks RAND_PLACEMENT_NUM (3) random
  uncleared village anchors pop_ghostRat00–25 (24 excluded), plus pop_fixed_ghostRat24
  during chapter 4 and one rat each at pop_ghostRat00 on 地下通路, 迷い森, 藪 and 峠.
- event_horror_phone_booth: placement_mobilePhone puts the red phone at one random
  pop_mobilePhone anchor.
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

read_chunk=runpy.run_path('tools/inspect-lua54.py')['read_chunk']
game=game_dir(__doc__)
data=FafullfsArchive.open(game/'data.dat')
maps=FafullfsArchive.open(game/'data/map_1_00.dat')
reviewed={
    'event_horror_chirping_machine':'312b2e3a4af829848f1b7ca35330170a4d0945e6d7d5705f530cadcf2224236a',
    'event_horror_ghost_rat':'99ecdcae7d2f0b6350b7aaeafb369c76f16e6721f81a2fbb387f9ed113c57db9',
    'event_horror_phone_booth':'08a6212e2f7464310a21e06df92451263dff0f79747eb591c9cb87bfb2f5f644',
    'gimmick_event_kirakira_machine_parts':'eb620b31800c140e9531a59a76bcf722f29a22ef5da2a9506da734a91e086505',
    'ai_creature_horror_ghost_rat':'a7d40fb3e3bb6ee9a6a29787c685c47baa30a6baace3d5b78e1f5d322a2345e9',
}
scripts={}
for name,digest in reviewed.items():
    raw=data.read_entry(f'data/script/{name}.lub')
    if hashlib.sha256(raw).hexdigest()!=digest:
        raise ValueError(f'{name} changed; re-trace its placement before extracting')
    scripts[name]=read_chunk(raw)

defines={g[1]:g[4] for g in _string_groups(read_table(data.read_entry('data/database/gamedefine.dat'))) if len(g)>4}
heads={g[0]:g[2]+'.head' for g in _string_groups(read_table(data.read_entry('data/database/map.dat'))) if g[0].startswith('MAP_ID_')}
MAP_KEYS={'MAP_ID_OPENWORLD':'village','MAP_ID_SUBWAY':'subway','MAP_ID_LOST_FOREST':'lost-forest','MAP_ID_BUSHAREA':'bush','MAP_ID_MOUNTAIN_PASS':'pass'}
anchor_cache={}
def anchors(map_id):
    """Named anchors in a map head: name -> (x, y)."""
    if map_id not in anchor_cache:
        blob=maps.read_entry(heads[map_id])
        if blob.startswith(b'YKCMP_V1'): blob=zlib.decompress(blob[20:])
        anchor_cache[map_id]={m[1].decode():struct.unpack_from('<ii',blob,m.start()+32) for m in re.finditer(rb'(pop_(?:machine_part|ghostRat|fixed_ghostRat|mobilePhone)\d+)\x00',blob)}
    return anchor_cache[map_id]
def marker(kind,map_id,anchor,**extra):
    x,y=anchors(map_id)[anchor]
    return dict(anchor=anchor,kind=kind,map=heads[map_id],area=MAP_KEYS[map_id],x=x,y=y,**extra)

# 機械の部品: main builds GET_FLAG_TABLE as {flag, map} pairs, in part order.
main=scripts['event_horror_chirping_machine']
consts=main['constants']
parts=[]
for word in main['code']:
    op=word&127; bx=word>>15
    if op==3 and isinstance(consts[bx],str) and consts[bx].startswith('GAME_FLAG_HORROR_SUBEVENT_MACHINE_PART_GET_'):
        parts.append([consts[bx],None])
    elif op==11 and parts and parts[-1][1] is None:
        parts[-1][1]=consts[word>>24]
assert len(parts)==int(defines['MACHINE_PARTS_MAX'])==30 and all(m in MAP_KEYS for _,m in parts)
placement=main['children'][0]['constants']
assert placement[1]=='GAME_FLAG_STORY_03_START' and placement[19]=='GAME_FLAG_STORY_06_END' and 'pop_machine_part%02d' in placement
visible=scripts['gimmick_event_kirakira_machine_parts']['children']
assert {'TIME_ZONE_LATE_NIGHT','TIME_ZONE_MORNING'}<={*visible[0]['constants']} and 'PlayerIsLightOn' in visible[4]['constants']
markers=[marker('machine_part',map_id,f'pop_machine_part{i:02d}',number=i+1,unlock='GAME_FLAG_STORY_03_START' if i<15 else 'GAME_FLAG_STORY_06_END') for i,(_,map_id) in enumerate(parts)]

# 幽霊ネズミ: village pool, the chapter-4 fixed rat, then one rat per side area.
rat=scripts['event_horror_ghost_rat']['children'][0]['constants']
pool=[int(c[-2:]) for c in rat if isinstance(c,str) and re.fullmatch(r'GAME_FLAG_HORROR_SUBEVENT_GHOST_RAT_CLEAR_\d\d',c)]
assert pool[:25]==[*range(24),25] and scripts['event_horror_ghost_rat']['constants'][8:10]==['RAND_PLACEMENT_NUM',3]
markers+=[marker('ghost_rat','MAP_ID_OPENWORLD',f'pop_ghostRat{n:02d}',number=n+1,placement='random') for n in pool[:25]]
fixed=next(a for a in anchors('MAP_ID_OPENWORLD') if a.startswith('pop_fixed_ghostRat24'))
markers.append(marker('ghost_rat','MAP_ID_OPENWORLD',fixed,number=25,placement='story'))
side=[c for c in rat if c in ('MAP_ID_SUBWAY','MAP_ID_LOST_FOREST','MAP_ID_BUSHAREA','MAP_ID_MOUNTAIN_PASS')]
assert side==['MAP_ID_SUBWAY','MAP_ID_LOST_FOREST','MAP_ID_BUSHAREA','MAP_ID_MOUNTAIN_PASS']
# Each side area loops i=1..1 over format('pop_ghostRat%02d', i-1).
for n,map_id in zip((26,27,28,29),side):
    assert [a for a in anchors(map_id) if 'ghostRat' in a]==['pop_ghostRat00'],map_id
    markers.append(marker('ghost_rat',map_id,'pop_ghostRat00',number=n+1,placement='fixed'))
assert sum(m['kind']=='ghost_rat' for m in markers)==int(defines['RAT_COIN_MAX'])

# 赤い携帯電話: one random candidate per placement.
phone=scripts['event_horror_phone_booth']['children'][2]['constants']
assert 'pop_mobilePhone' in phone and 'RandomRange' in phone
markers+=[marker('red_phone','MAP_ID_OPENWORLD',a) for a in sorted(anchors('MAP_ID_OPENWORLD')) if a.startswith('pop_mobilePhone')]

# Turn-in spots: placed gimmicks are stored in the head as (u32 gimmick id, i32 x, i32 y).
# The chirping machine sits beside the anchor its repair cutscene stands the player on.
gimmick_table=read_table(data.read_entry('data/database/gimmick.dat'))
gimmicks={g[0]:struct.unpack_from('<I',r)[0] for r,g in zip(gimmick_table.records,_string_groups(gimmick_table))}
head=maps.read_entry(heads['MAP_ID_OPENWORLD'])
if head.startswith(b'YKCMP_V1'): head=zlib.decompress(head[20:])
def placed(gimmick_id):
    key=struct.pack('<I',gimmicks[gimmick_id])
    assert head.count(key)==1,gimmick_id
    return struct.unpack_from('<ii',head,head.find(key)+4)
for gimmick_id,anchor in (('GIMMICK_ID_BROKEN_GRAMOPHONE','chirping_machine'),('GIMMICK_ID_RAT_WELL','rat_well')):
    x,y=placed(gimmick_id)
    markers.append(dict(anchor=anchor,kind='turn_in',map=heads['MAP_ID_OPENWORLD'],area='village',x=x,y=y,gimmick=gimmick_id))
stand=re.search(rb'pos_chirpingMachine_player00\x00',head)
assert abs(struct.unpack_from('<i',head,stand.start()+32)[0]-markers[-2]['x'])<200

out=dict(
    source='event scripts '+', '.join(f'{k}.lub' for k in reviewed)+' + map.dat heads',
    script_sha256=reviewed,
    late_night_hours=[int(defines['DAY_LATE_NIGHT_START_HOUR']),int(defines['DAY_LATE_NIGHT_END_HOUR'])],
    machine_parts_max=int(defines['MACHINE_PARTS_MAX']),
    rat_coin_max=int(defines['RAT_COIN_MAX']),
    markers=markers,
)
Path('data/sources/game-night-pickups.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print({k:sum(m['kind']==k for m in markers) for k in ('machine_part','ghost_rat','red_phone')},{a:sum(m['area']==a for m in markers) for a in MAP_KEYS.values()})
