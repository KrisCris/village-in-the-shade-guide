"""Read static first-frame scene art from the game's FAD and YMWR containers.

Coordinates are native screen-world pixels, not an orthogonal tile projection.
Only texture nodes are rendered; collision shapes and animation events are ignored.
"""
from __future__ import annotations

import math
import struct
from collections.abc import Callable

from PIL import Image

from .texture import decode_nltx_image

Matrix = tuple[float, float, float, float, float, float]
IDENTITY: Matrix = (1, 0, 0, 1, 0, 0)


def multiply(a: Matrix, b: Matrix) -> Matrix:
    return (a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5])


def point(m: Matrix, x: float, y: float) -> tuple[float, float]:
    return m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]


class FairyBank:
    def __init__(self, data: bytes):
        self.data = data
        self.base = struct.unpack_from('<I', data, 20)[0]
        self.entries: dict[str, tuple[int, int]] = {}
        # The first entry's payload marks the end of the fixed-width index.
        end = struct.unpack_from('<I', data, 96)[0]
        for offset in range(80, end, 32):
            name = data[offset:offset+8].rstrip(b'\0').decode('ascii', errors='ignore')
            size, kind, pos = struct.unpack_from('<III', data, offset+8)
            if name and kind == 2 and pos+size <= len(data):
                self.entries[name] = (pos, size)
        self.textures: dict[int, tuple[str, Image.Image] | None] = {}

    def texture(self, key: int) -> tuple[str, Image.Image] | None:
        if key in self.textures:
            return self.textures[key]
        offset = 80 + (self.base + key)*32
        result = None
        if key >= 0 and offset+32 <= len(self.data):
            size, kind, pos = struct.unpack_from('<III', self.data, offset+8)
            if kind == 0 and pos+size <= len(self.data) and self.data[pos+64:pos+72] == b'NMPLTEX1':
                name = self.data[offset:offset+8].rstrip(b'\0').decode('ascii')
                result = name, decode_nltx_image(self.data[pos+64:pos+size])
        self.textures[key] = result
        return result

    def sequence_ids(self, name: str) -> list[int]:
        pos, size = self.entries[name]
        data = self.data[pos:pos+size]
        count = struct.unpack_from('<H', data, 40)[0]
        start = struct.unpack_from('<I', data, 64)[0]
        return [struct.unpack_from('<H', data, start+i*32)[0] for i in range(count)]

    def shapes(self, name: str, sequence: int) -> list[dict]:
        """Read collision rectangles with their native hierarchy and pivots."""
        pos, size = self.entries[name]
        data = self.data[pos:pos+size]
        count = struct.unpack_from('<H', data, 40)[0]
        seq, _, nodes, keys = struct.unpack_from('<4I', data, 64)
        offset = next((seq+i*32 for i in range(count) if struct.unpack_from('<H', data, seq+i*32)[0] == sequence), None)
        if offset is None:
            return []
        shapes, visited = [], set()
        def walk(index, parent):
            if index < 0 or index in visited:
                return
            visited.add(index)
            node = nodes+index*32
            child, sibling, count, key = struct.unpack_from('<4i', data, node+8)
            transform = parent
            if count:
                offset = keys+key*160
                f = struct.unpack_from('<26f', data, offset+4)
                co, si = math.cos(f[13]), math.sin(f[13])
                transform = multiply(parent, (f[11]*co, f[11]*si, -f[12]*si, f[12]*co, f[9], f[10]))
                flags = struct.unpack_from('<I', data, offset+132)[0]
                if flags & 0x100 and f[5] > 0 and f[6] > 0:
                    corners = [point(transform, x-f[7], y-f[8]) for x,y in [(0,0),(f[5],0),(f[5],f[6]),(0,f[6])]]
                    shapes.append({'name': data[node:node+8].rstrip(b'\0').decode('ascii',errors='replace'),
                                   'flags': flags, 'points': [[round(x,4),round(y,4)] for x,y in corners]})
            walk(child, transform)
            walk(sibling, parent)
        walk(struct.unpack_from('<i', data, offset+8)[0], IDENTITY)
        return shapes

    def render(self, name: str, sequence: int, replacement: Callable[[str], Image.Image | None] | None = None):
        pos, size = self.entries[name]
        data = self.data[pos:pos+size]
        count = struct.unpack_from('<H', data, 40)[0]
        seq_start, _, nodes, keys = struct.unpack_from('<4I', data, 64)
        sequence_offset = next((seq_start+i*32 for i in range(count)
                                if struct.unpack_from('<H', data, seq_start+i*32)[0] == sequence), None)
        if sequence_offset is None:
            return None
        first = struct.unpack_from('<i', data, sequence_offset+8)[0]
        pieces: list[tuple[Image.Image, Matrix]] = []
        visited: set[int] = set()

        def walk(index: int, parent: Matrix):
            if index < 0 or index in visited:
                return
            visited.add(index)
            node = nodes+index*32
            if node+32 > keys:
                raise ValueError('FAD node leaves node table')
            child, sibling, key_count, key_index = struct.unpack_from('<4i', data, node+8)
            transform = parent
            if key_count:
                offset = keys+key_index*160
                texture_id = struct.unpack_from('<i', data, offset)[0]
                f = struct.unpack_from('<26f', data, offset+4)
                sx, sy, angle = f[11:14]
                co, si = math.cos(angle), math.sin(angle)
                transform = multiply(parent, (sx*co, sx*si, -sy*si, sy*co, f[9], f[10]))
                texture = self.texture(texture_id)
                if texture and f[5] > 0 and f[6] > 0:
                    texture_name, image = texture
                    if replacement:
                        alternate = replacement(texture_name)
                        if alternate is not None:
                            image = alternate
                    x, y, width, height, anchor_x, anchor_y = f[3:9]
                    piece = image.crop((round(x), round(y), round(x+width), round(y+height)))
                    pieces.append((piece, multiply(transform, (1, 0, 0, 1, -anchor_x, -anchor_y))))
            walk(child, transform)
            walk(sibling, parent)

        walk(first, IDENTITY)
        if not pieces:
            return None
        corners = [point(m, x, y) for im, m in pieces for x, y in [(0, 0), (im.width, 0), (0, im.height), im.size]]
        left, top = math.floor(min(p[0] for p in corners)), math.floor(min(p[1] for p in corners))
        right, bottom = math.ceil(max(p[0] for p in corners)), math.ceil(max(p[1] for p in corners))
        if right-left > 8192 or bottom-top > 8192:
            raise ValueError('FAD composition exceeds sprite bounds')
        out = Image.new('RGBA', (max(1, right-left), max(1, bottom-top)))
        # FAD sibling lists are front-to-back (roof precedes building walls).
        for im, m in reversed(pieces):
            a, b, c, d, e, f = m
            determinant = a*d-b*c
            if abs(determinant) < 1e-8:
                continue
            e -= left
            f -= top
            inverse = (d/determinant, -c/determinant, (c*f-d*e)/determinant,
                       -b/determinant, a/determinant, (b*e-a*f)/determinant)
            out.alpha_composite(im.transform(out.size, Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC))
        bounds = out.getbbox()
        if bounds is None:
            return None
        return out.crop(bounds), (left+bounds[0], top+bounds[1])


def ground_image(data: bytes, bounds: tuple[int, int, int, int], columns: int = 720) -> Image.Image:
    count, texture_bytes = struct.unpack_from('<II', data)
    base = 8+count*8+texture_bytes
    left, top, right, bottom = bounds
    out = Image.new('RGBA', (right-left, bottom-top))
    for y in range(top//256, math.ceil(bottom/256)):
        for x in range(left//256, math.ceil(right/256)):
            offset, size, _ = struct.unpack_from('<III', data, base+(y*columns+x)*12)
            if not size:
                continue
            tile_x, tile_y = struct.unpack_from('<II', data, base+offset)
            if (tile_x, tile_y) != (x, y):
                raise ValueError('YMWR tile index disagrees with tile coordinates')
            image = decode_nltx_image(data[base+offset+8:base+offset+8+size])
            out.alpha_composite(image, (x*256-left, y*256-top))
    return out
