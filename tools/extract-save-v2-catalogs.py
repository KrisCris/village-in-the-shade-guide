"""Reproduce v2 editor catalogs from read-only game archives. Never touches saves."""
import argparse
import json
import re
import struct
from pathlib import Path
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.icons import _table_string
from honogurashi_extractor.probe import _string_groups

p = argparse.ArgumentParser()
add_game_dir(p)
p.add_argument('--output-dir', required=True, type=Path)
a = p.parse_args()
archive = FafullfsArchive.open(a.game_dir / 'data.dat')
u32 = lambda row, offset: struct.unpack_from('<I', row, offset)[0]
u64 = lambda row, offset: struct.unpack_from('<Q', row, offset)[0]
def table(name):
    return read_table(archive.read_entry(f'data/database/{name}.dat'))
def string(t, row, offset):
    return _table_string(t, row, offset)
def localized(t, row, offset):
    return {locale: string(t,row,offset+i*8) for i,locale in enumerate(('ja','en','fr','es','zh-TW','ko','zh-CN'))}

def write(name, value):
    value['build_id'] = '25640656'
    a.output_dir.mkdir(parents=True, exist_ok=True)
    (a.output_dir / f'game-save-{name}.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf8')

items = table('item')
item_rows = {u64(row, 0): row for row in items.records}
item_names = {u64(row, 0): string(items, row, 80) for row in items.records}
tools = [dict(itemId=u64(row, 0), family=u64(row, 16), level=u32(row, 348), code=string(items, row, 8), name=string(items, row, 80), nameTranslations=localized(items,row,32)) for row in items.records if (660000 <= u64(row, 0) <= 662003 or 802021 <= u64(row, 0) <= 802025) and (u64(row, 16) or u64(row, 0) in [660050, 660070, 660071, 660090, 661000, 661010, 662000, 662001, 662002, 662003])]
write('tools', dict(source='item.dat parent u64@16, level u32@348; build 25640656 native upgrade 0x140345BBB-0x140345C82 copies the new level to the hoe, plow, watering can and seeder range fields', tools=tools, itemIds=list(item_names)))

flags = table('gameflag')
flag_rows = [dict(id=u64(row, 0), code=string(flags, row, 8), name=string(flags, row, 16)) for row in flags.records]
recipes = []
for key, category, flag_offset, item_offset in [('craft', '手作配方', 116, 92), ('cooking', '料理配方', 152, 24)]:
    t = table(key)
    for row in t.records:
        flag, item = u64(row, flag_offset), u64(row, item_offset)
        if flag: recipes.append(dict(flag=flag, category=category, name=item_names[item], itemId=item, nameTranslations=localized(items,item_rows[item],32)))
t = table('skilltree')
skills = []
for row in t.records:
    if not u64(row, 40): continue
    shift = u32(row, 76) * 8  # showFlag array precedes release flag and display text.
    skills.append(dict(id=u64(row, 40), nodeId=u64(row, 0), flag=u64(row, 80 + shift), name=string(t, row, 164 + shift), description=string(t, row, 220 + shift), nameTranslations=localized(t,row,116+shift), descriptionTranslations=localized(t,row,172+shift), requires=[u64(row, offset) for offset in [48, 56, 64] if u64(row, offset)]))
write('progression', dict(source='gameflag.dat; craft flag@116 output@92; cooking flag@152 output@24; skilltree effect@40 flag@80+showFlagCount*8', flags=flag_rows, recipes=recipes, skills=skills))

t = table('livestock')
animals = []
for row in t.records:
    features = [u64(row, 104 + index * 8) for index in range(u32(row, 100))]
    cursor = 104 + len(features) * 8
    tail = cursor + 12 + u32(row, cursor + 8) * 16
    variants = [dict(index=i, texture=u64(row, tail + 20 + i * 8), icon=u64(row, tail + 44 + i * 8), itemId=u64(row, tail + 100 + i * 8)) for i in range(3) if u64(row, tail + 44 + i * 8)]
    animals.append(dict(id=u64(row, 0), code=string(t, row, 8), name=string(t, row, 64), nameTranslations=localized(t,row,16), houseType=u32(row, 96), features=features, heartUnit=300 if 11 in features else 400, growDays=u32(row, 72), adultId=u64(row, 76), variants=variants))
write('animals', dict(source='livestock.dat; native love level 0x140114A60 tests feature11, divides by300/400, clamps at5', animals=animals))

t = table('gimmick')
machines = []
special_containers = []
for row, strings in zip(t.records, _string_groups(t), strict=True):
    script = strings[8] if len(strings) > 8 else ''
    level = strings[strings.index('level') + 1] if 'level' in strings else ''
    mode = 'extractor' if script == 'gimmick_sap_extractor' else 'collector' if script == 'gimmick_collection_machine' else 'processing'
    machines.append(dict(id=u64(row, 0), itemId=u32(row, len(row) - 48), capacity=3 if level == '2' else 1, script=script, level=level, mode=mode, family=re.sub(r'_Lv\d+$', '', script, flags=re.I)))
    special_scripts = {'gimmick_shinto_altar': 'display', 'gimmick_table': 'display', 'gimmick_craft_table': 'workbench', 'gimmick_architecture_anvil': 'anvil'}
    kind = 'shared' if strings[0] == 'GIMMICK_ID_SHARED_BOX' else 'quest' if strings[0] == 'GIMMICK_ID_NPC_QUEST_YUTA_BEEHIVE' else special_scripts.get(script)
    if kind:
        special_containers.append(dict(id=u64(row, 0), itemId=u32(row, len(row) - 48), kind=kind, script=script))
processes = []
for row in table('gimmickprocess').records:
    count = u32(row, 24)
    offset = 28 + count * 8
    inputs = [dict(itemId=u64(row, offset + index * 12), count=u32(row, offset + index * 12 + 8)) for index in range(2) if u64(row, offset + index * 12)]
    processes.append(dict(id=u64(row, 0), machines=[u64(row, 28 + index * 8) for index in range(count)], inputs=inputs, output=u64(row, offset + 24), count=u32(row, offset + 32), minutes=u32(row, offset + 36)))
process_machine_ids = {id for recipe in processes for id in recipe['machines']}
machines = [machine for machine in machines if machine['id'] in process_machine_ids or machine['mode'] == 'collector']
write('machines', dict(source='gimmick.dat and gimmickprocess.dat; native GimmickProcessPushItem 0x14027BE10: job material pointer stride eight at 0x14027C3DD, pointer storage at 0x14027C713; durations in seconds', machines=machines, specialContainers=special_containers, processes=processes))

origins = {}
for row in table('mapgroup').records:
    if u64(row, 0) != 1: continue
    for index in range(u32(row, 32)):
        offset = 36 + index * 16
        origins[u64(row, offset)] = (u32(row, offset + 8), u32(row, offset + 12))
t = table('livestockplacement')
placements = []
for row in t.records:
    count = u32(row, 72)
    offset = 76 + count * 8
    map_id = u64(row, 32)
    if map_id not in origins: continue
    x, y = origins[map_id]
    placements.append(dict(id=u64(row, 0), code=string(t, row, 8), houseType=u32(row, 16), special=bool(u32(row, 20)), mapId=map_id, mapGroup=1, x=x + u32(row, 56), y=y + u32(row, 60), requires=[u64(row, 76 + index * 8) for index in range(count)], excludes=[u64(row, offset + 4 + index * 8) for index in range(u32(row, offset))]))
write('placements', dict(source='livestockplacement.dat/mapgroup.dat; historical build24969282 native 0x14013BB50/0x14013AD30 availability, 0x1401050A0 base position', placements=placements))

t = table('quest')
quests = [dict(id=u64(row, 0), code=string(t, row, 8), name=string(t, row, 68), description=string(t, row, 180),
    nameTranslations=localized(t,row,20), descriptionTranslations=localized(t,row,132),
    steps=[dict(name=string(t, row, 388 + index * 60), nameTranslations=localized(t,row,340+index*60),
                level=u32(row, 396 + index * 60)) for index in range(u32(row, 336))]) for row in t.records]
write('quests', dict(source='quest.dat; historical build24969282 native CQuestStatus 0x1401338E0 compares checkLevel strictly greater than each threshold; state0 hidden,1 shown,3 completed', quests=quests))
print('Extracted tool, progression, animal, machine, placement and quest catalogs.')
