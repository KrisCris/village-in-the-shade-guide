import struct
import pytest
from honogurashi_extractor.gimmick import gimmick_features


@pytest.mark.parametrize('ids,replacement', [([], 0), ([1], 708), ([1, 7, 9, 10, 14, 35], 997)])
def test_texture_override_tracks_variable_feature_vector(ids, replacement):
    record = bytes(700) + struct.pack('<II', replacement, len(ids))
    record += b''.join(struct.pack('<Q', value) for value in ids) + bytes(48)
    assert gimmick_features(record, {1, 7, 9, 10, 14, 35}) == (ids, replacement)


def test_invalid_feature_vector_is_rejected():
    record = bytes(700) + struct.pack('<II', 12, 77) + bytes(48)
    with pytest.raises(ValueError):
        gimmick_features(record, {1, 7})
