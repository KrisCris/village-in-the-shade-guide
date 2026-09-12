"""Export named constants read from the installed game's database (read-only)."""
import argparse
import json
import re
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
table = read_table(archive.read_entry('data/database/gamedefine.dat'))
pattern = re.compile(r'^(PLAYER_STATUS_(HP|ST)_|NPC_LOVE_.*MAX$|ITEM_(STACK|RANK)_|MONEY_MAX$|LIVESTOCK_(LOVE|MOOD|FOOD)_.*(MIN|MAX))')
constants = {}
for row in _string_groups(table):
    if len(row) >= 5 and pattern.search(row[1]):
        constants[row[1]] = dict(value=int(row[4]), description_ja=row[2])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(dict(source='gamedefine.dat', build='24969282', constants=constants), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'{len(constants)} verified constants -> {args.output}')
