"""Read native appearance IDs, item variants and unlock flags, preserving colour indices."""
import argparse
import json
import struct
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

parser = argparse.ArgumentParser()
parser.add_argument('--game-dir', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
archive = FafullfsArchive.open(args.game_dir / 'data.dat')
layouts = [('playercrothing', 200, 10), ('playerheadaccessory', 240, 10),
           ('playerneckaccessory', 148, 10), ('playerbackaccessory', 148, 10),
           ('playerfronthairstyle', 112, 1), ('playerbackhairstyle', 136, 1)]
tables = {}
for name, offset, count in layouts:
    table = read_table(archive.read_entry(f'data/database/{name}.dat'))
    rows = []
    for record, strings in zip(table.records, _string_groups(table), strict=True):
        values = [struct.unpack_from('<Q', record, offset + i*8)[0] for i in range(count)]
        rows.append(dict(id=struct.unpack_from('<Q', record)[0], name_ja=strings[1],
                         variants=[dict(color=index, itemId=value) for index, value in enumerate(values) if value],
                         unlockFlag=struct.unpack_from('<Q', record, offset + count*8)[0]))
    tables[name] = rows
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(dict(source='native appearance tables', tables=tables), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'{sum(len(rows) for rows in tables.values())} appearance groups')
