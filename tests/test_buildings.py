import struct

import pytest
from PIL import Image

from honogurashi_extractor.buildings import BuildingArt, is_building, mirrored


def test_buildings_are_gimmicks_with_an_interior_map():
    assert is_building(('GIMMICK_ID_ARCHITECTURE_LIBRARY', '図書館', 'gimmick_architecture_library', 'mapID', '201050001'))
    # Creature escape routes name an anchor, not a map; signs have no map at all.
    assert not is_building(('GIMMICK_ID_CREATURE_ESCAPE_ROUTE', 'mapID', 'anchor'))
    assert not is_building(('GIMMICK_ID_VILLAGE_SIGN', '村の掲示板', 'main'))
    assert not is_building(('GIMMICK_ID_BROKEN', 'mapID'))


def test_mirroring_flips_about_the_placement():
    image = Image.new('RGBA', (3, 1))
    image.putpixel((0, 0), (255, 0, 0, 255))
    flipped, at, depth = mirrored((image, (10, 5), 7.0), 12)
    assert at == (11, 5) and depth == 7.0
    assert flipped.getpixel((2, 0)) == (255, 0, 0, 255)


def head_with(*rows):
    head = bytearray(76)
    struct.pack_into('<I', head, 11*4, len(rows))
    for id, x, y, angle, mirror, require in rows:
        row = bytearray(208)
        struct.pack_into('<4ifI', row, 0, id, x, y, angle, 1.0, mirror)
        struct.pack_into('<i', row, 36, require)
        head += row
    return bytes(head)


def art_with(gimmicks):
    art = object.__new__(BuildingArt)
    art.gimmicks = gimmicks
    return art


def gimmick(*strings, mirror=0):
    record = bytearray(124)
    struct.pack_into('<I', record, 120, mirror)
    return bytes(record), strings


def test_placed_keeps_buildings_the_save_does_not_hold_and_that_wait_for_no_flag():
    art = art_with({1: gimmick('LIBRARY', 'mapID', '201050001'), 2: gimmick('SIGN'),
                    3: gimmick('MYHOUSE', 'mapID', '211000001')})
    head = head_with((1, 100, 200, 0, 0, -1), (2, 0, 0, 0, 0, -1), (3, 0, 0, 0, 0, -1), (1, 5, 5, 0, 0, 15219))
    assert [(b['id'], b['x']) for b in art.placed(head, saved={3})] == [(1, 100)]
    with pytest.raises(ValueError, match='Unknown'):
        art.placed(head_with((9, 0, 0, 0, 0, -1)))
    with pytest.raises(ValueError, match='Turned'):
        art.placed(head_with((1, 0, 0, 90, 0, -1)))


def test_sprites_place_scale_and_mirror_parts_about_the_fixture(monkeypatch):
    art = art_with({1: gimmick('A', 'mapID', '1'), 2: gimmick('B', 'mapID', '2', mirror=1)})
    part = Image.new('RGBA', (4, 2), 'red')
    monkeypatch.setattr(art, 'parts', lambda id, season: [(part, (-1, -2), 3.0)])
    building = {'x': 100, 'y': 200, 'scale': 1.0, 'mirror': False}
    (image, at, depth), = art.sprites([{**building, 'id': 1}], 0)
    assert (image.size, at, depth) == ((4, 2), (99, 198), 203.0)
    (image, at, depth), = art.sprites([{**building, 'id': 1, 'scale': 2.0}], 0)
    assert (image.size, at, depth) == ((8, 4), (98, 196), 206.0)
    # A mirrored placement of a mirrored gimmick cancels out; either one alone flips.
    assert art.sprites([{**building, 'id': 2, 'mirror': True}], 0)[0][1] == (99, 198)
    assert art.sprites([{**building, 'id': 1, 'mirror': True}], 0)[0][1] == (97, 198)
