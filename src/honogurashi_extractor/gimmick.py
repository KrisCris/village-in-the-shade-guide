"""Decode the trailing gimmick feature vector and texture override.

The final 48 bytes are fixed. Immediately before them is a u32 count followed
by u64 feature IDs. The texture override is the u32 preceding that vector.
Zero high words in the IDs are not empty-vector headers: choose the outermost
valid vector, and validate its IDs against gimmickFeature.dat.
"""
import struct


def gimmick_features(record: bytes, known_ids: set[int]) -> tuple[list[int], int]:
    candidates = []
    for count in range(1, len(known_ids) + 1):
        offset = len(record) - 52 - count * 8
        if offset < 124 or struct.unpack_from('<I', record, offset)[0] != count:
            continue
        values = list(struct.unpack_from(f'<{count}Q', record, offset + 4))
        if len(set(values)) == count and all(value in known_ids for value in values):
            candidates.append((count, offset, values))
    if candidates:
        _, offset, values = max(candidates)
    else:
        offset, values = len(record) - 52, []
        if struct.unpack_from('<I', record, offset)[0] != 0:
            raise ValueError('Invalid gimmick feature vector')
    return values, struct.unpack_from('<I', record, offset - 4)[0]
