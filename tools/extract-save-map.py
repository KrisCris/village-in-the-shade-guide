"""Read-only save-map terrain catalog. Shares the verified YMWR layout with extract-farmland.py."""
import argparse
import re
import json
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.gimmick import gimmick_features
from honogurashi_extractor.map_art import FairyBank
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.localization import localized_block

parser = argparse.ArgumentParser(description=__doc__)
add_game_dir(parser)
parser.add_argument('--output', type=Path, default=Path('data/sources/game-save-map.json'))
args = parser.parse_args()
game = args.game_dir
data = FafullfsArchive.open(game / 'data.dat')
maps = FafullfsArchive.open(game / 'data/map_1_00.dat')
u32 = lambda b, o: struct.unpack_from('<I', b, o)[0]
u64 = lambda b, o: struct.unpack_from('<Q', b, o)[0]
table = lambda name: read_table(data.read_entry('data/database/' + name + '.dat'))
origins = {}
for row in table('mapgroup').records:
    if u64(row, 0) != 1:
        continue
    for i in range(u32(row, 32)):
        o = 36 + i * 16
        origins[u64(row, o)] = [u32(row, o + 8), u32(row, o + 12)]
# Historical build24969282 isPlacementGimmick 0x1401db250 selects mapgroundelement trap/fishing masks by category.
placement_masks = {kind: 0 for kind in range(1,6)}
for r in table('mapgroundelement').records:
    kind=u32(r,60)
    if kind in placement_masks: placement_masks[kind] |= u64(r,24)
def compact_mask(m):
    return (m & 199) | (128 if m & (3 << 32) else 0) | sum(bit for kind,bit in [(3,256),(2,512),(1,1024),(5,2048)] if m & placement_masks[kind]) | (4096 if m & (1<<40) else 0)
crop_rules = {}
for r in table('crops').records:
    cursor=84
    for width in (4,4,4): cursor += 4+width*u32(r,cursor)
    count=u32(r,cursor); cursor+=4
    crop_rules[str(u64(r,0))] = dict(soils=[u64(r,cursor+i*8) for i in range(count)])
scenes = []
for row, strings in zip(table('map').records, _string_groups(table('map')), strict=True):
    mid = u64(row, 0)
    if mid not in origins:
        continue
    if not any(k in strings[0] for k in ['OPENWORLD', 'MYHOUSE', 'GREENHOUSE', 'LIVESTOCK_HOUSE', 'AVIARY', 'BARN']):
        continue
    path = strings[2] + '.head'
    try:
        blob = maps.read_entry(path)
    except KeyError:
        continue
    if blob.startswith(b'YKCMP_V1'):
        blob = zlib.decompress(blob[20:])
    header = struct.unpack_from('<19I', blob)
    assert header[4:6] == (0, 0)
    start = 76 + header[3] * 72
    assert start + header[12] * 112 <= len(blob)
    cells = {}
    for i in range(header[12]):
        offset = start + i * 112
        x, y = struct.unpack_from('<ii', blob, offset)
        for index, (dx, dy) in enumerate(((1, 0), (0, 1), (2, 1), (1, 2))):
            mask = u64(blob, offset + 48 + index * 8)
            X, Y = 2 * x + dx, 2 * y + dy
            key = (X, Y)
            # Keep the intersection on seams: never manufacture placement permission.
            cells[key] = cells.get(key, mask) & mask
    # Farm areas are high-word bits 36-38; the 1.2.0 additional farmland uses bit 42 (area 8).
    usable = [[x, y, compact_mask(m), (m >> 36) & 7 | (8 if m >> 42 & 1 else 0)]
              for (x, y), m in sorted(cells.items()) if compact_mask(m)]
    if usable:
        scenes.append(dict(id=mid, code=strings[0], label=strings[1], origin=origins[mid], cells=usable))
items = {i['numeric_id']: i for i in json.loads(Path('data/generated/build-25311578/entities/items.json').read_text(encoding='utf-8'))}
placements = json.loads(Path('data/sources/game-save-placements.json').read_text(encoding='utf-8'))['placements']
features = {u64(r, 0): g[0].removeprefix('GIMMICK_FEATURE_') for r,g in zip(table('gimmickfeature').records, _string_groups(table('gimmickfeature')))}
constructs = []
for r,g in zip(table('construction').records, _string_groups(table('construction'))):
    cursor = 324
    def vector():
        global cursor
        n = u32(r,cursor); cursor += 4
        result = [u64(r,cursor+i*8) for i in range(n)]; cursor += n*8
        return result
    constructs.append(dict(id=u64(r,0),code=g[0],name=g[7],nameTranslations=localized_block(g,1,7),object=u64(r,284),limit=u32(r,280),enable=vector(),disable=vector()))
anime_table = table('anime')
animes = {u64(r,0):(r,g) for r,g in zip(anime_table.records,_string_groups(anime_table))}
fairy = FafullfsArchive.open(game/'data/fairy_1_00.dat')
banks = {2:FairyBank(fairy.read_entry('data/fairy/resident.fad')),3:FairyBank(fairy.read_entry('data/fairy/resident_2.fad'))}
gt = table('gimmick')
compatibility = {}
for row in table('gimmickcompatibility').records:
    cursor = 52
    vectors = []
    for _ in range(3):
        n = u32(row,cursor); cursor += 4
        vectors.append([u64(row,cursor+i*8) for i in range(n)]); cursor += n*8
    compatibility[u64(row,0)] = dict(slot=u32(row,16),level=u32(row,20),mirror=bool(u32(row,24)),reverse=u64(row,36),upgrade=u64(row,44),requires=vectors[1],excludes=vectors[2])
objects = []
for row, strings in zip(gt.records, _string_groups(gt), strict=True):
    id = u64(row,0)
    item = items.get(u32(row, len(row) - 48))
    feature_ids, replacement = gimmick_features(row,set(features))
    fs = [features[i] for i in feature_ids]
    building = 'RELOCATION' in fs or strings[0].startswith('GIMMICK_ID_ARCHITECTURE_MYHOUSE_')
    if not item and not building:
        continue
    map_id = int(strings[strings.index('mapID') + 1]) if 'mapID' in strings else 0
    place = next((p for p in placements if p['mapId'] == map_id), {})
    family = re.sub(r'_0[1-4](?=_MIRROR$|$)', '_SLOT', strings[0]) if building else strings[0]
    family=family.replace('HOSUE','HOUSE')
    group = re.sub(r'_LV[1-4]', '', family, flags=re.I).replace('_MIRROR','')
    level_match = re.search(r'_LV([1-4])',strings[0],re.I)
    level = int(level_match[1]) if level_match else 1
    construction = next((c for c in constructs if c['object'] == id),None)
    base_id = id-id%10000 if building else id
    construction = construction or next((c for c in constructs if c['object'] == base_id),None)
    base_name = next((name for key,name in [('LIVESTOCK_HOUSE','畜舍'),('AVIARY','鸡舍'),('STABLE','马厩'),('SILO','筒仓'),('DOG_HOUSE','狗屋'),('BARN','仓库'),('GREENHOUSE','温室'),('MYHOUSE','我的家'),('LIVING_TANK','养鱼池'),('WELL','水井'),('ANVIL','铁砧'),('BIRD_BATH','鸟浴盆')] if key in strings[0]),strings[1])
    name = item['name']['zh_hans'] if item else construction['name'] if construction else base_name
    rotations = [u32(row,128+i*4) for i in range(u32(row,124))]
    # Native GimmickData serializer: angle vector, siloCapacity, inventoryCapacity.
    storage = u32(row,132+4*len(rotations))
    ar, ag = animes.get(u64(row,80),(None,None))
    bank = banks.get(u32(ar,24)) if ar else None
    shapes = {}
    if bank and ag[2] in bank.entries:
        initial = u32(row,112)
        parts = {}
        for offset in range(400,len(row)-24,4):
            start,length = struct.unpack_from('<II',row,offset)
            if length and length < 30 and start+length < len(gt.string_pool):
                text = gt.string_pool[start:start+length].decode('utf-8',errors='replace')
                if text in ('main','build_base'):
                    parts[text] = u32(row,offset+16)
        sequence = parts.get('build_base',parts.get('main',initial))
        for angle in ([0] if building else rotations or [0]):
            seq = sequence+angle if angle and sequence+angle in bank.sequence_ids(ag[2]) else sequence
            candidates = bank.shapes(ag[2],seq)
            polygons = [c['points'] for c in candidates if c['flags'] >> 16 == (6 if building else 0)]
            if building and polygons:
                # build_base's largest no-placement rectangle defines construction extent.
                polygons = [max(polygons,key=lambda ps:abs(sum(ps[i][0]*ps[(i+1)%len(ps)][1]-ps[(i+1)%len(ps)][0]*ps[i][1] for i in range(len(ps)))))]
            if u32(row,120) or strings[0]=='GIMMICK_ID_ARCHITECTURE_DOG_HOUSE': polygons = [[[-x,y] for x,y in ps] for ps in polygons]
            shapes[str(angle)] = polygons
    floor = 'TILE' in fs or 'PLACEMENT_CARPET' in fs
    category = 'building' if building else 'floor' if floor else 'machine' if any(m['id']==id for m in json.loads(Path('data/sources/game-save-machines.json').read_text(encoding='utf-8'))['machines']) else 'furniture'
    objects.append(dict(id=id,itemId=item['numeric_id'] if item else 0,name=name,code=strings[0],family=family,buildingFamily=group,slot=int(re.search(r'_0([1-4])(?:_MIRROR)?$',strings[0])[1]) if re.search(r'_0([1-4])(?:_MIRROR)?$',strings[0]) else 1,building=building,level=level,mapId=map_id,reverse=0,upgrade=0,
        requires=place.get('requires',construction['enable'] if construction else []),excludes=place.get('excludes',construction['disable'] if construction else []),
        floor=floor,features=fs,featureIds=feature_ids,rotations=rotations,storage=storage,shapes=shapes,replacement=replacement,category=category,
        limit=construction['limit'] if construction else 0,mirror=bool(u32(row,120)),script=strings[8]))
    objects[-1].update(compatibility.get(id,{}))
    if item:
        objects[-1]['nameTranslations']=item['name']['translations']
    elif construction:
        objects[-1]['nameTranslations']=construction['nameTranslations']
args.output.write_text(json.dumps(dict(source='YMWR masks; mapgroup; gimmick variable feature vector/rotation list; construction; native FAD collision polygons',scenes=scenes,objects=objects,construction=constructs,cropRules=crop_rules),ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print(f'{len(scenes)} scenes, {len(objects)} object definitions')
