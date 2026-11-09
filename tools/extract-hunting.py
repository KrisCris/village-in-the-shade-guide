"""Extract the hunted animals: daily spawn tables and spots, reactions, escape holes, license fences.

Traced by hand from the scripts below (hashes in `reviewed`) and village.exe; re-trace when a hash changes.
- event_check_daily: after the player sleeps, GameAddDay then GameDailyUpdate (village.exe 0x14048D460),
  which calls 0x1402BC150; that calls the hunting placement 0x1402C4900 (single call site 0x1402BE706).
- 0x1402C4900 walks placementcreature.dat. A table's spawn spots are the map cells whose attribute byte 2
  (cell + 80 + subcell * 8 + 2) holds the table id (CMapArea::getPlacementCreatureTableList, lambda
  0x1401D5570), one spot per subcell. The rows are tried in order while free spots remain: a row for another
  season is skipped, a row with isCheckProbability needs rand(100) < probability, the count is
  RandomRange(dayPopMin, dayPopMax) and each animal takes a random free spot. Earlier rows fill spots first.
- creature.dat: every hunted animal has vanishTime 20:00 and drops its own certificate at 100%; the pop
  anchors it names (pop_<animal>) are not on the map, so only the table spots place them.
- ai_creature_hunting_template: a hit sends the animal to `escape` (unless it is walking into a trap); a
  defeat drops the certificate only when the license flag is set (otherwise LOG_NO_HUNTING_LICENSE), then the
  animal runs off (`escape2`; the pheasant flies) and is removed. `escape2` path-finds (UnitStatusSearchRoute)
  to the open world's escape holes one by one at 5× run speed until a route works; with none it fades out
  over 30 frames where it stands. `escape` clears MAP_COLLISION_MASK_ESCAPE,
  looks for a GIMMICK_ID_CREATURE_ESCAPE_ROUTE in a ±1024 square whose back/posIN it can reach in a straight
  line, runs away from the player (UnitGetEscapeVec) until it finds one, runs to it and gives up beyond 2048.
  A pheasant still escaping after 300 frames takes off (state_flyesc) and is removed.
- gimmick_creature_escape_route: a defeated animal touching the `back` part is removed; a live one is warped
  (UnitWarpByCollision) to the fixture's `anchor`, then to a random spot 90–450 units from it
  (UnitGetRandomFanRangePos), and goes back to `idle` there.
- gimmick_hunting_license_sign_fence: the fence opens (release=1) once its tag's license flag is set.
- gimmick_box_trap / gimmick_bind_trap and the template's `lured`: with bait in a box trap, an idle animal
  inside its lure area is lured 20% of the time every 120 frames; it walks in at LURE_SPEED and turns back
  into `escape` if the player is within 384 units. A snare catches a large animal that touches it while baited.
- ai_creature_<animal>: reactions, read below and summarised in `behaviour`.
Damage: power × attack.dat ratePower, 1 when the product is below 200, else ÷100, plus addPower (exe
0x1400ED077, as in tools/extract-night-monsters.py). One heart is 4 HP.
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
from honogurashi_extractor.map_art import fixtures

ns=runpy.run_path('tools/inspect-lua54.py')
read_chunk,OPS=ns['read_chunk'],ns['OPS']
game=game_dir(__doc__)
data=FafullfsArchive.open(game/'data.dat')
maps=FafullfsArchive.open(game/'data/map_1_00.dat')
reviewed={
    'ai_creature_hunting_template':'91df5d2e37454c1a113bd7eb5b40db029512b38b386bf92cdae5b7e7f83493c4',
    'ai_creature_statemachine_template':'062cd786540a9b470b93f28683de8b9e43a3f4bbebdaf1c6be4ca8ba56a96acf',
    'ai_creature_squirrel':'18f9acb63ca5b61a1cb64ae8fd5fbe6f91449c59cecdccdd3e9846f2040686d4',
    'ai_creature_rabbit':'ed7aa35936b77301293f6e050dacf77a0d96077d0fabca3beeaf63625a2b3075',
    'ai_creature_pheasant':'25f9b2418876db2c1e1261a7b5349fc28e6d7d504332a8c9f86e88f419c6c22e',
    'ai_creature_fox':'6525875aea768106ff231f7cacad9cfbe2201cc9c8986b795877b577797ff574',
    'ai_creature_raccoon_dog':'444c543c2bee9c72a216242eebcb5bfb43cfc8b7a438b90c2c70423b3c85d1bc',
    'ai_creature_weasel':'f741d23f72efbaf1e9266243039739536da0d4fd2f685993527e92bc62b70c29',
    'ai_creature_boar':'8623348b5d36e82b4a56d1d5e76994e24f538c6b8e64ebbbc059aed6a7486b2b',
    'ai_creature_deer':'5807f38dbb831321ce9c59a0961972e5bc30aefca877ab0d7ba8a6283255e848',
    'ai_creature_bear':'f612649fda7f610593af26e3764e9b9301900f5d6fd7f8aeefd8080dd26786bf',
    'gimmick_creature_escape_route':'b2178b03b136481a5d5e3cc33d63c165c644b59d20f549cf3f53562667c6d9f2',
    'gimmick_hunting_license_sign_fence':'5519bba34777d352fa54eb265eb43dbd29863e4f37bcd4b624f95ba531485f65',
    'gimmick_box_trap':'fd8c94d19428abcf3ae16117b78cb7f5adc13e7524d59d10de662713c3baf019',
    'gimmick_bind_trap':'0a9d8e78183e0d8eb5bb35a6cc8b3704a75135ff071faa2a62e3778968a65bb0',
    'event_check_daily':'af04dad204746187dacc774e4ca898f569d6fcce535324203253234896b0e381',
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
def has(name,*values):
    k=consts(name)
    missing=[v for v in values if v not in k]
    assert not missing,(name,missing)
def lacks(name,*values):
    k={c for c in consts(name) if isinstance(c,str)}
    assert not k&set(values),(name,k&set(values))
def table(name):
    t=read_table(data.read_entry(f'data/database/{name}.dat'))
    return t,list(zip(t.records,_string_groups(t)))
u32=lambda r,o: struct.unpack_from('<I',r,o)[0]
u64=lambda r,o: struct.unpack_from('<Q',r,o)[0]
defines={g[1]:g[4] for g in _string_groups(read_table(data.read_entry('data/database/gamedefine.dat'))) if len(g)>4}
GRID=int(defines['MAP_GLID_SIZE'])
HEART=int(defines['PLAYER_STATUS_HP_HEART_MAX'])
assert GRID==45 and HEART==4
items={u32(r,0):g[0] for r,g in table('item')[1]}

# attack.dat: id, enumName, comment, addPower, ratePower, knockback (f32), stan (frames).
attacks={}
for r,g in table('attack')[1]:
    w=struct.unpack_from(f'<{len(r)//4}I',r)
    attacks[g[0]]=dict(add=w[6],rate=w[7],knockback=round(struct.unpack_from('<f',r,32)[0]))
def damage(power,attack):
    product=power*attacks[attack]['rate']
    base=0 if product==0 else 1 if product<200 else product//100
    return base+attacks[attack]['add']
assert attacks['ATTACK_ID_ENEMY_RUSH']['rate']==150 and attacks['ATTACK_ID_ENEMY_BODY_SLAM']['rate']==100
assert [attacks[f'ATTACK_ID_PLAYER_ARROW_{n}']['rate'] for n in (1,2,3)]==[100,125,150]

# creature.dat, same field walk as tools/extract-night-monsters.py.
ct,creature_rows=table('creature')
pool=ct.string_pool
ANIMALS=['SQUIRREL','RABBIT','PHEASANT','WEASEL','RACCOON_DOG','FOX','BOAR','BOAR_BIG','DEER','DEER_BIG','BEAR','BEAR_BIG']
def creature(r,g):
    w=struct.unpack_from(f'<{len(r)//4}I',r)
    S=lambda i: pool[w[i]:w[i]+w[i+1]].decode()
    i=next(k for k in range(34,60) if w[k] and w[k]<len(pool) and pool[w[k]-1:w[k]]==b'\0' and S(k).startswith('ai_'))
    d=dict(ja=g[1],en=g[2],zh_hant=g[5],script=S(i)); i+=2
    i+=4
    d['move_speed']=round(struct.unpack_from('<f',r,i*4)[0],2); i+=1+6
    i+=1; i+=2+4
    n=w[i]; i+=1+2*n
    n=w[i]; i+=1+2*n
    i+=4; d['pop_time']=S(i); i+=2
    for _ in range(2): n=w[i]; i+=1+2*n
    n=w[i]; d['anchors']=[S(i+1+2*j) for j in range(n)]; i+=1+2*n
    n=w[i]; i+=1+2*n
    i+=1
    i+=4
    d['daily']=bool(w[i]); i+=2
    n=w[i]; i+=1+2*n
    i+=2; d['vanish_time']=S(i); i+=2
    d['hp'],d['power']=w[i+1],w[i+2]
    drops=[x for x in w[i+6:i+39] if x]
    d['certificate'],d['certificate_chance']=items[drops[0]],drops[1]
    return d
creature_by_num={u64(r,0):g[0] for r,g in creature_rows}
creatures={g[0][len('CREATURE_ID_'):]:creature(r,g) for r,g in creature_rows if g[0][len('CREATURE_ID_'):] in ANIMALS}
assert sorted(creatures)==sorted(ANIMALS)
for key,c in creatures.items():
    assert c['daily'] and c['vanish_time']=='20:00' and c['pop_time']=='' and c['certificate_chance']==100,(key,c)
    assert c['certificate']=='ITEM_ID_HUNTING_CERTIFICATE_'+{'BOAR':'WILD_BOAR','BOAR_BIG':'WILD_BOAR_BOSS','DEER_BIG':'DEER_BOSS','BEAR_BIG':'BEAR_BOSS'}.get(key,key),(key,c['certificate'])
assert {k:(c['hp'],c['power']) for k,c in creatures.items()}=={'SQUIRREL':(30,0),'RABBIT':(40,1),'PHEASANT':(50,1),'WEASEL':(40,1),'RACCOON_DOG':(40,1),'FOX':(50,1),
    'BOAR':(150,3),'BOAR_BIG':(150,7),'DEER':(200,12),'DEER_BIG':(200,14),'BEAR':(500,11),'BEAR_BIG':(600,14)}

# placementcreature.dat: [id, area, enum, comment, n, huntingInfo × n {name, animal id, isPoop, isCheckProbability,
# probability, popSeason, dayPopMin, dayPopMax}], version, region, product, platform.
pt,placement_rows=table('placementcreature')
tables={}
for r,g in placement_rows:
    w=struct.unpack_from(f'<{len(r)//4}I',r)
    rows=[]
    for k in range(w[7]):
        m=w[8+10*k:18+10*k]
        poop,check,chance,season,low,high=m[4:]
        rows.append(dict(animal=creature_by_num[m[2]|m[3]<<32][len('CREATURE_ID_'):],season=season,chance=chance if check else None,count=[low,high]))
    tables[w[0]]=dict(code=g[0],label=g[1],rows=rows)
LABELS={4:'狩猟動物_リス・ウサギ',5:'狩猟動物_キジエリア',6:'狩猟動物_イタチエリア',7:'狩猟動物_タヌキエリア',8:'狩猟動物_キツネエリア',
        9:'狩猟動物_イノシシエリア',10:'狩猟動物_シカエリア',11:'狩猟動物_クマまで'}
assert {k:v['label'] for k,v in tables.items()}==LABELS,{k:v['label'] for k,v in tables.items()}
def season_rows(t,s): return [(r['animal'],r['chance'],r['count']) for r in tables[t]['rows'] if r['season']==s]
for s in range(4):
    assert season_rows(4,s)==[('RABBIT',5,[0,1]),('SQUIRREL',None,[1,5])]
    assert season_rows(5,s)==[('SQUIRREL',None,[0,3]),('PHEASANT',None,[0,3]),('RABBIT',None,[0,3])]
    assert season_rows(6,s)==[('SQUIRREL',20,[0,2]),('RABBIT',20,[0,2]),('WEASEL',None,[0,2])]
    assert season_rows(8,s)==[('PHEASANT',20,[0,2]),('RACCOON_DOG',20,[0,2]),('FOX',None,[0,2])]
    assert season_rows(9,s)==[('BOAR',60,[0,1]),('BOAR_BIG',2,[0,1]),('WEASEL',None,[0,1]),('RACCOON_DOG',None,[0,1])]
    assert season_rows(10,s)==[('DEER',60,[0,1]),('DEER_BIG',2,[0,1]),('BOAR',None,[0,1]),('RACCOON_DOG',None,[0,1])]+([('FOX',None,[0,1])] if s==1 else [])
    assert season_rows(11,s)==[('BEAR_BIG',5,[1,1]),('BEAR',30,[1,1]),('DEER',None,[0,1]),('BOAR',None,[0,1])]
# The tanuki area's squirrel row is tagged spring in all four seasons, so squirrels only roll there in spring.
assert season_rows(7,0)==[('SQUIRREL',20,[0,2]),('WEASEL',20,[0,2]),('RACCOON_DOG',None,[0,2])]+[('SQUIRREL',20,[0,2])]*3
assert all(season_rows(7,s)==[('WEASEL',20,[0,2]),('RACCOON_DOG',None,[0,2])] for s in (1,2,3))

# Map cells: attribute byte 2 holds the placementcreature table id; one spawn spot per subcell, same in every season.
heads={g[0]:g[2]+'.head' for g in _string_groups(read_table(data.read_entry('data/database/map.dat'))) if g[0].startswith('MAP_ID_')}
def head(name):
    b=maps.read_entry(name)
    return zlib.decompress(b[20:]) if b.startswith(b'YKCMP_V1') else b
SUB=((1,0),(0,1),(2,1),(1,2))
def cells(b):
    h=struct.unpack_from('<19I',b); start=76+h[3]*72
    out=defaultdict(set)
    for i in range(h[12]):
        x,y=struct.unpack_from('<ii',b,start+i*112)
        for q,(dx,dy) in enumerate(SUB):
            v=b[start+i*112+80+q*8+2]
            if v: out[v].add(((2*x+dx)*GRID,(2*y+dy)*GRID))
    return {k:sorted(v) for k,v in out.items()}
assert heads['MAP_ID_OPENWORLD'].endswith('map_0000_ver120_spr.ymwr.head')
village=head(heads['MAP_ID_OPENWORLD'])
spots=cells(village)
for season in ('sum','aut','win'):
    assert cells(head(heads['MAP_ID_OPENWORLD'].replace('_spr.',f'_{season}.')))==spots,season
assert {k:len(v) for k,v in spots.items()}=={4:6,5:7,6:2,7:2,8:2,9:1,10:1,11:1},{k:len(v) for k,v in spots.items()}
for name,h in heads.items():
    if name=='MAP_ID_OPENWORLD': continue
    try: other=head(h)
    except Exception: continue
    assert not cells(other),name

# Map anchors (name, then x/y at +32) and the placed gimmicks.
def anchors(prefix):
    return {m[1].decode():dict(x=struct.unpack_from('<i',village,m.start()+32)[0],y=struct.unpack_from('<i',village,m.start()+36)[0])
            for m in re.finditer(rb'('+prefix.encode()+rb'[A-Za-z0-9_]*)\x00',village)}
assert not any(anchors(a) for c in creatures.values() for a in c['anchors'])
exits=anchors('escape_')
assert sorted(exits)==[f'escape_00{n}' for n in range(1,6)],sorted(exits)
gt=read_table(data.read_entry('data/database/gimmick.dat'))
gimmick={u32(r,0):g[0] for r,g in zip(gt.records,_string_groups(gt))}
placed=[dict(f,gimmick=gimmick[f['id']]) for f in fixtures(village) if f['id'] in gimmick]
# Fixture parameter strings (anchor / tag), read from the 208-byte fixture records like tools/extract-map-markers.py.
header=struct.unpack_from('<19I',village)
start=76+header[3]*72+header[12]*112+header[8]*84+header[9]*56+header[10]*48
params=defaultdict(list)
for i in range(header[11]):
    raw=village[start+i*208:start+i*208+208]
    gid=struct.unpack_from('<i',raw,0)[0]
    if gimmick.get(gid) in ('GIMMICK_ID_CREATURE_ESCAPE_ROUTE','GIMMICK_ID_HUNTING_LICENSE_SIGN_FENCE'):
        params[(gimmick[gid],*struct.unpack_from('<2i',raw,4))]=[s.decode() for s in re.findall(rb'[\x20-\x7e]{3,}',raw[40:])]
holes=[]
for f in placed:
    if f['gimmick']!='GIMMICK_ID_CREATURE_ESCAPE_ROUTE': continue
    (text,)=params[(f['gimmick'],f['x'],f['y'])]
    m=re.fullmatch(r'mapID=MAP_ID_OPENWORLD, anchor="(escape_00\d)"',text)
    holes.append(dict(x=f['x'],y=f['y'],exit=m[1]))
assert len(holes)==8 and {h['exit'] for h in holes}==set(exits),holes
WARP=[90,450]
has('gimmick_creature_escape_route','back','vanish','UnitWarpByCollision','UnitGetRandomFanRangePos',*WARP,'idle')
has('ai_creature_hunting_template','MAP_COLLISION_MASK_ESCAPE','GIMMICK_ID_CREATURE_ESCAPE_ROUTE','MapSearchStatusInRect_Gimmick','Collision2DIsBodyPassable',
    'UnitGetEscapeVec',1024,2048,300,'posIN','escape','escape2','flyesc','MAP_ID_OPENWORLD','CreatureDropItem','LOG_NO_HUNTING_LICENSE_DAMAGED','lured',384)

LICENSE_TAGS={'weasel':'WEASEL','racc1':'RACCOON_DOG','racc2':'RACCOON_DOG','pheasan':'PHEASANT','fox1':'FOX','fox2':'FOX','boar':'WILD_BOAR','deer':'DEER','deer2':'DEER','bear1':'BEAR','bear2':'BEAR'}
has('gimmick_hunting_license_sign_fence','release','LOG_NOT_PASS',*LICENSE_TAGS,*{f'GAME_FLAG_HUNTING_LICENSE_{v}' for v in LICENSE_TAGS.values()})
fences=[]
for f in placed:
    if f['gimmick']!='GIMMICK_ID_HUNTING_LICENSE_SIGN_FENCE': continue
    (tag,)=params[(f['gimmick'],f['x'],f['y'])]
    fences.append(dict(x=f['x'],y=f['y'],license='ITEM_ID_HUNTING_LICENSE_'+LICENSE_TAGS[tag]))
assert len(fences)==11 and sorted({f['license'] for f in fences})==sorted({'ITEM_ID_HUNTING_LICENSE_'+v for v in LICENSE_TAGS.values()})
lodge=[dict(x=f['x'],y=f['y']) for f in placed if f['gimmick']=='GIMMICK_ID_ARCHITECTURE_HUNTINGLODGE_01']
assert len(lodge)==1

# Behaviour constants checked against the reviewed scripts.
has('event_check_daily','GameAddDay','GameDailyUpdate')
lacks('ai_creature_squirrel','ATTACK_ID_ENEMY_BODY_SLAM','ATTACK_ID_ENEMY_RUSH')
has('ai_creature_rabbit','aleart_sensor',400,180,600,'dodgeDamage','ATTACK_ID_PLAYER_ARROW_1','ATTACK_ID_PLAYER_ARROW_2','ATTACK_ID_PLAYER_ARROW_3')
lacks('ai_creature_rabbit','ATTACK_ID_ENEMY_BODY_SLAM','ATTACK_ID_ENEMY_RUSH')
has('ai_creature_pheasant','BACKHOME_TIME','CREATURE_PHEASANT_BACKHOME_TIME','state_flyesc','ATTACK_ID_PLAYER_ARROW_1')
lacks('ai_creature_pheasant','ATTACK_ID_ENEMY_BODY_SLAM','ATTACK_ID_ENEMY_RUSH')
has('ai_creature_fox','ATTACK_ID_ENEMY_BODY_SLAM','attack_sensor',800,1000,3,2,30,'dodgeDamage')
has('ai_creature_raccoon_dog','ATTACK_ID_ENEMY_BODY_SLAM',2000,2,3,'ATTACK_ID_PLAYER_ARROW_1')
has('ai_creature_weasel','ATTACK_ID_ENEMY_BODY_SLAM','aiming_sensorCheck',180,60,3)
has('ai_creature_boar','ATTACK_ID_ENEMY_RUSH',2000,5,50,'HPCheck')
has('ai_creature_deer','ATTACK_ID_ENEMY_BODY_SLAM','aiming_sensorCheck',350,150,1000,10,5,50,180,'dodgeDamage')
has('ai_creature_bear','ATTACK_ID_ENEMY_RUSH',2000,5)
assert int(defines['CREATURE_PHEASANT_BACKHOME_TIME'])==15
for key in ('GIMMICK_TRAP_PLACEMENT_MAX','GIMMICK_BOX_TRAP_USE_COUNT_MAX','GIMMICK_BIND_TRAP_USE_COUNT_MAX'): assert key in defines
has('gimmick_box_trap','CREATURE_FEATURE_CAPTURE_BOX_TRAP','bait','Random',20,120,'lured','ITEM_ID_WILD_HUNTING_BAIT')
has('gimmick_bind_trap','CREATURE_FEATURE_CAPTURE_BIND_TRAP','bait','captured','ITEM_ID_WILD_HUNTING_BAIT')

ATTACK={'WEASEL':'ATTACK_ID_ENEMY_BODY_SLAM','RACCOON_DOG':'ATTACK_ID_ENEMY_BODY_SLAM','FOX':'ATTACK_ID_ENEMY_BODY_SLAM','BOAR':'ATTACK_ID_ENEMY_RUSH','BOAR_BIG':'ATTACK_ID_ENEMY_RUSH',
        'DEER':'ATTACK_ID_ENEMY_BODY_SLAM','DEER_BIG':'ATTACK_ID_ENEMY_BODY_SLAM','BEAR':'ATTACK_ID_ENEMY_RUSH','BEAR_BIG':'ATTACK_ID_ENEMY_RUSH'}
animals={}
for key in ANIMALS:
    c=creatures[key]
    hit=None
    if key in ATTACK:
        hp=damage(c['power'],ATTACK[key])
        hit=dict(attack=ATTACK[key],hp=hp,hearts=hp/HEART,knockback=attacks[ATTACK[key]]['knockback'])
    license=dict(BOAR='WILD_BOAR',BOAR_BIG='WILD_BOAR',DEER_BIG='DEER',BEAR_BIG='BEAR').get(key,key)
    animals[key]=dict(ja=c['ja'],en=c['en'],zh_hant=c['zh_hant'],script=c['script'],hp=c['hp'],power=c['power'],move_speed=c['move_speed'],
                      license='ITEM_ID_HUNTING_LICENSE_'+license,certificate=c['certificate'],hit=hit)
    has(c['script'],f'GAME_FLAG_HUNTING_LICENSE_{license}')
assert [animals[k]['hit']['hp'] for k in ('BOAR','BOAR_BIG','DEER','DEER_BIG','BEAR','BEAR_BIG','FOX')]==[4,10,12,14,16,21,1]

out=dict(
    source='placementcreature.dat, creature.dat, attack.dat, gimmick.dat, gamedefine.dat, village.exe 0x1402C4900, map head '
           +heads['MAP_ID_OPENWORLD']+' + scripts '+', '.join(f'{k}.lub' for k in reviewed),
    script_sha256=reviewed,
    hp_per_heart=HEART,
    grid=GRID,
    vanish_time='20:00',
    pheasant_home_hour=int(defines['CREATURE_PHEASANT_BACKHOME_TIME']),
    tables={str(k):dict(code=v['code'],rows=v['rows'],spots=[dict(x=x,y=y) for x,y in spots[k]]) for k,v in sorted(tables.items())},
    escape=dict(search=1024,give_up=2048,warp=WARP,pheasant_takeoff_frames=300,holes=holes,exits={k:exits[k] for k in sorted(exits)}),
    fences=fences,
    lodge=lodge[0],
    traps=dict(placement_max=int(defines['GIMMICK_TRAP_PLACEMENT_MAX']),box_uses=int(defines['GIMMICK_BOX_TRAP_USE_COUNT_MAX']),bind_uses=int(defines['GIMMICK_BIND_TRAP_USE_COUNT_MAX']),
               lure_chance=20,lure_frames=120,lure_flee_distance=384),
    behaviour=dict(rabbit_alert=400,fox_alert_minutes=30,fox_backoff=800,fox_reset=1000,raccoon_reset=2000,weasel_aim_frames=180,
                   boar_flee_hp=50,large_reset=2000,deer_flee_attacks=10,deer_flee_hits=5,deer_reset=1000,deer_aim_frames=180),
    animals=animals,
)
Path('data/sources/game-hunting.json').write_text(json.dumps(out,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
print({k:len(v['spots']) for k,v in out['tables'].items()},len(holes),len(fences))
