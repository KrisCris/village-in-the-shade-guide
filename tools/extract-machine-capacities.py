"""Read processing slot counts from the verified 25311578 game tables.

Native GimmickProcessPushItem at 0x14027BE10 checks the first settingArg
value: exactly "2" allows three slots, otherwise only slot zero is used
(0x14027BEB9-0x14027BF0B). This is slots per recipe batch, not output count.
Only devices referenced by gimmickprocess.dat belong to this model.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.icons import _table_string
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_game_dir(parser)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    executable_hash = hashlib.sha256((args.game_dir / 'village.exe').read_bytes()).hexdigest()
    if executable_hash != 'ac7d955baa915929b185df85cfa13f7e81ad57a9c68f308da769739775869a05':
        raise ValueError('Unreviewed game executable; verify the native slot rule before extracting')
    archive = FafullfsArchive.open(args.game_dir / 'data.dat')
    raw = {name: archive.read_entry(f'data/database/{name}.dat')
           for name in ('gimmick', 'gimmickprocess', 'item')}
    tables = {name: read_table(value) for name, value in raw.items()}
    u32 = lambda row, offset: struct.unpack_from('<I', row, offset)[0]
    u64 = lambda row, offset: struct.unpack_from('<Q', row, offset)[0]
    item_ids = {u64(row, 0): _table_string(tables['item'], row, 8)
                for row in tables['item'].records}
    required = {u64(row, 28 + index * 8)
                for row in tables['gimmickprocess'].records
                for index in range(u32(row, 24))}
    machines = []
    for row, strings in zip(tables['gimmick'].records,
                            _string_groups(tables['gimmick']), strict=True):
        if u64(row, 0) not in required:
            continue
        key, level = strings[9:11]
        if (key, level) not in {('level', '1'), ('level', '2'), ('', '')}:
            raise ValueError(f'Unreviewed settingArg on {strings[0]}: {key}={level}')
        machines.append({
            'item_id': item_ids[u32(row, len(row) - 48)],
            'gimmick_id': strings[0],
            'gimmick_numeric_id': u64(row, 0),
            'script': strings[8],
            'level': level or None,
            'capacity': 3 if level == '2' else 1,
        })
    if {m['gimmick_numeric_id'] for m in machines} != required:
        raise ValueError('Some processing devices have no matching gimmick row')
    if len({m['item_id'] for m in machines}) != len(machines):
        raise ValueError('Duplicate machine items need a manual data review')
    result = {
        'build_id': '25311578',
        'source': 'gimmick.dat first settingArg; gimmickprocess.dat machine references; item.dat IDs',
        'native_rule': 'GimmickProcessPushItem 0x14027BEB9-0x14027BF0B: first settingArg value "2" => 3 slots, otherwise 1',
        'unit': 'simultaneous recipe batches per device',
        'sha256': {**{name + '.dat': hashlib.sha256(value).hexdigest() for name, value in raw.items()},
                   'village.exe': executable_hash},
        'machines': sorted(machines, key=lambda machine: machine['item_id']),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f'Extracted {len(machines)} processing devices: '
          f'{sum(m["capacity"] == 1 for m in machines)} single-slot, '
          f'{sum(m["capacity"] == 3 for m in machines)} three-slot')


if __name__ == '__main__':
    main()
