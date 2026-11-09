"""Render quarry layout thumbnails and count each layout's rock cells.

Run tools/extract-quarry.py first: only the layouts that its floor and special-room
pools use are exported. Writes public/maps/quarry/<layout>.webp (thumbnails),
public/maps/quarry/large/<layout>.webp (the floor explorer's enlarged view, fetched only
when a thumbnail is opened) and data/sources/game-quarry-maps.json.

Rock cells are the unique YMWR cells whose mask has bit 0x10; DungeonPlacementEnemyAndVein
places rocks and monsters on them (see tools/extract-quarry.py). Thumbnails show the
ground layer only, cleared outside the room like the save editor's room art. The scenery
layer is left out because it adds the near-side walls, which cover most of the floor at
thumbnail size. Rocks, monsters and the hole down are placed when the floor loads, so
the art never shows them.
"""
import argparse
import json
import runpy
import struct
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageChops
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.map_art import ground_image
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table

ROOT = Path(__file__).resolve().parents[1]
SCALE = 6  # native pixels per thumbnail pixel
LARGE_SCALE = 3  # native pixels per enlarged-view pixel
ROCK_CELL = 0x10


def read_head(maps: FafullfsArchive, path: str) -> bytes:
    head = maps.read_entry(path + '.head')
    return zlib.decompress(head[20:]) if head.startswith(b'YKCMP_V1') else head


def rock_cells(head: bytes) -> int:
    """Unique cells flagged 0x10 on any tile record (0x1401d2730 collects them into a set)."""
    header = struct.unpack_from('<19I', head)
    start = 76 + header[3] * 72
    cells = set()
    for i in range(header[12]):
        offset = start + i * 112
        x, y = struct.unpack_from('<ii', head, offset)
        for index, (dx, dy) in enumerate(((1, 0), (0, 1), (2, 1), (1, 2))):
            if struct.unpack_from('<Q', head, offset + 48 + index * 8)[0] & ROCK_CELL:
                cells.add((2 * x + dx, 2 * y + dy))
    return len(cells)


def render(job):
    game, key, out = job
    clear_outside = runpy.run_path(str(ROOT / 'tools/extract-map-art.py'))['clear_outside']
    maps = FafullfsArchive.open(Path(game) / 'data/map_1_00.dat')
    path = f'data/map/map_{key}.ymwr'
    head = read_head(maps, path)
    cols, rows = struct.unpack_from('<2I', head, 52)
    mat = maps.read_entry(path + '.mat')
    count, size = struct.unpack_from('<II', mat)
    base = 8 + count * 8 + size
    tiles = [(i % cols, i // cols) for i in range(cols * rows) if struct.unpack_from('<I', mat, base + i * 12 + 4)[0]]
    bounds = (min(x for x, _ in tiles) * 256, min(y for _, y in tiles) * 256,
              (max(x for x, _ in tiles) + 1) * 256, (max(y for _, y in tiles) + 1) * 256)
    image = ground_image(mat, bounds, cols)
    rgb = image.convert('RGB').split()
    tight = ImageChops.lighter(ImageChops.lighter(rgb[0], rgb[1]), rgb[2]).point(lambda p: 255 if p > 8 else 0).getbbox()
    if not tight:
        raise ValueError(f'Empty layout {key}')
    image = clear_outside(image.crop(tight))
    thumb = image.resize((round(image.width / SCALE), round(image.height / SCALE)), Image.Resampling.LANCZOS)
    thumb.save(Path(out) / f'{key}.webp', quality=78, method=6)
    large = image.resize((round(image.width / LARGE_SCALE), round(image.height / LARGE_SCALE)), Image.Resampling.LANCZOS)
    large.save(Path(out) / 'large' / f'{key}.webp', quality=78, method=6)
    return key, dict(file=f'maps/quarry/{key}.webp', width=thumb.width, height=thumb.height,
                     large=dict(file=f'maps/quarry/large/{key}.webp', width=large.width, height=large.height),
                     cells=rock_cells(head))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_game_dir(parser, '--game-dir', '--game')
    parser.add_argument('--jobs', type=int, default=6)
    args = parser.parse_args()
    game = args.game_dir
    quarry = json.loads((ROOT / 'data/sources/game-quarry.json').read_text(encoding='utf-8'))
    keys = sorted({key for source in (*quarry['floors'], *quarry['rooms']) for key in source['layouts']})
    data = FafullfsArchive.open(game / 'data.dat')
    table = read_table(data.read_entry('data/database/map.dat'))
    labels = {Path(group[2]).stem.removeprefix('map_'): (struct.unpack_from('<Q', record)[0], group[1])
              for record, group in zip(table.records, _string_groups(table), strict=True)}
    out = ROOT / 'public/maps/quarry'
    (out / 'large').mkdir(parents=True, exist_ok=True)
    for stale in [*out.glob('*.webp'), *out.glob('large/*.webp')]:
        if stale.stem not in keys:
            stale.unlink()
    with ProcessPoolExecutor(args.jobs) as pool:
        rendered = dict(pool.map(render, [(str(game), key, str(out)) for key in keys]))
    layouts = {key: dict(map_id=labels[key][0], label_ja=labels[key][1], **rendered[key]) for key in keys}
    (ROOT / 'data/sources/game-quarry-maps.json').write_text(json.dumps(dict(
        source='map_1_00.dat YMWR ground layer and cell masks; map.dat labels (build 25640656)',
        scale=SCALE, large_scale=LARGE_SCALE, layouts=layouts), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'quarry maps: {len(layouts)} layouts')


if __name__ == '__main__':
    main()
