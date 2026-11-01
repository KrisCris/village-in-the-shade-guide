"""Wild plants and insects that spring up on their own, by season, read-only.

Each naturaloccurrence.dat record is one spawn group: word 8 (offset 32) holds
the row count, followed by 40-byte rows with the crop id at +8, the season at
+16 (0 spring … 3 winter, 4 all year) and a game flag the row waits for at +32
(0 for none). What a wild crop gives when picked comes from its
cropsharvest.dat record. Groups of timber trees, quarry stones and the two test
groups are left out; the table places no group, so where they grow is not
exported.
"""
import argparse
import json
import struct
from pathlib import Path

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'data/generated/build-25640656/entities'
# Picking a wild plant or catching an insect (cropsharvest.dat actions); the buried coin is dug up.
PICK_ACTIONS = (1010, 1070)


def picked_item(record: bytes) -> int | None:
    """The item a wild crop gives: its first state, 1, has one stage with one drop of exactly one, every time."""
    word = lambda offset: struct.unpack_from('<I', record, offset)[0]
    # Word 4 counts the states; each is a state id and stage count, then per stage its growth points, drop count and 44-byte drops.
    if not word(16) or (word(20), word(24), word(32)) != (1, 1, 1):
        return None
    item, action, low, high, chance = (word(36 + offset) for offset in (0, 8, 20, 24, 28))
    return item if action in PICK_ACTIONS and low == high == 1 and chance == 100 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_game_dir(parser)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/sources/game-natural-occurrence.json')
    args = parser.parse_args()
    archive = FafullfsArchive.open(args.game_dir / 'data.dat')
    items = {item['numeric_id']: item['id'] for item in json.loads((SNAPSHOT / 'items.json').read_text(encoding='utf-8')) if item.get('numeric_id')}
    harvest = {struct.unpack_from('<I', record)[0]: record for record in read_table(archive.read_entry('data/database/cropsharvest.dat')).records}
    table = read_table(archive.read_entry('data/database/naturaloccurrence.dat'))
    groups = []
    for record, strings in zip(table.records, _string_groups(table), strict=True):
        code = strings[0]
        if not code.startswith('NATURAL_GROUP_HARVEST_') or code == 'NATURAL_GROUP_HARVEST_05_00':
            continue
        count = struct.unpack_from('<I', record, 32)[0]
        if len(record) != 36 + count * 40 + 16:
            raise ValueError(f'{code}: {count} rows do not fill {len(record)} bytes')
        rows = []
        for index in range(count):
            offset = 36 + index * 40
            crop, = struct.unpack_from('<I', record, offset + 8)
            season, = struct.unpack_from('<I', record, offset + 16)
            flag, = struct.unpack_from('<I', record, offset + 32)
            item = picked_item(harvest[crop]) if crop in harvest else None
            if item not in items or season > 4:
                raise ValueError(f'{code}: unexpected row {crop} {item} {season}')
            rows.append({'crop': crop, 'item_id': items[item], 'item_numeric_id': item, 'season': season, **({'flag': flag} if flag else {})})
        groups.append({'id': code, 'rows': rows})
    seasons = {}
    for row in (row for group in groups for row in group['rows']):
        if seasons.setdefault(row['item_id'], row['season']) != row['season']:
            raise ValueError(f'{row["item_id"]} grows in more than one season')
    output = {
        'build_id': '25640656',
        'source': 'naturaloccurrence.dat spawn groups NATURAL_GROUP_HARVEST_00_00–04_02; picked items from cropsharvest.dat',
        'groups': groups,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(len(groups), 'groups,', len(seasons), 'items')


if __name__ == '__main__':
    main()
