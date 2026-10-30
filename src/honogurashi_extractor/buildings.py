"""Village buildings placed by the open-world YMWR, drawn from their FAD parts.

A building is a placed gimmick with an interior map (`mapID`) to warp into. The
game draws each visible part (ground, walls, roof, doors) from its own sequence
and depth-sorts it by the part's `pri01`–`pri02` line; night light masks are a
separate layer and are left out. Buildings a save holds (the player's house and
farm buildings) and buildings that wait for a story flag are not drawn here.
"""
from __future__ import annotations

import struct
from collections.abc import Iterable

from PIL import Image

from .gimmick import SCENE_LAYER, gimmick_parts
from .map_art import FairyBank, fixtures
from .probe import _string_groups
from .table import read_table
from .texture import decode_nltx_image

Sprite = tuple[Image.Image, tuple[int, int], float]


def is_building(strings: tuple[str, ...]) -> bool:
    """Whether a gimmick's strings name an interior map, as every enterable building does."""
    return 'mapID' in strings and strings.index('mapID')+1 < len(strings) and strings[strings.index('mapID')+1].isdigit()


def mirrored(sprite: Sprite, x: int) -> Sprite:
    """Flip a sprite about the vertical line through x."""
    image, (left, top), depth = sprite
    return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (2*x-left-image.width, top), depth


class BuildingArt:
    """Season-aware building sprites from the database tables and the resident FAD banks."""

    def __init__(self, archive, textures, banks: dict[int, FairyBank]):
        def table(name):
            t = read_table(archive.read_entry(f'data/database/{name}.dat'))
            return t, {struct.unpack_from('<I', r)[0]: (r, s) for r, s in zip(t.records, _string_groups(t))}

        gimmicks, self.gimmicks = table('gimmick')
        self.pool = gimmicks.string_pool
        _, self.anime = table('anime')
        replacements, self.replacements = table('animereplacetexture')
        self.replacement_pool = replacements.string_pool
        _, self.texture_paths = table('texture')
        self.textures = textures
        self.banks = banks
        self.cache: dict[tuple[int, int], list[Sprite]] = {}

    def placed(self, head: bytes, saved: Iterable[int] = ()) -> list[dict]:
        """The building fixtures of a YMWR head, leaving out save-held and story-gated ones."""
        saved = set(saved)
        result = []
        for fixture in fixtures(head):
            if fixture['id'] not in self.gimmicks:
                raise ValueError(f'Unknown YMWR fixture: {fixture["id"]}')
            if is_building(self.gimmicks[fixture['id']][1]) and fixture['id'] not in saved and fixture['require'] < 0:
                if fixture['angle']:
                    raise ValueError(f'Turned building fixture {fixture["id"]} is not supported')
                result.append(fixture)
        return result

    def replacement(self, id: int) -> dict[str, int]:
        """Texture name → texture ID substitutions of an animereplacetexture record."""
        if id not in self.replacements:
            return {}
        record, _ = self.replacements[id]
        result = {}
        for i in range(struct.unpack_from('<I', record, 24)[0]):
            offset, length, texture = struct.unpack_from('<III', record, 28+i*12)
            result[self.replacement_pool[offset:offset+length].decode('utf-8')] = texture
        return result

    def parts(self, gimmick: int, season: int) -> list[Sprite]:
        """A building's visible parts at the origin, unmirrored, with seasonal textures (0 = spring … 3 = winter)."""
        record, _ = self.gimmicks[gimmick]
        replacement = struct.unpack_from('<4I', record, 88)[season]
        key = (gimmick, replacement)
        if key in self.cache:
            return self.cache[key]
        anime, model = self.anime[struct.unpack_from('<I', record, 80)[0]]
        bank = self.banks[struct.unpack_from('<I', anime, 24)[0]]
        model = model[2]
        mapping = self.replacement(replacement)
        decoded: dict[int, Image.Image] = {}

        def resolve(name):
            texture = mapping.get(name)
            if texture not in self.texture_paths:
                return None
            if texture not in decoded:
                decoded[texture] = decode_nltx_image(self.textures.read_entry(self.texture_paths[texture][1][2]))
            return decoded[texture]

        sprites = []
        sequences = set(bank.sequence_ids(model))
        for part in gimmick_parts(record, self.pool):
            if not part['visible'] or part['layer'] != SCENE_LAYER or part['sequence'] not in sequences:
                continue
            rendered = bank.render(model, part['sequence'], resolve)
            if not rendered:
                continue
            image, anchor = rendered
            line = bank.sort_line(model, part['sequence'])
            sprites.append((image, anchor, max(line[0][1], line[1][1]) if line else 0))
        bank.textures.clear()
        self.cache[key] = sprites
        return sprites

    def sprites(self, buildings: Iterable[dict], season: int) -> list[Sprite]:
        """World-placed building parts: (image, top-left, depth) for `scenery_image`."""
        result = []
        for building in buildings:
            x, y, scale = building['x'], building['y'], building['scale']
            # Mirrored gimmick variants flip their art; a mirrored placement flips it again.
            flip = building['mirror'] != bool(struct.unpack_from('<I', self.gimmicks[building['id']][0], 120)[0])
            for image, (left, top), depth in self.parts(building['id'], season):
                if scale != 1:
                    image = image.resize((max(1, round(image.width*scale)), max(1, round(image.height*scale))), Image.Resampling.LANCZOS)
                sprite = (image, (round(x+left*scale), round(y+top*scale)), y+depth*scale)
                result.append(mirrored(sprite, x) if flip else sprite)
        return result
