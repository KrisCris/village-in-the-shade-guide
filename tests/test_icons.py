import struct

from honogurashi_extractor.icons import icon_bounds


def test_icon_bounds_uses_the_first_quad_extent():
    record = bytearray(240)
    struct.pack_into("<8f", record, 28, 0, 128, 0, 128, 128, 128, 128, 0)

    assert icon_bounds(bytes(record)) == (128, 0, 128, 128)
