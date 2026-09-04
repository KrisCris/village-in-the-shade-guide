import struct

import honogurashi_extractor.icons as icons
from honogurashi_extractor.icons import icon_bounds


def test_icon_bounds_uses_the_first_quad_extent():
    record = bytearray(240)
    struct.pack_into("<8f", record, 28, 0, 128, 0, 128, 128, 128, 128, 0)

    assert icon_bounds(bytes(record)) == (128, 0, 128, 128)


def test_item_icon_ids_are_relative_to_variable_record_length():
    for record_size, icon_id, outline_icon_id in ((512, 2018, 4983), (528, 1488, 4462), (536, 1503, 4477)):
        record = bytearray(record_size)
        struct.pack_into("<I", record, record_size - 52, icon_id)
        struct.pack_into("<I", record, record_size - 44, outline_icon_id)
        if 484 not in (record_size - 52, record_size - 44):
            struct.pack_into("<I", record, 484, 9999)
        if 492 not in (record_size - 52, record_size - 44):
            struct.pack_into("<I", record, 492, 9999)

        assert icons.item_icon_id(bytes(record)) == icon_id
        assert icons.item_outline_icon_id(bytes(record)) == outline_icon_id
