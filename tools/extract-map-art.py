"""Export native farm terrain and first-frame scene sprites; never runs the game."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from functools import lru_cache
from pathlib import Path

from PIL import Image

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.map_art import FairyBank, ground_image
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table
from honogurashi_extractor.texture import decode_nltx_image

ROOT = Path(__file__).resolve().parents[1]
SEASONS = ('spr', 'sum', 'aut', 'win')
BOUNDS = (7936, 18688, 14336, 27648)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--skip-ground', action='store_true')
    args = parser.parse_args()
    dest = ROOT/'public/maps/farm'
    dest.mkdir(parents=True, exist_ok=True)
    (dest/'sprites').mkdir(exist_ok=True)
    archive = FafullfsArchive.open(args.game/'data.dat')
    textures = FafullfsArchive.open(args.game/'data/texture_1_00.dat')
    fairy = FafullfsArchive.open(args.game/'data/fairy_1_00.dat')
    maps = FafullfsArchive.open(args.game/'data/map_1_00.dat')

    def table(name):
        t = read_table(archive.read_entry(f'data/database/{name}.dat'))
        return {struct.unpack_from('<I', r)[0]: (r, s) for r, s in zip(t.records, _string_groups(t))}

    anime, replacement, texture = table('anime'), table('animereplacetexture'), table('texture')
    replacement_pool = read_table(archive.read_entry('data/database/animereplacetexture.dat')).string_pool
    banks = {2: FairyBank(fairy.read_entry('data/fairy/resident.fad')),
             3: FairyBank(fairy.read_entry('data/fairy/resident_2.fad'))}
    metadata: dict = {'source': 'Steam build 24969282, YMWR ground tiles and FAD scene nodes',
                      'bounds': BOUNDS, 'scale': .5, 'seasons': list(SEASONS), 'crops': {}, 'objects': {}}
    if not args.skip_ground:
        for season in SEASONS:
            print('Ground', season, flush=True)
            image = ground_image(maps.read_entry(f'data/map/map_0000_{season}.ymwr.mat'), BOUNDS)
            image.resize((image.width//2, image.height//2), Image.Resampling.LANCZOS).save(dest/f'{season}.webp', quality=88)

    @lru_cache(maxsize=24)
    def texture_image(id):
        return decode_nltx_image(textures.read_entry(texture[id][1][2]))

    def replacements(id):
        if id not in replacement:
            return {}
        record, _ = replacement[id]
        count = struct.unpack_from('<I', record, 24)[0]
        result = {}
        for i in range(count):
            offset, length, tex = struct.unpack_from('<III', record, 28+i*12)
            result[replacement_pool[offset:offset+length].decode('utf-8')] = tex
        return result

    def save_sprite(rendered):
        if not rendered:
            return None
        image, anchor = rendered
        # Browser/Pillow interpolation must not reveal RGB padding under alpha=0.
        clean = Image.new('RGBA', image.size)
        clean.alpha_composite(image)
        digest = hashlib.sha256(clean.tobytes()+str(anchor).encode()).hexdigest()[:20]
        path = dest/'sprites'/f'{digest}.webp'
        if not path.exists():
            clean.save(path, quality=92, method=4)
        return {'file': f'sprites/{digest}.webp', 'x': anchor[0], 'y': anchor[1], 'w': image.width, 'h': image.height}

    metadata['soils'] = {}
    for id, (record, _) in table('farmland').items():
        if id not in (1, 2):
            continue
        image = texture_image(struct.unpack_from('<I', record, 24)[0])
        x, y, left, _, _, top, _, bottom, right, _ = struct.unpack_from('<10I', record, 48)
        metadata['soils'][str(id)] = save_sprite((image.crop((left, top, right, bottom)), (left-x, top-y)))

    @lru_cache(maxsize=None)
    def export(anime_id, reps, frames_requested=()):
        if anime_id not in anime:
            return None
        record, strings = anime[anime_id]
        bank_id = struct.unpack_from('<I', record, 24)[0]
        bank = banks.get(bank_id)
        model = strings[2]
        if not bank or model not in bank.entries:
            return None
        ids = bank.sequence_ids(model)
        frames = [i for i in frames_requested if i in ids] if frames_requested else [100 if 100 in ids else 1 if 1 in ids else next((i for i in ids if i > 0), 0)]
        seasons = []
        for rep in reps:
            mapping = replacements(rep)
            resolve = lambda name: texture_image(mapping[name]) if name in mapping and mapping[name] in texture else None
            variants = {}
            for frame in frames:
                sprite = save_sprite(bank.render(model, frame, resolve))
                if sprite:
                    variants[str(frame)] = sprite
            seasons.append(variants)
        bank.textures.clear()
        return {'model': model, 'seasons': seasons} if any(seasons) else None

    for id, (r, _) in table('crops').items():
        # Variable-length prerequisite lists precede the animation reference.
        # Validate the full animation + four seasonal replacement tuple.
        offset = next((o for o in range(112, 256, 4)
                       if struct.unpack_from('<I', r, o)[0] in anime
                       and anime[struct.unpack_from('<I', r, o)[0]][1][2].startswith(('gim_', 'obj_'))
                       and 0 < struct.unpack_from('<I', r, o+80)[0] <= 10
                       and all(struct.unpack_from('<I', r, o+8+i*8)[0] in replacement or struct.unpack_from('<I', r, o+8+i*8)[0] == 0 for i in range(4))), None)
        if offset is None:
            continue
        cursor = offset+80
        count = struct.unpack_from('<I', r, cursor)[0]
        cursor += 4
        states = {}
        for _ in range(count):
            state, stage_count = struct.unpack_from('<II', r, cursor)
            cursor += 8
            stages = []
            for _ in range(stage_count):
                threshold = struct.unpack_from('<I', r, cursor)[0]
                sequence = struct.unpack_from('<I', r, cursor+12)[0]
                stages.append([threshold, sequence])
                cursor += 272
            states[str(state)] = stages
        frames = tuple(sorted({stage[1] for stages in states.values() for stage in stages}))
        result = export(struct.unpack_from('<I', r, offset)[0], tuple(struct.unpack_from('<I', r, offset+8+i*8)[0] for i in range(4)), frames)
        if result:
            metadata['crops'][str(id)] = {**result, 'states': states}
    print('Crop art', len(metadata['crops']), flush=True)
    specs = json.loads((ROOT/'data/sources/game-save-map.json').read_text(encoding='utf-8'))
    wanted = {o['id'] for o in specs['objects']}
    for index, (id, (r, strings)) in enumerate(table('gimmick').items()):
        if id not in wanted and 'ARCHITECTURE' not in strings[0]:
            continue
        result = export(struct.unpack_from('<I', r, 80)[0], tuple(struct.unpack_from('<4I', r, 88)))
        if result:
            metadata['objects'][str(id)] = result
        if index % 100 == 0:
            print('Object art', index, len(metadata['objects']), flush=True)
    (ROOT/'data/sources/game-map-art.json').write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (dest/'manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    print('Complete', len(metadata['crops']), 'crops;', len(metadata['objects']), 'objects', flush=True)


if __name__ == '__main__':
    main()
