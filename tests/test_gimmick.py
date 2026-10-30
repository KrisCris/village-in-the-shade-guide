import struct
import pytest
from honogurashi_extractor.gimmick import SCENE_LAYER, gimmick_features, gimmick_parts


@pytest.mark.parametrize('ids,replacement', [([], 0), ([1], 708), ([1, 7, 9, 10, 14, 35], 997)])
def test_texture_override_tracks_variable_feature_vector(ids, replacement):
    record = bytes(700) + struct.pack('<II', replacement, len(ids))
    record += b''.join(struct.pack('<Q', value) for value in ids) + bytes(48)
    assert gimmick_features(record, {1, 7, 9, 10, 14, 35}) == (ids, replacement)


def test_invalid_feature_vector_is_rejected():
    record = bytes(700) + struct.pack('<II', 12, 77) + bytes(48)
    with pytest.raises(ValueError):
        gimmick_features(record, {1, 7})


def gimmick_part(name, visible, sequence, layer, lists=((), (), ()), strings=0):
    data = bytearray(104)
    struct.pack_into('<7I', data, 0, *name, visible, 0, sequence, 0, layer)
    for values in lists:
        data += struct.pack(f'<{len(values)+1}I', len(values), *values)
    data += bytes(12+40+8)
    return bytes(data + struct.pack('<I', strings) + bytes(8*strings) + bytes(4))


def gimmick_record(*parts, directions=()):
    record = bytearray(124) + struct.pack(f'<{len(directions)+1}I', len(directions), *directions)
    record += bytes(8+8+46*8) + struct.pack('<I', len(parts))
    return bytes(record + b''.join(parts))


def test_parts_skip_variable_lists_and_keep_sequence_and_layer():
    pool = b'groundlight_mask'
    record = gimmick_record(
        gimmick_part((0, 6), 1, 110, SCENE_LAYER, lists=((), (2,), ()), strings=4),
        gimmick_part((6, 10), 1, 0, 17),
        directions=(1, 2))
    assert gimmick_parts(record + bytes(52), pool) == [
        {'name': 'ground', 'visible': True, 'sequence': 110, 'layer': SCENE_LAYER},
        {'name': 'light_mask', 'visible': True, 'sequence': 0, 'layer': 17}]


def test_truncated_part_list_is_rejected():
    record = gimmick_record(gimmick_part((0, 6), 1, 110, SCENE_LAYER, strings=2))
    with pytest.raises(ValueError, match='leaves the record'):
        gimmick_parts(record[:-20], b'ground')
