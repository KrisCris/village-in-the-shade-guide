import struct

import pytest
from PIL import Image

from honogurashi_extractor.map_art import FairyBank, ground_image, multiply, point


def test_affine_parent_translation_and_mirroring():
    transform = multiply((1, 0, 0, 1, 12, 8), (-1, 0, 0, 2, 0, 0))
    assert point(transform, 3, 4) == (9, 16)


def test_fad_preserves_parent_anchor_and_front_to_back_layers():
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
        if i == 1:
            struct.pack_into('<I', chunk, offset+132, 0x60100)
    data = bytearray(112)+chunk
    data[80:88] = b'test_map'
    struct.pack_into('<III', data, 88, len(chunk), 2, 112)
    bank = FairyBank(bytes(data))
    bank.texture = lambda key: ('red' if key == 1000 else 'blue', Image.new('RGBA', (2, 2), 'red' if key == 1000 else 'blue')) if key >= 0 else None
    image, anchor = bank.render('test_map', 1)
    assert anchor == (9, 19)
    assert image.getpixel((0, 0)) == (255, 0, 0, 255)
    assert bank.render('test_map', 99) is None
    assert bank.shapes('test_map', 1) == [{'name': '', 'flags': 0x60100, 'points': [[9,19],[11,19],[11,21],[9,21]]}]
    assert bank.shapes('test_map', 99) == []


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
