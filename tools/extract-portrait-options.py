"""Export dialogue-defined portrait poses and expressions (read-only).

Run after extract-portrait-models.py with the same --output directory.
"""
import argparse
import json
import struct
from collections import Counter, defaultdict
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--game-dir', type=Path, default=Path('E:/Games/SteamLibrary/steamapps/common/Village in the Shade'))
parser.add_argument('--output', type=Path, default=Path('.local/fairy-review'))
cli = parser.parse_args()
archive = FafullfsArchive.open(cli.game_dir / 'data.dat')
roles = ['ORPHAN','CARPENTER','WOODCUTTER','VILLAGE_HEAD','HUNTER','GENERAL_STORE_MASTER','OLD_MAN','SECRETARY','CITY_HALL_STAFF','GIRL','YOUNG_MAN','BOY','FEMALE_DOCTOR','STREET_VENDOR','GHOST_GIRL']
definitions = list(_string_groups(read_table(archive.read_entry('data/database/talkdefine.dat'))))
result = {}
for number, role in enumerate(roles, 2):
    prefix = f'TALK_BU_FACE_{role}_'
    result[f'BU_{number*10:04}'] = {s[4]: {'name': s[2], 'symbol': s[1]} for s in definitions if s[1].startswith(prefix)}
(cli.output / 'expressions.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf8')
print('Exported', sum(map(len, result.values())), 'named expressions')

bu = {}
for record, strings in zip(read_table(archive.read_entry('data/database/bu.dat')).records, _string_groups(read_table(archive.read_entry('data/database/bu.dat')))):
    bu_id = struct.unpack_from('<Q', record)[0]
    resource, pose, companion = struct.unpack_from('<3i', record, 52)
    bu[bu_id] = dict(symbol=strings[0], label=strings[1], model=f'BU_{(resource-1630)*10:04}', pose=pose, companion=companion, layers=list(strings[3:]))
uses = defaultdict(Counter)
examples = defaultdict(list)
table = read_table(archive.read_entry('data/database/talk.dat'))
skipped = []
for record, strings in zip(table.records, _string_groups(table)):
    p = 28
    banks = {}
    offsets = []
    for _ in range(struct.unpack_from('<I', record, 24)[0]):
        if p+84 > len(record): break
        offsets.append(p)
        # Build 25311578: 84-byte command header, 64-byte sub-entries (was 56).
        p += 84 + 64 * struct.unpack_from('<I', record, p+80)[0]
    if p != len(record)-16:
        skipped.append(strings[0])
        continue
    for p in offsets:
        command = struct.unpack_from('<Q', record, p)[0]
        args = struct.unpack_from('<6q', record, p+32)
        if command == 1000:
            bank, _, bu_id, expression, *options = args
            banks[bank] = bu_id
        elif command == 1001:
            bank, bu_id, expression, *options = args
            if bu_id: banks[bank] = bu_id
            bu_id = banks.get(bank, bu_id)
        else:
            bu_id = None
        if bu_id in bu and expression >= 1000:
            key = (bu[bu_id]['model'], bu[bu_id]['pose'])
            uses[key][expression] += 1
            if len(examples[key]) < 5: examples[key].append(dict(talk=strings[0], bu=bu_id, face=expression, options=options))
poses = defaultdict(dict)
for row in bu.values():
    model, pose = row['model'], str(row['pose'])
    entry = poses[model].setdefault(pose, dict(label=row['label'], definitions=[], layers=row['layers'], expressions=dict(uses[(model,row['pose'])]), examples=examples[(model,row['pose'])]))
    entry['definitions'].append(row['symbol'])
(cli.output / 'poses.json').write_text(json.dumps(poses, ensure_ascii=False), encoding='utf8')
print('Exported',len(bu),'BU definitions;',sum(len(x) for x in poses.values()),'pose groups; scanned',len(table.records),'conversations')
print('Skipped variable-layout conversations:', len(skipped))
