"""Extract the ordinary late-night monsters of the 山中, 牧場 (farm) and 峠 road areas.

Traced by hand from the scripts below (hashes in `reviewed`); re-trace when a hash changes.
- event_check_late_night.startLateNight clears GAME_FLAG_LATENIGHT_PLANE_GHOST_AREA, calls
  EventAddHorrorPlacement and swaps up to HORROR_WALKING_STONE_POP_MAX village stones
  (CROPS_ID_OBJECT_STONE) for 歩く石; endLateNight swaps them back.
- mapevent_latenight_area: crossing a DEMO_ID_PLANE_GHOST_AREA_ON_* line during
  TIME_ZONE_LATE_NIGHT sets the flag and calls EventSetPlacementPlaneGhost(areaID);
  crossing an _OFF_ line clears it and vanishes every plane ghost (CreatureSearchPlaneGhostList).
- The native EventSetPlacementPlaneGhost walks placementhorror.dat: each table rolls
  RandomRange(dayPopMin, dayPopMax) and places members on map cells whose attribute byte
  (cell + 80 + subcell * 8 + 3) holds the table id; anchor tables use their popAnchorName.
- ai_creature_horror_*: behaviour constants (sight ranges, frames, speeds) read below.
Damage: the native hit code multiplies creature.dat power by attack.dat ratePower, keeps
1 when the product is below 200, else divides by 100, then adds addPower. One heart is
PLAYER_STATUS_HP_HEART_MAX (4) HP.
"""
import hashlib
import json
import re
import runpy
import struct
import zlib
from collections import defaultdict
from pathlib import Path
from honogurashi_extractor.gamedir import game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

ns=runpy.run_path('tools/inspect-lua54.py')
read_chunk,OPS=ns['read_chunk'],ns['OPS']
game=game_dir(__doc__)
data=FafullfsArchive.open(game/'data.dat')
maps=FafullfsArchive.open(game/'data/map_1_00.dat')
reviewed={
    'ai_creature_horror_moyamoyasan_lv3':'7ebb55538599d1bf903744cedc539e8472c1ce2b69139b393745c175e707e07e',
    'ai_creature_horror_kunekune':'220855d5a5ed1916cc112bd2da60ac2092d05bb63a00e3f3126e07bc466f5bf8',
    'ai_creature_horror_wandering_ghost':'8ae7e311b958808a0b6465ac4dd86940c2cff237c1df70f21316bb21f9918ca3',
    'ai_creature_horror_warp_ghost':'b19774bc5db8d2e718b4ff79620748de09219d893c3f79da293441d171ac85e8',
    'ai_creature_horror_obo':'a94dd59fdef6a4f81a0e1390b8713cf4b415921d6333fa727f2b820e7e4cd2cb',
    'ai_creature_horror_two_mouths_woman':'8c5a1962d3bda2b925ac1bda314b5b6e26ed91b06b59fb542617d3e9e3904c35',
    'ai_creature_horror_blockage_plane':'32eefbff4b76bf13b59d522bc97b4c8aac5ac48c1f5eb1777953d6d78f6ab40a',
    'ai_creature_horror_blockage':'c7bea39482d436d99f66d8e8804baed8e1c81f7309704cf270fd6e5a6f277587',
    'ai_creature_horror_plastered_wall_face':'15d02d7a52199e56486eca86db21c566e9ab021856ced74a2ca62b4fdf28724e',
    'ai_creature_horror_plastered_wall_one':'d3aa69bff2f06ed6b089efcbd968efe25fa89ce051026e737328b8199a68fa83',
    'ai_creature_horror_whelk':'79434c9a4f454d8ff525fed800fed779c34df074aacb465bfbe894b74ad011e0',
    'ai_creature_horror_walking_stone':'c930abbc2915897326d1fd08ffcf036e345249e14b03c3501e4a281763e96aa8',
    'ai_creature_horror_treasure_box':'cb41b13c468b6e0e48dbcca77f116e25790cece91de4d46ab76888344f31e0eb',
    'mapevent_latenight_area':'3201be516f9fbabd5afe5787f885181eda33f18764b255cf4b902112a3a14b39',
    'event_check_late_night':'376eb632105911c4bde30ad9bb728e5e3acaa6260ba70b5fa87e656653cc22a2',
    # Story chapters that create the bosses named in the task (not part of the night tables).
    'story_05_01':'1c39916fa8756e069c99ea42f9c66b32484af975ea3c115ad24b01d93a080899',
    'story_05_02':'639acfa637563da58b038ce0fee5ded874fdc260cd29dd65d17e64a7052112ed',
    'story_05_03':'99378aaba664b6063a1cd8ae8dffdae0315b7c4a494508166e501ccc30186b39',
    'story_06_02':'d246bb7f0ccf5fe5910b077bbe4f385b4ce734f2b635d799d0e2a30c8bddcbf4',
}
scripts={}
for name,digest in reviewed.items():
    raw=data.read_entry(f'data/script/{name}.lub')
    if hashlib.sha256(raw).hexdigest()!=digest:
        raise ValueError(f'{name} changed; re-trace it before extracting')
    scripts[name]=read_chunk(raw)

def consts(name):
    """Every constant and integer immediate (LOADI/LOADF, EQI…GEI) of a script, nested functions included."""
    out=[]
    def walk(p):
        out.extend(p['constants'])
        for word in p['code']:
            op=OPS[word&127]
            if op in ('LOADI','LOADF'): out.append((word>>15)-65535)
            elif op in ('EQI','LTI','LEI','GTI','GEI'): out.append((word>>16&255)-127)
        for child in p['children']: walk(child)
    walk(scripts[name])
    return out
def table(name):
    t=read_table(data.read_entry(f'data/database/{name}.dat'))
    return t,list(zip(t.records,_string_groups(t)))
u32=lambda r,o: struct.unpack_from('<I',r,o)[0]
u64=lambda r,o: struct.unpack_from('<Q',r,o)[0]
defines={g[1]:g[4] for g in _string_groups(read_table(data.read_entry('data/database/gamedefine.dat'))) if len(g)>4}
GRID=int(defines['MAP_GLID_SIZE'])
HEART=int(defines['PLAYER_STATUS_HP_HEART_MAX'])
assert GRID==45 and HEART==4 and int(defines['PLAYER_STATUS_HP_MAX_VALUE'])==40
items={u32(r,0):g[0] for r,g in table('item')[1]}
flags={u32(r,0):g[0] for r,g in table('gameflag')[1]}

# attack.dat: id, enumName, comment, addPower, ratePower, knockback (f32), stan (frames) — exe field order.
attacks={}
for r,g in table('attack')[1]:
    w=struct.unpack_from(f'<{len(r)//4}I',r)
    attacks[w[0]]=dict(id=g[0],add=w[6],rate=w[7],knockback=struct.unpack_from('<f',r,32)[0],stun_frames=w[9])
attack_by_name={a['id']:a for a in attacks.values()}

# creature.dat (CreatureData serializer order): the script name, then entry, arg, moveSpeed,
# moveInfo, popCategory/Min/Max, popRate[4], on/off flag lists, popCondGameValue, popTime,
# weather lists, popAnchorName, popGimmickLayer, isHidingPop, popCond script, isPopDaily,
# isPopCollision, poopAnchorName, poopItemID, vanishTime, isActiveVanishOff, hp, power, ...
ct,creature_rows=table('creature')
pool=ct.string_pool
def creature(r,g):
    w=struct.unpack_from(f'<{len(r)//4}I',r)
    S=lambda i: pool[w[i]:w[i]+w[i+1]].decode()
    i=next(k for k in range(34,60) if w[k] and w[k]<len(pool) and pool[w[k]-1:w[k]]==b'\0' and S(k).startswith('ai_'))
    d=dict(id=g[0],ja=g[1],zh_hant=g[5],script=S(i)); i+=2
    i+=4  # scriptEntry, scriptArg
    d['move_speed']=round(struct.unpack_from('<f',r,i*4)[0],2); i+=1+6
    i+=1; d['pop_count']=[w[i],w[i+1]]; i+=2+4
    n=w[i]; d['on_flags']=[flags.get(w[i+1+2*j],w[i+1+2*j]) for j in range(n)]; i+=1+2*n
    n=w[i]; d['off_flags']=[flags.get(w[i+1+2*j],w[i+1+2*j]) for j in range(n)]; i+=1+2*n
    i+=4; d['pop_time']=S(i); i+=2
    for _ in range(2): n=w[i]; i+=1+2*n
    n=w[i]; d['anchors']=[S(i+1+2*j) for j in range(n)]; i+=1+2*n
    n=w[i]; i+=1+2*n
    d['hiding_pop']=bool(w[i]); i+=1
    d['condition_script']=S(i); i+=4
    d['daily']=bool(w[i]); i+=2
    n=w[i]; i+=1+2*n
    i+=2; d['vanish_time']=S(i); i+=2
    d['hp'],d['power']=w[i+1],w[i+2]
    d['drop_words']=[x for x in w[i+6:i+39] if x]
    d['body_slam']=attacks.get(w[-13],{}).get('id')
    return d
creatures={g[0]:creature(r,g) for r,g in creature_rows if g[0].startswith('CREATURE_ID_HORROR_') and any(s.startswith('ai_') for s in g)}
creature_by_num={u64(r,0):g[0] for r,g in creature_rows}

def damage(power,attack):
    """HP lost to one hit (exe 0x1400ed077); four HP make one heart."""
    product=power*attack['rate']
    base=0 if product==0 else 1 if product<200 else product//100
    return base+attack['add']

# placementhorror.dat: [id, enum, comment, conditions, dayPopMin, dayPopMax, isAnchor, popAnchorName,
# horrorInfo[] {name, creature id}], version, region, product, platform.
ht,horror_rows=table('placementhorror')
def S(w,i): return ht.string_pool[w[i]:w[i]+w[i+1]].decode()
tables={}
for r,_ in horror_rows:
    w=struct.unpack_from(f'<{len(r)//4}I',r)
    n=w[12]
    members=[creature_by_num[w[15+4*k]|w[16+4*k]<<32] for k in range(n)]
    tables[w[0]]=dict(table=w[0],code=S(w,2),label=S(w,4),conditions=w[6],count=[w[7],w[8]],anchor=S(w,10) if w[9] else None,members=members)
GENERIC=['CREATURE_ID_HORROR_MOYAMOYASAN_LV3','CREATURE_ID_HORROR_KUNEKUNE','CREATURE_ID_HORROR_WANDERING_GHOST','CREATURE_ID_HORROR_WARP_GHOST','CREATURE_ID_HORROR_OBO']
for tid,label,count in ((1,'峠_汎用',[3,6]),(2,'山中_汎用',[10,15]),(3,'牧場_汎用',[25,30]),(100,'牧場_汎用_追加マップ',[25,30])):
    assert tables[tid]['label']==label and tables[tid]['count']==count and tables[tid]['members']==GENERIC,tables[tid]
assert tables[4]['members']==['CREATURE_ID_HORROR_TWO_MOUTHS_WOMAN'] and tables[4]['anchor']=='pop_twoMouthsWoman' and tables[4]['count']==[2,3]
assert tables[5]['members']==['CREATURE_ID_HORROR_BLOCKAGE_PLANE'] and tables[5]['anchor']=='pop_planeBlockage' and tables[5]['count']==[2,4]
assert tables[7]['members']==['CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE'] and tables[7]['count']==[0,1]
assert [tables[t]['count'] for t in (8,9,10,11)]==[[1,1],[0,1],[1,1],[1,1]] and all(tables[t]['conditions']==3 and tables[t]['anchor']=='pop_planePlastersWallOne' for t in (8,9,10,11))
assert tables[15]['members']==['CREATURE_ID_HORROR_KUNEKUNE'] and tables[16]['members']==['CREATURE_ID_HORROR_OBO']
assert tables[200]['conditions']==2  # camera test table, skipped by the placement code

# Map heads: cell attribute byte 3 holds the placementhorror table id.
heads={g[0]:g[2]+'.head' for g in _string_groups(read_table(data.read_entry('data/database/map.dat'))) if g[0].startswith('MAP_ID_')}
SUB=((1,0),(0,1),(2,1),(1,2))
def head(map_id):
    b=maps.read_entry(heads[map_id])
    return zlib.decompress(b[20:]) if b.startswith(b'YKCMP_V1') else b
def cells(b):
    h=struct.unpack_from('<19I',b); start=76+h[3]*72
    assert start+h[12]*112<=len(b)
    out=defaultdict(list)
    for i in range(h[12]):
        x,y=struct.unpack_from('<ii',b,start+i*112)
        for q,(dx,dy) in enumerate(SUB):
            v=b[start+i*112+80+q*8+3]
            if v: out[v].append(((2*x+dx)*GRID,(2*y+dy)*GRID))
    return out
def anchors(b,prefix):
    return [dict(anchor=m[1].decode(),x=struct.unpack_from('<i',b,m.start()+32)[0],y=struct.unpack_from('<i',b,m.start()+36)[0])
            for m in re.finditer(rb'('+prefix.encode()+rb'[A-Za-z0-9_]*)\x00',b)]
village=head('MAP_ID_OPENWORLD')
assert heads['MAP_ID_OPENWORLD'].endswith('map_0000_ver120_spr.ymwr.head')
for season in ('sum','aut','win'):
    other=maps.read_entry(heads['MAP_ID_OPENWORLD'].replace('_spr.',f'_{season}.'))
    other=zlib.decompress(other[20:]) if other.startswith(b'YKCMP_V1') else other
    assert {k:sorted(v) for k,v in cells(other).items()}=={k:sorted(v) for k,v in cells(village).items()},season
village_cells=cells(village)
assert {k:len(v) for k,v in village_cells.items()}=={1:18,2:60,3:3884,4:8,5:12,7:4,8:8,9:4,100:1550},{k:len(v) for k,v in village_cells.items()}
side={m:cells(head(m)) for m in ('MAP_ID_BUSHAREA','MAP_ID_LOST_FOREST','MAP_ID_MOUNTAIN_PASS','MAP_ID_SUBWAY')}
assert {m:{k:len(v) for k,v in c.items()} for m,c in side.items()}=={'MAP_ID_BUSHAREA':{4:2,15:4,16:8},'MAP_ID_LOST_FOREST':{4:2},'MAP_ID_MOUNTAIN_PASS':{},'MAP_ID_SUBWAY':{}}

BLOCK=4*GRID  # coarsen subcells into 4×4-tile blocks for the page
def blocks(points,min_hits=1):
    hits=defaultdict(int)
    for x,y in points: hits[(x//BLOCK*BLOCK,y//BLOCK*BLOCK)]+=1
    return [[x,y] for (x,y),n in sorted(hits.items()) if n>=min_hits]

# Area entrances: the ON lines of DEMO_ID_PLANE_GHOST_AREA_ON_* (u32 demo id, 76 bytes, 4 corner points).
demo_t,demo_rows=table('demolist')
gate_ids={u32(r,0):g[0] for r,g in demo_rows if g[0].startswith('DEMO_ID_PLANE_GHOST_AREA_')}
def gates(b):
    out=[]
    for demo,name in gate_ids.items():
        key=struct.pack('<I',demo)
        p=b.find(key)
        while p!=-1:
            pts=[struct.unpack_from('<ii',b,p+80+8*j) for j in range(4)]
            if all(abs(v)<60000 for pt in pts for v in pt):
                out.append(dict(demo=name,x=round(sum(x for x,_ in pts)/4),y=round(sum(y for _,y in pts)/4)))
            p=b.find(key,p+1)
    return out
village_gates=[g for g in gates(village) if '_ON_' in g['demo']]
assert len(village_gates)==20,len(village_gates)
assert {g['demo'] for g in gates(head('MAP_ID_BUSHAREA'))}=={'DEMO_ID_PLANE_GHOST_AREA_ON_22','DEMO_ID_PLANE_GHOST_AREA_OFF_22'}
assert {g['demo'] for g in gates(head('MAP_ID_LOST_FOREST'))}=={'DEMO_ID_PLANE_GHOST_AREA_ON_21','DEMO_ID_PLANE_GHOST_AREA_OFF_21'}
AREAS={'pass_road':[1],'mountain':[2],'farm':[3],'added_farm':[100]}
def distance(gate,key): return min(((x-gate['x'])**2+(y-gate['y'])**2)**.5 for t in AREAS[key] for x,y in village_cells[t])
area_gates=defaultdict(list)
for g in sorted(village_gates,key=lambda g:g['demo']):
    key=min(AREAS,key=lambda k:distance(g,k))
    area_gates[key].append(dict(x=g['x'],y=g['y']))
assert {k:len(v) for k,v in area_gates.items()}=={'mountain':12,'pass_road':3,'farm':4,'added_farm':1},dict(area_gates)

def strip(points): return [dict(x=p['x'],y=p['y']) for p in points]
two_mouths=anchors(village,'pop_twoMouthsWoman')
routes=anchors(village,'move_twoMouthsWoman')
assert len(two_mouths)==4 and len(routes)==9
blockage=anchors(village,'pop_planeBlockage')
face=anchors(village,'pop_planePlastersWallFace')
wall_one=anchors(village,'pop_planePlastersWallOne')
assert len(blockage)==6 and len(face)==2 and len(wall_one)==19 and not anchors(village,'pop_planePlastersWallHead')
wall_groups=defaultdict(list)
for a in wall_one: wall_groups[a['anchor'][len('pop_planePlastersWallOne'):][:2]].append(a)
assert sorted(wall_groups)==['00','01','02','03','04','05']
# Lottery slot 0 (table 8, always 1) covers groups 00/01/02/05; slot 1 (table 9, 0–1) covers 03/04.
def group_cells(t): return {k for k,g in wall_groups.items() if any(abs(a['x']-x)<=90 and abs(a['y']-y)<=90 for a in g for x,y in village_cells[t])}
assert group_cells(8)=={'00','01','02','05'} and group_cells(9)=={'03','04'},(group_cells(8),group_cells(9))
# Anchored tables: every anchor sits next to its own table's cells, all inside the 山中 area.
for t,points in ((4,two_mouths),(5,blockage),(7,face)):
    assert all(min(abs(a['x']-x)+abs(a['y']-y) for x,y in village_cells[t])<=180 for a in points),t
mx=[x for x,_ in village_cells[2]]; my=[y for _,y in village_cells[2]]
assert all(min(mx)<=a['x']<=max(mx) and min(my)<=a['y']<=max(my) for a in two_mouths+blockage+face+wall_one)
kunekune=anchors(village,'pop_kunekune'); whelk=anchors(village,'pop_whelk')
assert len(kunekune)==15 and len(whelk)==15

# Behaviour constants, checked against the reviewed scripts.
def has(name,*values):
    k=consts(name)
    missing=[v for v in values if v not in k]
    assert not missing,(name,missing)
has('mapevent_latenight_area','TIME_ZONE_LATE_NIGHT','GAME_FLAG_LATENIGHT_PLANE_GHOST_AREA','EventSetPlacementPlaneGhost','MapGetAreaID','CreatureSearchPlaneGhostList','vanishCreature')
has('event_check_late_night','EventAddHorrorPlacement','EventSetReplacementCreature','CROPS_ID_OBJECT_STONE','CREATURE_ID_HORROR_WALKING_STONE','HORROR_WALKING_STONE_POP_MAX','EventSetReplacementObject')
has('ai_creature_horror_moyamoyasan_lv3','slipfield',400,600,180,'hide','walk_near_player','CreatureDropItem')
has('ai_creature_horror_kunekune','SLIP_DIST',4,'slipfield')
has('ai_creature_horror_wandering_ghost','viewDistance',7,'viewAngle',60,'viewRadius',10,'TRACK_MOVE_SPEED',2,'LOST_FRAME',900,'PRE_LOST_FRAME',120,'hide','CreatureVanish')
has('ai_creature_horror_warp_ghost','WAIT_FRAME',300,6,'hide','MAP_ID_OPENWORLD','GAME_FLAG_LATENIGHT_PLANE_GHOST_AREA','CreatureVanish')
has('ai_creature_horror_obo','viewRadius',7,'LIGHT_HIT_MOVE_SPEED',0.4,'LIGHT_HIT_DEAD_FRAME',420,'PRE_LOST_FRAME',180)
has('ai_creature_horror_two_mouths_woman','WAIT_FRAME',240,'move_%s%s_','UnitRouteWalkWait','hour',5)
has('ai_creature_horror_blockage_plane','LIFESPAN_FRAME',360,'pop_planeBlockage','hour',5)
has('ai_creature_horror_plastered_wall_face','ATTACK_ID_ENEMY_HORROR_KNOCK_DOWN','pop_planePlastersWallFace','hour',5)
has('ai_creature_horror_plastered_wall_one','hour',5)
has('ai_creature_horror_whelk','LIFESPAN_FRAME',3600,'ITEM_ID_OBJECT_RIVER_SNAIL','CMD_INTERACTION_PICK_UP',6)
has('ai_creature_horror_walking_stone','CROPS_ID_OBJECT_WALKING_STONE',3,8,'MapPosIsInScreen')
has('ai_creature_horror_treasure_box','ATTACK_FEATURE_ID_ARROW',300,'GameDropTreasureBox')
assert int(defines['HORROR_WALKING_STONE_POP_MAX'])==5 and int(defines['PLAYER_ST_SLIPDAMAGE_INTERVAL'])==60

effect_t,effect_rows=table('gameeffect')
slip=next(g for r,g in effect_rows if u32(r,0)==30000101)
assert slip[0]=='GAME_EFFECT_ID_ST_DOWN_FIELD' and 'スタミナ' in slip[9]

# 歩く石 drops: cropsharvest.dat rolls (item, action, min, max, independent chance %) per pickaxe hit.
crops={g[0]:u32(r,0) for r,g in table('crops')[1]}
walking_drops=[]
for r,_ in table('cropsharvest')[1]:
    if u32(r,0)==crops['CROPS_ID_OBJECT_WALKING_STONE']:
        w=struct.unpack_from(f'<{len(r)//4}I',r)
        walking_drops=[dict(item=items[w[9+11*i]],min=w[14+11*i],max=w[15+11*i],chance=w[16+11*i]) for i in range(w[8])]
assert len(walking_drops)==11 and walking_drops[0]==dict(item='ITEM_ID_OBJECT_STONE',min=1,max=3,chance=40),walking_drops

MONSTERS=['CREATURE_ID_HORROR_MOYAMOYASAN_LV3','CREATURE_ID_HORROR_KUNEKUNE','CREATURE_ID_HORROR_WANDERING_GHOST','CREATURE_ID_HORROR_WARP_GHOST','CREATURE_ID_HORROR_OBO',
          'CREATURE_ID_HORROR_TWO_MOUTHS_WOMAN','CREATURE_ID_HORROR_BLOCKAGE_PLANE','CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE','CREATURE_ID_HORROR_PLASTERED_WALL_ONE',
          'CREATURE_ID_HORROR_WHELK','CREATURE_ID_HORROR_WALKING_STONE','CREATURE_ID_HORROR_TREASURE_BOX']
def display(name):
    """creature.dat names carry editor suffixes for the field variants (_プレーン / _平面, _顔, _1マス)."""
    name=re.sub(r'_?(プレーン|平面)$','',name)
    return re.sub(r'_(顔|臉|1マス|1格)$',r'（\1）',name)
assert display('塗り壁_顔_プレーン')=='塗り壁（顔）' and display('擋路妖_平面')=='擋路妖' and display('塗壁_1格')=='塗壁（1格）'
SCRIPT_ATTACK={'CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE':'ATTACK_ID_ENEMY_HORROR_KNOCK_DOWN'}
monsters={}
for key in MONSTERS:
    c=creatures[key]
    assert not c['drop_words'],(key,c['drop_words'])
    attack=SCRIPT_ATTACK.get(key) or c['body_slam']
    hit=None
    if attack:
        a=attack_by_name[attack]
        hp=damage(c['power'],a)
        hit=dict(attack=attack,hp=hp,hearts=hp/HEART,knockback=round(a['knockback']),stun_frames=a['stun_frames'])
    monsters[key]=dict(ja=display(c['ja']),zh_hant=display(c['zh_hant']),script=c['script'],hp=c['hp'],power=c['power'],move_speed=c['move_speed'],
                       pop_time=c['pop_time'],vanish_time=c['vanish_time'],on_flags=c['on_flags'],hit=hit)
expected={'CREATURE_ID_HORROR_MOYAMOYASAN_LV3':('たたずむ霊','佇立靈',1,4),'CREATURE_ID_HORROR_KUNEKUNE':('くねくね','扭扭妖',0,1),
          'CREATURE_ID_HORROR_WANDERING_GHOST':('うろうろお化け','徘徊妖怪',0,1),'CREATURE_ID_HORROR_WARP_GHOST':('ワープお化け','瞬移妖怪',0,3),
          'CREATURE_ID_HORROR_OBO':('オボ','歐柏妖',0,2),'CREATURE_ID_HORROR_TWO_MOUTHS_WOMAN':('二口女','二口女',0,4)}
for key,(ja,tc,hp,hit) in expected.items():
    m=monsters[key]
    assert (m['ja'],m['zh_hant'],m['hp'],m['hit']['hp'])==(ja,tc,hp,hit),(key,m)
assert monsters['CREATURE_ID_HORROR_TWO_MOUTHS_WOMAN']['hit']['attack']=='ATTACK_ID_ENEMY_HORROR_PUSH'
assert monsters['CREATURE_ID_HORROR_PLASTERED_WALL_FACE_PLANE']['hit']=={'attack':'ATTACK_ID_ENEMY_HORROR_KNOCK_DOWN','hp':1,'hearts':0.25,'knockback':16,'stun_frames':100}
assert monsters['CREATURE_ID_HORROR_PLASTERED_WALL_ONE']['hit'] is None
assert monsters['CREATURE_ID_HORROR_WHELK']['on_flags']==['GAME_FLAG_STORY_01_END']
assert creatures['CREATURE_ID_HORROR_BLOCKAGE']['on_flags']==['GAME_FLAG_STORY_01_069'] and creatures['CREATURE_ID_HORROR_BLOCKAGE']['off_flags']==['GAME_FLAG_STORY_01_076']

# Story bosses: created only by chapter scripts, never by a night table.
bosses=[]
for key,story,map_id in (('CREATURE_ID_HORROR_ITSUMADE','story_05_01','MAP_ID_LOST_FOREST'),('CREATURE_ID_HORROR_NUE','story_05_02','MAP_ID_MOUNTAIN_PASS'),
                         ('CREATURE_ID_HORROR_FIGURE','story_05_03','MAP_ID_BUSHAREA'),('CREATURE_ID_HORROR_SPOTTED_DOG','story_05_03','MAP_ID_BUSHAREA'),
                         ('CREATURE_ID_HORROR_KODAMA','story_06_02','MAP_ID_BOTTOM_OF_HOLE')):
    has(story,key,map_id)
    c=creatures[key]
    assert c['pop_count']==[0xffffffff]*2 or not c['anchors'],key
    assert not any(key in t['members'] for t in tables.values()),key
    bosses.append(dict(id=key,ja=c['ja'],zh_hant=c['zh_hant'],chapter=int(story[6:8]),map=map_id))

out=dict(
    source='placementhorror.dat, creature.dat, attack.dat, cropsharvest.dat, demolist.dat, gamedefine.dat, map heads '
           +', '.join(sorted({heads[m] for m in ('MAP_ID_OPENWORLD','MAP_ID_BUSHAREA','MAP_ID_LOST_FOREST')}))+' + scripts '+', '.join(f'{k}.lub' for k in reviewed),
    script_sha256=reviewed,
    late_night_hours=[int(defines['DAY_LATE_NIGHT_START_HOUR']),int(defines['DAY_LATE_NIGHT_END_HOUR'])],
    hp_per_heart=HEART,
    grid=GRID,
    tables={str(k):v for k,v in sorted(tables.items()) if k!=200},
    areas={key:dict(tables=AREAS[key],count=tables[AREAS[key][0]]['count'],blocks=blocks(village_cells[AREAS[key][0]]),block=BLOCK,gates=area_gates[key]) for key in AREAS},
    side_areas={'bush':dict(map=heads['MAP_ID_BUSHAREA'],tables=sorted(side['MAP_ID_BUSHAREA'])),'lost_forest':dict(map=heads['MAP_ID_LOST_FOREST'],tables=sorted(side['MAP_ID_LOST_FOREST']))},
    map_points=dict(
        two_mouths_woman=strip(sorted(two_mouths,key=lambda a:a['anchor'])),
        two_mouths_route=strip(sorted(routes,key=lambda a:a['anchor'])),
        blockage=strip(sorted(blockage,key=lambda a:a['anchor'])),
        wall_face=strip(sorted(face,key=lambda a:a['anchor'])),
        wall_one_always=strip(a for k in ('00','01','02','05') for a in sorted(wall_groups[k],key=lambda a:a['anchor'])),
        wall_one_sometimes=strip(a for k in ('03','04') for a in sorted(wall_groups[k],key=lambda a:a['anchor'])),
        whelk=strip(sorted(whelk,key=lambda a:a['anchor'])),
    ),
    wall_one_groups=dict(always=4,sometimes=2),
    behaviour=dict(
        moyamoya_slip_radius=400,moyamoya_give_up_distance=600,moyamoya_give_up_frames=180,kunekune_slip_tiles=4,slip_interval_frames=int(defines['PLAYER_ST_SLIPDAMAGE_INTERVAL']),
        wandering_sight_tiles=7,wandering_sight_angle=60,wandering_track_tiles=10,wandering_lost_frames=900,
        warp_wait_frames=300,warp_count=6,obo_sight_tiles=7,obo_light_frames=420,obo_lost_frames=180,obo_light_speed=0.4,
        two_mouths_wait_frames=240,blockage_frames=360,whelk_sight_tiles=6,whelk_lifespan_frames=3600,
        walking_stone_max=int(defines['HORROR_WALKING_STONE_POP_MAX']),walking_stone_hits=[3,8],treasure_box_sense=300,
    ),
    monsters=monsters,
    walking_stone_drops=walking_drops,
    whelk_item='ITEM_ID_OBJECT_RIVER_SNAIL',
    story_bosses=bosses,
)
Path('data/sources/game-night-monsters.json').write_text(json.dumps(out,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
print({k:len(v['blocks']) for k,v in out['areas'].items()},{k:len(v) for k,v in out['map_points'].items()})
