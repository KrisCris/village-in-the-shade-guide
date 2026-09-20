"""Export native farm terrain and first-frame scene sprites; never runs the game."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import zlib
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.gimmick import gimmick_features
from honogurashi_extractor.map_art import FairyBank, ground_image
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table
from honogurashi_extractor.texture import decode_nltx_image

ROOT = Path(__file__).resolve().parents[1]
SEASONS = ('spr', 'sum', 'aut', 'win')
BOUNDS = (7936, 18688, 14336, 27648)


def save_rules(metadata):
    """Keep texture URLs and seasonal frames out of the save serializer bundle."""
    rules = {
        'rooms': {key: [{'bounds': floor['bounds']} for floor in floors] for key, floors in metadata['rooms'].items()},
        'crops': {key: {'model': value['model'], 'states': value.get('states', {})} for key, value in metadata['crops'].items()},
        'objects': {key: {'initial': value['initial'], 'directional': value['directional'],
                         'seasons': [{seq: {k: frame[k] for k in ('x','y','w','h')} for seq, frame in value['seasons'][0].items()}]}
                    for key, value in metadata['objects'].items()}
    }
    (ROOT/'data/sources/game-map-rules.json').write_text(json.dumps(rules,separators=(',',':'))+'\n',encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--skip-ground', action='store_true')
    parser.add_argument('--update-objects', action='store_true')
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
    feature_ids = set(table('gimmickfeature'))
    replacement_pool = read_table(archive.read_entry('data/database/animereplacetexture.dat')).string_pool
    banks = {2: FairyBank(fairy.read_entry('data/fairy/resident.fad')),
             3: FairyBank(fairy.read_entry('data/fairy/resident_2.fad'))}
    metadata: dict = {'source': 'Steam build 24969282, YMWR ground tiles and FAD scene nodes',
                      'bounds': BOUNDS, 'scale': .5, 'seasons': list(SEASONS), 'crops': {}, 'objects': {}}
    specs = json.loads((ROOT/'data/sources/game-save-map.json').read_text(encoding='utf-8'))
    if args.update_objects:
        metadata = json.loads((dest/'manifest.json').read_text(encoding='utf-8'))
    else:
        metadata['rooms'] = {}
    room_maps = table('map')
    (dest/'rooms').mkdir(exist_ok=True)
    room_cache = {}
    fixture_cache = {}
    gimmicks = table('gimmick')
    for scene in ([] if args.update_objects else specs['scenes']):
        if 'OPENWORLD' in scene['code']:
            continue
        path = room_maps[scene['id']][1][2]
        if path not in room_cache:
            head = maps.read_entry(path+'.head')
            if head.startswith(b'YKCMP_V1'):
                head = zlib.decompress(head[20:])
            cols, rows = struct.unpack_from('<2I', head, 52)
            header = struct.unpack_from('<19I', head)
            start = 76+header[3]*72+header[12]*112+header[8]*84
            fixtures = []
            for i in range(header[11]):
                offset = start+i*208
                id, x, y, angle = struct.unpack_from('<4i', head, offset)
                if id not in gimmicks:
                    raise ValueError(f'Unknown YMWR fixture at {path}:{offset}: {id}')
                scale = struct.unpack_from('<f', head, offset+16)[0]
                mirror = bool(struct.unpack_from('<I', head, offset+20)[0])
                require = struct.unpack_from('<i', head, offset+36)[0]
                fixtures.append(dict(id=id, x=x, y=y, angle=angle, scale=scale, mirror=mirror, require=require))
            fixture_cache[path] = fixtures
            mat = maps.read_entry(path+'.mat')
            count, size = struct.unpack_from('<II', mat)
            base = 8+count*8+size
            tiles = [(i % cols, i // cols) for i in range(cols*rows)
                     if struct.unpack_from('<I', mat, base+i*12+4)[0]]
            bounds = (min(x for x,y in tiles)*256, min(y for x,y in tiles)*256,
                      (max(x for x,y in tiles)+1)*256, (max(y for x,y in tiles)+1)*256)
            image = ground_image(mat, bounds, cols)
            # Upstairs shares a YMWR map with the ground floor. Separate the two
            # disconnected rooms at the native terrain gap, never rotate them.
            cuts = [bounds]
            if scene['code'] in ('MAP_ID_MYHOUSE_LV3_01', 'MAP_ID_MYHOUSE_LV4_01'):
                axis = 0 if 'LV3' in scene['code'] else 1
                coords = sorted({c[axis]*45 for c in scene['cells']})
                lo, hi = max(zip(coords, coords[1:]), key=lambda p: p[1]-p[0])
                split = (lo+hi)//2
                first, second = list(bounds), list(bounds)
                first[axis+2], second[axis] = split, split
                cuts = [tuple(first), tuple(second)] if axis == 0 else [tuple(second), tuple(first)]
            floors = []
            for index, cut in enumerate(cuts):
                crop = image.crop((cut[0]-bounds[0], cut[1]-bounds[1], cut[2]-bounds[0], cut[3]-bounds[1]))
                rgb = crop.convert('RGB').split()
                tight = ImageChops.lighter(ImageChops.lighter(rgb[0], rgb[1]), rgb[2]).point(lambda p: 255 if p > 8 else 0).getbbox()
                if not tight:
                    raise ValueError(f'Empty room {path} floor {index}')
                cropped = crop.crop(tight)
                local = [cut[0]+tight[0],cut[1]+tight[1],cut[0]+tight[2],cut[1]+tight[3]]
                file = f'rooms/{Path(path).stem}-{index}.webp'
                cropped.save(dest/file, quality=92, method=4)
                floors.append({'file': file, 'bounds': local})
            room_cache[path] = floors
        metadata['rooms'][str(scene['id'])] = [
            {**floor, 'bounds': [v+scene['origin'][i%2] for i,v in enumerate(floor['bounds'])],
             'fixtures': [{**f, 'x': f['x']+scene['origin'][0], 'y': f['y']+scene['origin'][1]}
                          for f in fixture_cache[path] if floor['bounds'][0]-80 <= f['x'] <= floor['bounds'][2]+80
                          and floor['bounds'][1]-80 <= f['y'] <= floor['bounds'][3]+80]}
            for floor in room_cache[path]]
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
        if id not in (1, 2, 3):
            continue
        image = texture_image(struct.unpack_from('<I', record, 24)[0])
        x, y, left, _, _, top, _, bottom, right, _ = struct.unpack_from('<10I', record, 48)
        metadata['soils'][str(id)] = save_sprite((image.crop((left, top, right, bottom)), (left-x, top-y)))

    @lru_cache(maxsize=None)
    def export(anime_id, reps, frames_requested=(), mirror=False, furniture_rep=0):
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
            mapping.update(replacements(furniture_rep))
            resolve = lambda name: texture_image(mapping[name]) if name in mapping and mapping[name] in texture else None
            variants = {}
            for frame in frames:
                rendered = bank.render(model, frame, resolve)
                if rendered and mirror:
                    image, (x, y) = rendered
                    rendered = (image.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (-x-image.width, y))
                sprite = save_sprite(rendered)
                if sprite:
                    variants[str(frame)] = sprite
            seasons.append(variants)
        bank.textures.clear()
        return {'model': model, 'seasons': seasons} if any(seasons) else None

    for id, (r, _) in ([] if args.update_objects else table('crops').items()):
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
    wanted = {o['id'] for o in specs['objects']}
    furnishings = {o['id'] for o in specs['objects'] if o['itemId']}
    fixture_ids = {f['id'] for fixtures in fixture_cache.values() for f in fixtures}
    for index, (id, (r, strings)) in enumerate(gimmicks.items()):
        if id not in wanted and id not in fixture_ids and not any(k in strings[0] for k in ('ARCHITECTURE', 'INDOOR')):
            continue
        anime_id, initial = struct.unpack_from('<I', r, 80)[0], struct.unpack_from('<I', r, 112)[0]
        # Doghouse has no directional variants; the in-game entrance faces southwest (user reference).
        mirror = bool(struct.unpack_from('<I', r, 120)[0]) or strings[0]=='GIMMICK_ID_ARCHITECTURE_DOG_HOUSE'
        # Furnishings override the base animation atlas independently of season.
        furniture_rep = gimmick_features(r, feature_ids)[1]
        if furniture_rep not in replacement:
            furniture_rep = 0
        record, anim_strings = anime.get(anime_id, (b'', ()))
        bank = banks.get(struct.unpack_from('<I', record, 24)[0]) if record else None
        ids = bank.sequence_ids(anim_strings[2]) if bank and anim_strings[2] in bank.entries else []
        initial = initial or (100 if 100 in ids else 1)
        directions = struct.unpack_from('<'+'I'*struct.unpack_from('<I',r,124)[0],r,128)
        directional = any(initial+i in ids for i in directions)
        frames = tuple(i for i in ([initial,*[initial+i for i in directions]] if directional else [initial]) if i in ids)
        result = export(anime_id, tuple(struct.unpack_from('<4I', r, 88)), frames, mirror, furniture_rep)
        if result:
            metadata['objects'][str(id)] = {**result, 'initial': initial, 'directional': directional, 'mirror': mirror, 'replacement': furniture_rep,
                                           'mapId': int(strings[strings.index('mapID')+1]) if 'mapID' in strings and strings[strings.index('mapID')+1].isdigit() else 0,
                                           'hidden': 'INDOOR_MYHOUSE_LIGHT' in strings[0] or 'FLOORMASK' in strings[0] or 'FLOOR_MASK' in strings[0]}
        if index % 100 == 0:
            print('Object art', index, len(metadata['objects']), flush=True)
    for floors in ([] if args.update_objects else metadata['rooms'].values()):
        for floor in floors:
            visible = []
            for fixture in floor['fixtures']:
                entity = metadata['objects'].get(str(fixture['id']))
                if not entity or entity['hidden']:
                    continue
                variants = entity['seasons'][0]
                sprite = variants.get(str(entity['initial'])) or next(iter(variants.values()))
                if fixture['mirror']:
                    image = Image.open(dest/sprite['file']).convert('RGBA')
                    sprite = save_sprite((image.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (-sprite['x']-sprite['w'],sprite['y'])))
                scale = fixture['scale']
                fixture['art'] = {**sprite, **{k: sprite[k]*scale for k in ('x','y','w','h')}}
                visible.append(fixture)
            floor['fixtures'] = visible
    (ROOT/'data/sources/game-map-art.json').write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (dest/'manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    save_rules(metadata)
    print('Complete', len(metadata['crops']), 'crops;', len(metadata['objects']), 'objects', flush=True)


if __name__ == '__main__':
    main()
