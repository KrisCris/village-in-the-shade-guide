"""Extract save-editor UI icons using the native icon -> texture join."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.icons import _u32, _table_string, _find_texture_archive, icon_bounds
from honogurashi_extractor.texture import decode_nltx_image

parser = argparse.ArgumentParser()
parser.add_argument('--game-dir', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
archive = FafullfsArchive.open(args.game_dir / 'data.dat')
icons = read_table(archive.read_entry('data/database/icon.dat'))
textures = read_table(archive.read_entry('data/database/texture.dat'))
texture_by_id = {_u32(record, 0): record for record in textures.records}
requested = {f'ICON_ID_ITEM_RANK_{rank}': f'rank-{index}' for index, rank in enumerate(['COPPER', 'SILVER', 'GOLD', 'BRAND'], 1)}
requested['ICON_ID_INTANGEBLE_POPUP_LIKABILITY'] = 'friendship'
requested['ICON_ID_SYSTEM_ICON_HEALTH'] = 'health'
requested['ICON_ID_SYSTEM_ICON_STAMINA'] = 'stamina'
tree = read_table(archive.read_entry('data/database/skilltree.dat'))
for icon_id in {_u32(row, 32) for row in tree.records}:
    icon = next(r for r in icons.records if _u32(r, 0) == icon_id)
    requested[_table_string(icons, icon, 8)] = f'shrine-{icon_id}'
livestock = read_table(archive.read_entry('data/database/livestock.dat'))
# icon_id is part of each native livestock row; use normalized production evidence for that join.
products = json.loads((Path(__file__).resolve().parents[1] / 'data/sources/game-livestock-products.json').read_text('utf8'))
for animal in products['animals']:
    entry = next((r for r in livestock.records if _table_string(livestock, r, 8) == animal['livestock_id']), None)
    icon = next((r for r in icons.records if _u32(r, 0) == animal['icon_id']), None)
    if entry is not None and icon is not None: requested[_table_string(icons, icon, 8)] = f"livestock-{_u32(entry, 0)}"
rows = [record for record in icons.records if _table_string(icons, record, 8) in requested]
assert len(rows) == len(requested)
args.output.mkdir(parents=True, exist_ok=True)
evidence = []
for record in rows:
    name = requested[_table_string(icons, record, 8)]
    texture = texture_by_id[_u32(record, 24)]
    path = _table_string(textures, texture, 24)
    container = _find_texture_archive(args.game_dir, {path})
    atlas = decode_nltx_image(container.read_entry(path))
    x, y, width, height = icon_bounds(record)
    assert x + width <= atlas.width and y + height <= atlas.height
    atlas.crop((x, y, x + width, y + height)).save(args.output / f'{name}.webp', 'WEBP', lossless=True)
    evidence.append(dict(file=f'{name}.webp', icon_id=_u32(record, 0), texture=path, bounds=[x, y, width, height]))
(args.output / 'sources.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Extracted {len(rows)} icons')
