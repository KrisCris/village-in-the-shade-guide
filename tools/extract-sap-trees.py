"""Which tree each sap comes from, read-only.

A sap extractor (树液采集器) fitted to a tree collects that tree's sap. Its
gimmickprocess.dat recipes take no input, so the tree is named only in
crops.dat, by the field that _extractor_item reads.
"""
import argparse
import json
from pathlib import Path

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.normalize import _extractor_item
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'data/generated/build-25311578/entities'
EXTRACTOR = 'ITEM_ID_GIMMICK_SAP_EXTRACTOR'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_game_dir(parser)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/sources/game-sap-trees.json')
    args = parser.parse_args()
    # Build 25311578 tables carry seven languages.
    table = read_table(FafullfsArchive.open(args.game_dir / 'data.dat').read_entry('data/database/crops.dat'), language_count=7)
    items = {item['numeric_id']: item['id'] for item in json.loads((SNAPSHOT / 'items.json').read_text(encoding='utf-8'))}
    trees = []
    for record, group in zip(table.records, _string_groups(table), strict=True):
        value = _extractor_item(record)
        if not value:
            continue
        if value not in items:
            raise ValueError(f'{group[0]}: extractor item {value} is not in items.json')
        trees.append({'crop_id': group[0], 'item_id': items[value]})
    recipes = [row for row in json.loads((SNAPSHOT / 'processes.json').read_text(encoding='utf-8')) if EXTRACTOR in row['machine_ids']]
    if sorted(tree['item_id'] for tree in trees) != sorted(recipe['output']['item_id'] for recipe in recipes):
        raise ValueError('Sap trees and sap extractor recipes name different items')
    output = {
        'build_id': '25311578',
        'source': 'crops.dat u64 24 bytes before each record end; checked against the ITEM_ID_GIMMICK_SAP_EXTRACTOR recipes in gimmickprocess.dat',
        'trees': sorted(trees, key=lambda tree: tree['crop_id']),
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(len(trees), 'sap trees')


if __name__ == '__main__':
    main()
