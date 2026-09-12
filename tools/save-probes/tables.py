"""Read-only database inspection for the save editor. Outputs only to stdout."""
import json
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

archive = FafullfsArchive.open(Path(r'E:\Games\SteamLibrary\steamapps\common\Village in the Shade\data.dat'))
table = read_table(archive.read_entry(f'data/database/{sys.argv[1]}.dat'))
pattern = re.compile(sys.argv[2] if len(sys.argv) > 2 else '.', re.I)
print(f'{sys.argv[1]}: {table.record_count} records, {table.record_size} bytes')
for record, strings in zip(table.records, _string_groups(table), strict=True):
    if not pattern.search(' '.join(strings)):
        continue
    print(json.dumps(dict(id=struct.unpack_from('<Q', record)[0], strings=strings,
        words={str(i): struct.unpack_from('<I', record, i)[0] for i in range(0, len(record)-3, 4)}), ensure_ascii=False))
