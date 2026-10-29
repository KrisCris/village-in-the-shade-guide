"""Extract 樹木建設 construction orders, land purchases and their unlock conditions, read-only.

construction.dat record layout (build 25640656), verified against every row:
  0 u64 id; 248 u32 money; 252/260/268 three (u32 item, u32 count) material slots;
  276 u32 build days (CConstructionStatus keeps a days_ counter; relocations are 0);
  280 u32 count limit; 284 u64 gimmick; from 324 four counted u64 flag vectors:
  flags set on completion, flags cleared, flags required before the order is
  offered, and a fourth vector that repeats the set flags. 24 fixed bytes follow;
  the first u32 (1–4, only on livestock houses, aviaries, the stable and the anvil)
  is still unresolved, and the third is the version tag 120 on 1.2.0 rows.
Money and materials are already in entities/activities.json (CONSTRUCTION_ID_*).

Traced by hand from the scripts below (hashes pinned); re-trace when one changes.
- gimmick_land_for_sale_sign: sign01 starts EVENT_ID_FAMRLAND_EXPANSION_01, sign04
  EVENT_ID_FAMRLAND_EXPANSION_02; sign02/sign03 start whichever is still unbought.
  林 answers only while her event schedule allows and 6 <= hour < 23.
- event_farmland_expansion: each event charges FARMLAND_EXPANSION_PRICE_0N, removes
  its own sign, sets GAME_FLAG_FARMLAND_EXPANSION_0N, and removes sign02–03 once
  both are set. The two purchases do not depend on each other.
- gimmick_bundle_green_blue: finishing GAME_FLAG_BUNDLE_VILLAGE_HEAD_09 sends
  LETTER_ID_GENERAL_STORE_PURCHASE_07 and sets GAME_FLAG_SALE_START_SEED_GREENHOUSE.
- event_additional_farmland: letter, then 林's announcement at the marked spot, then
  the 1.2.0 farmland order at 樹木建設; conditions come from event.dat below.
Farm areas: terrain bits 36–38 and 42 (see extract-save-map.py). Each sign is matched
to the nearest farm area by its map position.
"""
import hashlib
import json
import math
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.gamedir import game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.localization import localized_block

game = game_dir(__doc__)
data = FafullfsArchive.open(game / 'data.dat')
maps = FafullfsArchive.open(game / 'data/map_1_00.dat')
u32 = lambda b, o: struct.unpack_from('<I', b, o)[0]
u64 = lambda b, o: struct.unpack_from('<Q', b, o)[0]
LOCALES = ('ja', 'en', 'zh-CN', 'zh-TW')
reviewed = {
    'event_farmland_expansion': '085c9f1ebb9c49cddb963fa9543f0466540988a8c2464d84724e2427d88e30ef',
    'gimmick_land_for_sale_sign': '4e3a240cb6ff0f7ad06521cb68b59950c33afd7ccb94973359c89f73e6beb750',
    'gimmick_bundle_green_blue': '5e6c602b4ae94086b06f9d9e86800da443d646422b6e43b964f5032fd0170e9c',
    'event_additional_farmland': '39a061320b1f7bc5174a4d4a49a365a53a669cf0c0813020a90282d326606d21',
}
for name, digest in reviewed.items():
    if hashlib.sha256(data.read_entry(f'data/script/{name}.lub')).hexdigest() != digest:
        raise ValueError(f'{name} changed; re-trace it before extracting')

sources = {}
def table(name):
    raw = data.read_entry(f'data/database/{name}.dat')
    sources[f'{name}.dat'] = hashlib.sha256(raw).hexdigest()
    return read_table(raw)
def texts(group, start):
    block = localized_block(group, start, 7)
    # English wraps between words; the other languages wrap mid-text.
    return {locale: block[locale].replace('\n', ' ' if locale == 'en' else '') for locale in LOCALES}

flag_table = table('gameflag')
flag_rows = {u64(r, 0): g for r, g in zip(flag_table.records, _string_groups(flag_table))}
def flag(id):
    return dict(id=id, code=flag_rows[id][0], name_ja=flag_rows[id][1])
flag_ids = {g[0]: id for id, g in flag_rows.items()}

def description(group):
    # Up to three description lines, each a 7-slot block (8, 15, 22); a line may end mid-sentence.
    lines = [texts(group, start) for start in (8, 15, 22) if len(group) >= start + 7]
    return {locale: (' ' if locale == 'en' else '').join(line[locale] for line in lines).strip() for locale in LOCALES}

constructions = []
t = table('construction')
for r, g in zip(t.records, _string_groups(t), strict=True):
    cursor = 324
    vectors = []
    for _ in range(4):
        n = u32(r, cursor); cursor += 4
        vectors.append([u64(r, cursor + i * 8) for i in range(n)]); cursor += n * 8
    assert len(r) - cursor == 24, g[0]
    sets, clears, requires, repeats = vectors
    assert not repeats or repeats == sets, g[0]
    code = g[0].removeprefix('CONSTRUCTION_ID_')
    kind = next((k for k in ('BUILD', 'RENOVATION', 'MAKEOVER', 'RELOCATION', 'REMOVE', 'EXPANTION') if code.startswith(k)), 'BUILD')
    constructions.append(dict(
        id=f'CONSTRUCTION_ID_{code}', numeric_id=u64(r, 0), kind=kind.lower(), gimmick_id=u64(r, 284),
        days=u32(r, 276), limit=u32(r, 280), required_flags=[flag(f) for f in requires],
        sets_flags=sets, clears_flags=clears, unresolved_level=u32(r, cursor), version=u32(r, cursor + 8) or None,
        description=description(g)))

shed = next(g for g in _string_groups(table('facility')) if g[0] == 'FACILITY_ID_CONSTRUCTION_SHED')
defines = {g[1]: g[4] for g in _string_groups(table('gamedefine')) if len(g) > 4}

events = {}
t = table('event')
for r, g in zip(t.records, _string_groups(t), strict=True):
    if g[0].startswith('EVENT_ID_ADDITIONAL_FARMLAND_EXPANTION_'):
        # Counted u64 vectors at 80: flags required, then flags that block the event.
        cursor = 80
        vectors = []
        for _ in range(2):
            n = u32(r, cursor); cursor += 4
            vectors.append([u64(r, cursor + i * 8) for i in range(n)]); cursor += n * 8
        events[g[0]] = dict(name_ja=g[1], hours=g[2] or None,
            required_flags=[flag(f) for f in vectors[0]], blocked_by_flags=[flag(f) for f in vectors[1]])

# Sale signs: GIMMICK_ID_LAND_FOR_SALE_SIGN placements carry their tag 116 bytes after the id.
t = table('gimmick')
sign_id = next(u64(r, 0) for r, g in zip(t.records, _string_groups(t)) if g[0] == 'GIMMICK_ID_LAND_FOR_SALE_SIGN')
blob = maps.read_entry('data/map/map_0000_ver120_aut.ymwr.head')
sources['map_0000_ver120_aut.ymwr.head'] = hashlib.sha256(blob).hexdigest()
if blob.startswith(b'YKCMP_V1'):
    blob = zlib.decompress(blob[20:])
signs = {}
for offset in range(0, len(blob) - 128, 4):
    if u32(blob, offset) == sign_id:
        tag = blob[offset + 72:offset + 80].split(b'\0')[0].decode()
        if tag.startswith('sign'):
            signs[tag] = dict(x=u32(blob, offset + 4), y=u32(blob, offset + 8))
assert sorted(signs) == ['sign01', 'sign02', 'sign03', 'sign04'], signs
save_map = json.loads(Path('data/sources/game-save-map.json').read_text(encoding='utf-8'))
openworld = next(s for s in save_map['scenes'] if s['code'] == 'MAP_ID_OPENWORLD')
areas = {}
for x, y, mask, area in openworld['cells']:
    if mask & 1:
        areas.setdefault(area, []).append((x * 45, y * 45))
nearest = lambda x, y: min(areas, key=lambda a: min(math.dist((x, y), p) for p in areas[a]))
for sign in signs.values():
    sign['nearest_area'] = nearest(sign['x'], sign['y'])
house = next((u32(blob, o + 4), u32(blob, o + 8)) for o in range(0, len(blob) - 12, 4)
             if u32(blob, o) == 111000000 and 0 < u32(blob, o + 4) < 40000)
# The first house stands by area 1, the starting field. sign01 (5,000) sits on the
# fence between areas 1 and 2; sign04 (20,000) by area 4; area 8 is the 1.2.0 farmland.
assert nearest(*house) == 1 and signs['sign01']['nearest_area'] == 1 and signs['sign04']['nearest_area'] == 4, signs
assert sorted(areas) == [1, 2, 4, 8]
# Join game-farmland.json plots (farming axes) to the areas through the same cell rotation.
area_by_cell = {((x + y - 1) // 2, (y - x - 1) // 2): area for x, y, mask, area in openworld['cells'] if mask & 1}
farmland = json.loads(Path('data/sources/game-farmland.json').read_text(encoding='utf-8'))
plots = {}
for shape in farmland['shapes']:
    if 'MAP_ID_OPENWORLD' in shape['map_ids']:
        ox, oy = shape['origin']
        found = {area_by_cell.get((ox + x, oy + y)) for x, y in shape['cells']}
        assert len(found) == 1 and None not in found, shape['id']
        plots.setdefault(found.pop(), []).append(shape['id'])
farm_areas = [dict(area=area, stage=stage, cells=len(areas[area]), farmland_shapes=plots[area])
              for area, stage in ((1, 'start'), (2, 'expansion_1'), (4, 'expansion_2'), (8, 'additional'))]

tank = [u32(r, 16) for r in table('livingtank').records]

t = table('secretquest')
secret = next(r for r, g in zip(t.records, _string_groups(t)) if g[0] == 'SECRET_QUEST_ID_CONSTRUCTION')
# Counted list at 24 of 44-byte stages; each stage starts with the building count.
milestones = [u32(secret, 28 + 44 * i) for i in range(u32(secret, 24))]

result = dict(
    build_id='25640656',
    source='construction.dat, facility.dat, gamedefine.dat, event.dat, gameflag.dat, livingtank.dat, secretquest.dat, map_0000_ver120 head; hand-traced scripts listed in tools/extract-construction.py',
    sha256=dict(sorted(sources.items())), scripts=reviewed,
    shop=dict(facility_id='FACILITY_ID_CONSTRUCTION_SHED', hours=texts(shed, 8), closed=texts(shed, 15),
              unlock_flag=flag(flag_ids['GAME_FLAG_STORY_01_031_05'])),
    constructions=constructions,
    farmland_expansion=dict(
        prices=[int(defines['FARMLAND_EXPANSION_PRICE_01']), int(defines['FARMLAND_EXPANSION_PRICE_02'])],
        call_hours=[6, 23], signs=signs, farm_areas=farm_areas),
    additional_farmland=events,
    greenhouse_seed_flag=flag(flag_ids['GAME_FLAG_SALE_START_SEED_GREENHOUSE']),
    living_tank_item_numeric_ids=tank,
    construction_milestones=milestones,
)
Path('data/sources/game-construction.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'constructions: {len(constructions)}; signs: {len(signs)}; tank fish: {len(tank)}')
