"""Reproduce v2 editor catalogs from read-only game archives. Never touches saves."""
import argparse
import json
import struct
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.icons import _table_string
from honogurashi_extractor.probe import _string_groups

p = argparse.ArgumentParser()
p.add_argument('--game-dir', required=True, type=Path)
p.add_argument('--output-dir', required=True, type=Path)
a = p.parse_args()
archive = FafullfsArchive.open(a.game_dir / 'data.dat')
u32 = lambda row, offset: struct.unpack_from('<I', row, offset)[0]
u64 = lambda row, offset: struct.unpack_from('<Q', row, offset)[0]
def table(name):
    return read_table(archive.read_entry(f'data/database/{name}.dat'))
def string(t, row, offset):
    return _table_string(t, row, offset)
def write(name, value):
    a.output_dir.mkdir(parents=True, exist_ok=True)
    (a.output_dir / f'game-save-{name}.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf8')

items = table('item')
item_names = {u64(row, 0): string(items, row, 32) for row in items.records}
tools = [dict(itemId=u64(row, 0), family=u64(row, 16), level=u32(row, 308), code=string(items, row, 8), name=string(items, row, 64)) for row in items.records if 660000 <= u64(row, 0) <= 662003 and (u64(row, 16) or u64(row, 0) in [660050, 660070, 660071, 660090, 661000, 661010, 662000, 662001, 662002, 662003])]
write('tools', dict(source='item.dat parent u64@16, level u32@308; native upgrade 0x140329AE8/0x140329B15/0x140329B46', tools=tools, itemIds=list(item_names)))

flags = table('gameflag')
flag_rows = [dict(id=u64(row, 0), code=string(flags, row, 8), name=string(flags, row, 16)) for row in flags.records]
recipes = []
for key, category, flag_offset, item_offset in [('craft', '手作配方', 116, 92), ('cooking', '料理配方', 152, 24)]:
    t = table(key)
    for row in t.records:
        flag, item = u64(row, flag_offset), u64(row, item_offset)
        if flag: recipes.append(dict(flag=flag, category=category, name=item_names.get(item, str(item)), itemId=item))
t = table('skilltree')
skills = []
for row in t.records:
    if not u64(row, 40): continue
    shift = u32(row, 76) * 8  # showFlag array precedes release flag and display text.
    skills.append(dict(id=u64(row, 40), nodeId=u64(row, 0), flag=u64(row, 80 + shift), name=string(t, row, 148 + shift), description=string(t, row, 196 + shift), requires=[u64(row, offset) for offset in [48, 56, 64] if u64(row, offset)]))
write('progression', dict(source='gameflag.dat; craft flag@116 output@92; cooking flag@152 output@24; skilltree effect@40 flag@80+showFlagCount*8', flags=flag_rows, recipes=recipes, skills=skills))

t = table('livestock')
animals = []
for row in t.records:
    features = [u64(row, 96 + index * 8) for index in range(u32(row, 92))]
    cursor = 96 + len(features) * 8
    tail = cursor + 12 + u32(row, cursor + 8) * 16
    variants = [dict(index=i, texture=u64(row, tail + 20 + i * 8), icon=u64(row, tail + 44 + i * 8), itemId=u64(row, tail + 100 + i * 8)) for i in range(3) if u64(row, tail + 44 + i * 8)]
    animals.append(dict(id=u64(row, 0), code=string(t, row, 8), name=string(t, row, 48), houseType=u32(row, 88), features=features, heartUnit=300 if 11 in features else 400, growDays=u32(row, 64), adultId=u64(row, 68), variants=variants))
write('animals', dict(source='livestock.dat; native love level 0x14010AA80 tests feature11, divides by300/400, clamps at5', animals=animals))

t = table('gimmick')
machines = []
for row, strings in zip(t.records, _string_groups(t), strict=True):
    script = strings[7] if len(strings) > 7 else ''
    level = strings[strings.index('level') + 1] if 'level' in strings else ''
    machines.append(dict(id=u64(row, 0), itemId=u32(row, len(row) - 48), capacity=3 if level == '2' else 1, script=script, level=level))
processes = []
for row in table('gimmickprocess').records:
    count = u32(row, 24)
    offset = 28 + count * 8
    inputs = [dict(itemId=u64(row, offset + index * 12), count=u32(row, offset + index * 12 + 8)) for index in range(2) if u64(row, offset + index * 12)]
    processes.append(dict(id=u64(row, 0), machines=[u64(row, 28 + index * 8) for index in range(count)], inputs=inputs, output=u64(row, offset + 24), count=u32(row, offset + 32), minutes=u32(row, offset + 36)))
process_machine_ids = {id for recipe in processes for id in recipe['machines']}
machines = [machine for machine in machines if machine['id'] in process_machine_ids]
write('machines', dict(source='gimmick.dat and gimmickprocess.dat; native 0x14026EF20 eight internal material entries per job, durations in seconds', machines=machines, processes=processes))

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
write('placements', dict(source='livestockplacement.dat/mapgroup.dat; native 0x14013BB50/0x14013AD30 availability, 0x1401050A0 base position', placements=placements))

t = table('quest')
quests = [dict(id=u64(row, 0), name=string(t, row, 52), description=string(t, row, 148), steps=[dict(name=string(t, row, 332 + index * 52), level=u32(row, 348 + index * 52)) for index in range(u32(row, 296))]) for row in t.records]
write('quests', dict(source='quest.dat; native CQuestStatus 0x1401338E0 compares checkLevel strictly greater than each threshold; state0 hidden,1 shown,3 completed', quests=quests))
print('Extracted tool, progression, animal, machine, placement and quest catalogs.')
