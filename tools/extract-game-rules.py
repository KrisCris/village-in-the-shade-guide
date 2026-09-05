"""Export named game constants used by original planning guides."""
import json
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

game = Path(r'E:\Games\SteamLibrary\steamapps\common\Village in the Shade')
archive = FafullfsArchive.open(game / 'data.dat')
table = read_table(archive.read_entry('data/database/gamedefine.dat'))
constants = {}
for group in _string_groups(table):
    if len(group) > 4 and group[1].startswith('NPC_LOVE_'):
        constants[group[1]] = dict(value=int(group[4]), description_ja=group[2])
Path('data/sources/game-rules.json').write_text(
    json.dumps(dict(source='gamedefine.dat', constants=constants), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'game rules: {len(constants)}')
