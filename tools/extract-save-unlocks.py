"""Read-only shrine tree and mayor delivery catalogs; see docs/save-editor.md for RE evidence."""
import argparse
import json
import struct
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.icons import _table_string

p = argparse.ArgumentParser()
p.add_argument('--game-dir', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
archive = FafullfsArchive.open(a.game_dir / 'data.dat')
u32 = lambda r, o: struct.unpack_from('<I', r, o)[0]
u64 = lambda r, o: struct.unpack_from('<Q', r, o)[0]
i32 = lambda r, o: struct.unpack_from('<i', r, o)[0]
def table(name): return read_table(archive.read_entry(f'data/database/{name}.dat'))
def string(t, r, o): return _table_string(t, r, o)
t = table('skilltree')
nodes = []
for r in t.records:
    # showFlag is a counted array; following packed fields shift with its length.
    count = u32(r, 76)
    shift = count * 8
    nodes.append(dict(id=u64(r, 0), x=i32(r, 24), y=i32(r, 28), icon=u64(r, 32),
        skill=u64(r, 40), parents=[u64(r, o) for o in (48, 56, 64) if u64(r, o)],
        level=u32(r, 72), showFlags=[u64(r, 80+i*8) for i in range(count)],
        flag=u64(r, 80+shift), horrorOnly=bool(u32(r, 88+shift)),
        costs=[u32(r, 92+shift+i*4) for i in range(6)],
        name=string(t, r, 148+shift), description=string(t, r, 196+shift)))
t = table('bundlegroup')
groups = [dict(id=u64(r, 0), name=string(t, r, 60),
    bundles=[u32(r, o) for o in (76, 80, 84, 88) if u32(r, o)], flag=u32(r, 92),
    event=str(u64(r, 96)), reward=u64(r, 104)) for r in t.records if 12 <= u64(r, 0) <= 20]
t = table('bundle')
ids = {id for group in groups for id in group['bundles']}
bundles = [dict(id=u64(r, 0), name=string(t, r, 48),
    items=[dict(itemId=u32(r, 64+i*12), rank=u32(r, 68+i*12), count=u32(r, 72+i*12)) for i in range(3) if u32(r, 64+i*12)],
    reward=u64(r, 100), rewardCount=u32(r, 108)) for r in t.records if u64(r, 0) in ids]
t = table('gameflag')
flags = {string(t, r, 8): u64(r, 0) for r in t.records}
result = dict(nodes=nodes, groups=groups, bundles=bundles,
    catalogFlag=flags['GAME_FLAG_STORY_02_022'], introFlags=[flags[k] for k in ('GAME_FLAG_STORY_02_018','GAME_FLAG_STORY_02_019')])
a.output.parent.mkdir(parents=True, exist_ok=True)
a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', 'utf8')
print(f'{len(nodes)} shrine nodes; {len(groups)} catalogs; {len(bundles)} delivery sets')
