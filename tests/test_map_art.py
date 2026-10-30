import struct

import pytest
from PIL import Image

from honogurashi_extractor.map_art import FairyBank, decals, fixtures, ground_image, multiply, point, scenery_image


def test_affine_parent_translation_and_mirroring():
    transform = multiply((1, 0, 0, 1, 12, 8), (-1, 0, 0, 2, 0, 0))
    assert point(transform, 3, 4) == (9, 16)


def fad_bank(hidden=(), names=None):
    chunk = bytearray(720)
    struct.pack_into('<H', chunk, 40, 1)
    struct.pack_into('<4I', chunk, 64, 112, 144, 144, 240)
    struct.pack_into('<H', chunk, 112, 1)
    struct.pack_into('<4i', chunk, 152, 1, -1, 1, 0)
    struct.pack_into('<4i', chunk, 184, -1, 2, 1, 1)
    struct.pack_into('<4i', chunk, 216, -1, -1, 1, 2)
    for i, key in enumerate((-1, 1000, 1001)):
        offset = 240+i*160
        struct.pack_into('<i', chunk, offset, key)
        floats = [0.0]*26
        floats[5:9] = [2, 2, 1, 1]
        floats[11:13] = [1, 1]
        if i == 0:
            floats[9:11] = [10, 20]
        struct.pack_into('<26f', chunk, offset+4, *floats)
        # Four RGBA vertex colours; zero alpha hides the node.
        struct.pack_into('<16f', chunk, offset+64, *([1.0, 1.0, 1.0, 0.0 if i in hidden else 1.0]*4))
        if i == 1:
            struct.pack_into('<I', chunk, offset+132, 0x60100)
    for i, name in (names or {}).items():
        chunk[144+i*32:144+i*32+len(name)] = name
    data = bytearray(112)+chunk
    data[80:88] = b'test_map'
    struct.pack_into('<III', data, 88, len(chunk), 2, 112)
    bank = FairyBank(bytes(data))
    bank.texture = lambda key: ('red' if key == 1000 else 'blue', Image.new('RGBA', (2, 2), 'red' if key == 1000 else 'blue')) if key >= 0 else None
    return bank


def test_fad_preserves_parent_anchor_and_front_to_back_layers():
    bank = fad_bank()
    image, anchor = bank.render('test_map', 1)
    assert anchor == (9, 19)
    assert image.getpixel((0, 0)) == (255, 0, 0, 255)
    assert bank.render('test_map', 99) is None
    assert bank.shapes('test_map', 1) == [{'name': '', 'flags': 0x60100, 'points': [[9,19],[11,19],[11,21],[9,21]]}]
    assert bank.shapes('test_map', 99) == []


def test_fad_skips_nodes_with_zero_vertex_alpha():
    # Furniture frames keep their whole texture sheet as a hidden node; drawing it doubled the bed.
    image, _ = fad_bank(hidden={1}).render('test_map', 1)
    assert image.getpixel((0, 0)) == (0, 0, 255, 255)


def test_fad_slots_are_pos_node_origins():
    bank = fad_bank(names={0: b'pos01', 2: b'center'})
    assert bank.slots('test_map', 1) == {'pos01': [10.0, 20.0]}
    assert bank.slots('test_map', 99) == {}


def test_ground_index_uses_relative_offsets_and_verifies_coordinates(monkeypatch):
    data = bytearray(36)
    struct.pack_into('<III', data, 8, 12, 8, 0)
    struct.pack_into('<II', data, 20, 0, 0)
    data[28:36] = b'example!'
    def decode(blob):
        assert blob == b'example!'
        return Image.new('RGBA', (256, 256), 'green')
    monkeypatch.setattr('honogurashi_extractor.map_art.decode_nltx_image', decode)
    assert ground_image(bytes(data), (0, 0, 256, 256), 1).getpixel((128, 128)) == (0, 128, 0, 255)
    struct.pack_into('<I', data, 20, 1)
    with pytest.raises(ValueError, match='coordinates'):
        ground_image(bytes(data), (0, 0, 256, 256), 1)


def decal_head(*rows):
    head = bytearray(76)
    struct.pack_into('<I', head, 8*4, len(rows))
    for texture, x, y, w, h, px, py, scale, flip, alpha in rows:
        row = bytearray(84)
        struct.pack_into('<9i2fIii', row, 0, texture, x, y, w, h, px, py, 8, 8, 0.0, scale, flip, 0, alpha)
        struct.pack_into('<4i', row, 64, 0, h, w, h)
        head += row
    return bytes(head)


def test_decals_are_placed_by_top_left_and_scaled_about_the_pivot(monkeypatch):
    mat = bytearray(16)
    struct.pack_into('<III', mat, 0, 1, 0, 0)
    texture = Image.new('RGBA', (8, 8))
    texture.paste((255, 0, 0, 255), (0, 0, 1, 4))
    monkeypatch.setattr('honogurashi_extractor.map_art.decode_nltx_image', lambda blob: texture)
    head = decal_head((0, 10, 20, 4, 4, 2, 4, 1.0, 1, 128), (0, 30, 20, 4, 4, 2, 4, 0.5, 0, 255))
    first, second = decals(head)
    assert (first['x'], first['y'], first['flip'], first['px']) == (10, 20, True, 2)
    assert second['depth'] == 24
    image = scenery_image(head, bytes(mat), (0, 0, 40, 40))
    # Flipped: the red left column moves to the right edge; alpha scales opacity.
    assert image.getpixel((13, 20)) == (255, 0, 0, 128)
    assert image.getpixel((10, 20))[3] == 0
    # Half scale around the bottom-centre pivot (32, 24): drawn at (31, 22) as a 2x2 sprite whose red column is x=31.
    assert image.getbbox() == (13, 20, 32, 24)
    assert image.getpixel((31, 22))[3] > 0


def test_fad_sort_line_is_the_pri_node_origins():
    bank = fad_bank(names={1: b'pri01', 2: b'pri02'})
    assert bank.origins('test_map', 1) == {'pri01': [10.0, 20.0], 'pri02': [10.0, 20.0]}
    assert bank.sort_line('test_map', 1) == ([10.0, 20.0], [10.0, 20.0])
    assert fad_bank(names={1: b'pri01'}).sort_line('test_map', 1) is None


def test_fixtures_follow_the_actor_sections():
    head = bytearray(76)
    struct.pack_into('<3I', head, 9*4, 1, 1, 2)
    head += bytes(56+48)
    for id, x, y, scale, mirror, require in ((101050000, 17725, 17674, 1.0, 0, -1), (102010002, 18630, 17370, 1.5, 1, 15219)):
        row = bytearray(208)
        struct.pack_into('<4ifI', row, 0, id, x, y, 0, scale, mirror)
        struct.pack_into('<i', row, 36, require)
        head += row
    assert fixtures(bytes(head)) == [
        {'id': 101050000, 'x': 17725, 'y': 17674, 'angle': 0, 'scale': 1.0, 'mirror': False, 'require': -1},
        {'id': 102010002, 'x': 18630, 'y': 17370, 'angle': 0, 'scale': 1.5, 'mirror': True, 'require': 15219}]


def test_sprites_sort_in_with_decals_by_depth_and_clip_to_bounds(monkeypatch):
    mat = bytearray(16)
    struct.pack_into('<III', mat, 0, 1, 0, 0)
    monkeypatch.setattr('honogurashi_extractor.map_art.decode_nltx_image', lambda blob: Image.new('RGBA', (8, 8), 'red'))
    # A red 4x4 decal at (10, 10) sorts by its line at y=14.
    head = decal_head((0, 10, 10, 4, 4, 2, 4, 1.0, 0, 255))
    behind, front = Image.new('RGBA', (4, 4), 'blue'), Image.new('RGBA', (4, 4), 'lime')
    image = scenery_image(head, bytes(mat), (0, 0, 16, 16), sprites=[(behind, (8, 8), 13), (front, (13, 13), 15)])
    assert image.getpixel((9, 9)) == (0, 0, 255, 255)
    assert image.getpixel((11, 11)) == (255, 0, 0, 255)
    assert image.getpixel((13, 13)) == (0, 255, 0, 255)
    # The part of a sprite outside the bounds is cut off, not shifted in.
    assert image.getbbox() == (8, 8, 16, 16)
    assert scenery_image(head, bytes(mat), (20, 20, 30, 30), sprites=[(front, (13, 13), 15)]).getbbox() is None
