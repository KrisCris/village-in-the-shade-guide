"""Export the whole open-world map as seasonal tiles and overviews; never runs the game."""
from __future__ import annotations

import argparse
import json
import math
import struct
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.map_art import ground_image, scenery_image
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table

ROOT = Path(__file__).resolve().parents[1]
SEASONS = ('spr', 'sum', 'aut', 'win')
# Tiles cover 2048 world pixels and ship at the farm art's 50%, so both line up.
TILE, SCALE = 2048, .5
# The overview is a 1/16 copy of the whole map for zoomed-out views and the corner map.
OVERVIEW = 16
# Tiles entirely under the farm art (tools/extract-map-art.py BOUNDS) are never seen.
FARM = (7936, 18688, 17408, 27648)


def world_bounds(mat: bytes, columns: int, rows: int) -> tuple[int, int, int, int]:
    """The rectangle of YMWR ground tiles that hold an image."""
    count, texture_bytes = struct.unpack_from('<II', mat)
    base = 8+count*8+texture_bytes
    filled = [(i % columns, i // columns) for i in range(columns*rows) if struct.unpack_from('<I', mat, base+i*12+4)[0]]
    return (min(x for x, _ in filled)*256, min(y for _, y in filled)*256,
            (max(x for x, _ in filled)+1)*256, (max(y for _, y in filled)+1)*256)


def render_season(game_dir: Path, openworld: str, season: str, output: Path) -> tuple[list[int], list[str]]:
    """Write one season's tiles and overview; returns the map bounds and the tiles written."""
    maps = FafullfsArchive.open(game_dir/'data/map_1_00.dat')
    head = maps.read_entry(f'{openworld}_{season}.ymwr.head')
    if head.startswith(b'YKCMP_V1'):
        head = zlib.decompress(head[20:])
    columns, rows = struct.unpack_from('<2I', head, 52)
    mat = maps.read_entry(f'{openworld}_{season}.ymwr.mat')
    left, top, right, bottom = bounds = world_bounds(mat, columns, rows)
    overview = Image.new('RGBA', (math.ceil((right-left)/OVERVIEW), math.ceil((bottom-top)/OVERVIEW)))
    (output/season).mkdir(parents=True, exist_ok=True)
    tiles = []
    textures: dict = {}
    for row in range(top//TILE, math.ceil(bottom/TILE)):
        # Neighbouring tiles share decal textures; a row's worth is enough to keep.
        if len(textures) > 160:
            textures.clear()
        for column in range(left//TILE, math.ceil(right/TILE)):
            box = (column*TILE, row*TILE, (column+1)*TILE, (row+1)*TILE)
            image = ground_image(mat, box, columns)
            image.alpha_composite(scenery_image(head, mat, box, textures))
            if not image.getchannel('A').getbbox():
                continue
            small = TILE//OVERVIEW
            overview.alpha_composite(image.resize((small, small), Image.Resampling.LANCZOS),
                                     ((box[0]-left)//OVERVIEW, (box[1]-top)//OVERVIEW))
            if FARM[0] <= box[0] and box[2] <= FARM[2] and FARM[1] <= box[1] and box[3] <= FARM[3]:
                continue
            size = round(TILE*SCALE)
            image.resize((size, size), Image.Resampling.LANCZOS).save(output/season/f'{column}_{row}.webp', quality=75, method=6)
            tiles.append(f'{column}_{row}')
    overview.save(output/f'{season}.webp', quality=85, method=6)
    print(season, len(tiles), 'tiles', flush=True)
    return list(bounds), tiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_game_dir(parser, '--game-dir', '--game')
    parser.add_argument('--output', type=Path, default=ROOT/'public/maps/village')
    args = parser.parse_args()
    archive = FafullfsArchive.open(args.game_dir/'data.dat')
    table = read_table(archive.read_entry('data/database/map.dat'))
    openworld = next(strings[2] for strings in _string_groups(table) if strings[0] == 'MAP_ID_OPENWORLD')
    if not openworld.endswith('_spr.ymwr'):
        raise ValueError(f'Unexpected openworld map name: {openworld}')
    openworld = openworld.removesuffix('_spr.ymwr')
    manifest: dict = {'source': 'Steam build 25640656, YMWR ground tiles and decals of the open-world map',
                      'tile': TILE, 'scale': SCALE, 'overview': OVERVIEW, 'seasons': {}}
    # Each season is its own map; one process each keeps a full run to a few minutes.
    with ProcessPoolExecutor(len(SEASONS)) as pool:
        jobs = {season: pool.submit(render_season, args.game_dir, openworld, season, args.output) for season in SEASONS}
        for season, job in jobs.items():
            bounds, tiles = job.result()
            if manifest.setdefault('bounds', bounds) != bounds:
                raise ValueError(f'{season} map covers {bounds}, not {manifest["bounds"]}')
            manifest['seasons'][season] = tiles
    (args.output/'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'))+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
