"""Growth stages and stage art for every plantable crop and sap tree, read-only.

Stages and the form each harvest or axe cut leads to come from crops.dat
(GrowInfo threshold and changeForm, village.exe 0x14001A090). Sprites are the
ones tools/extract-map-art.py already exported for the save-editor farm map, so
the guide reuses public/maps/farm/sprites instead of shipping copies. Each sprite
also records the box its painted pixels fill around the plant's ground point, so
the guide can draw stages at one scale on a shared ground line and crop
single pictures tightly.
"""
import argparse
import json
from pathlib import Path

from PIL import Image

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.crop_growth import growth_forms, visible_box
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.normalize import _crop_record, _extractor_item
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'data/generated/build-25640656/entities/crops.json'
ART = ROOT / 'public/maps/farm'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_game_dir(parser)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/sources/game-crop-growth.json')
    args = parser.parse_args()
    # Builds since 25311578 carry seven languages.
    table = read_table(FafullfsArchive.open(args.game_dir / 'data.dat').read_entry('data/database/crops.dat'), language_count=7)
    records = {group[0]: record for record, group in zip(table.records, _string_groups(table))}
    manifest = json.loads((ART / 'manifest.json').read_text(encoding='utf-8'))
    boxes = {}
    crops = {}
    for crop in json.loads(SNAPSHOT.read_text(encoding='utf-8')):
        # Wild trees have no seed item, but sap pages link to the tree they come from.
        if not crop['seed_item_ids'] and not _extractor_item(records[crop['id']]):
            continue
        parsed = _crop_record(records[crop['id']], 7)
        if parsed is None:
            raise ValueError(f"{crop['id']}: unreadable crops.dat record")
        forms = growth_forms(parsed['forms'], manifest['crops'][str(crop['numeric_id'])])
        if '1' not in forms:
            raise ValueError(f"{crop['id']}: no growth stages")
        for stages in forms.values():
            for _, _, art in stages:
                for sprite in art if isinstance(art, list) else [art]:
                    if sprite['file'] not in boxes:
                        with Image.open(ART / sprite['file']) as image:
                            boxes[sprite['file']] = visible_box(image.convert('RGBA'), sprite)
                    if not boxes[sprite['file']]:
                        raise ValueError(f"{crop['id']}: {sprite['file']} is blank")
                    sprite['paint'] = list(boxes[sprite['file']])
        crops[crop['id']] = forms
    output = {
        'source': 'Steam build 25640656 crops.dat GrowInfo stages + public/maps/farm/manifest.json sprites',
        'note': 'crop -> crops.dat form id -> [growth points, form after harvest or axe (0 removes the plant), sprite or [spring, summer, autumn, winter] sprites]; paint: painted bounds around the ground point',
        'crops': crops,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(len(crops), 'crops,', len(boxes), 'sprites')


if __name__ == '__main__':
    main()
