"""Decode gimmick records: their parts and the trailing feature vector.

The final 48 bytes are fixed. Immediately before them is a u32 count followed
by u64 feature IDs. The texture override is the u32 preceding that vector.
Zero high words in the IDs are not empty-vector headers: choose the outermost
valid vector, and validate its IDs against gimmickFeature.dat.
"""
import struct

# The draw layer of parts drawn with the scene; night light masks use another.
SCENE_LAYER = 21


def gimmick_parts(record: bytes, pool: bytes) -> list[dict]:
    """The named parts a gimmick shows, each playing its own FAD sequence.

    After the direction list, the script name and 23 parameter pairs comes a
    part count. A part is 184 bytes plus three u32 lists and one list of
    strings; strings are (offset, length) pairs in the table's string pool.
    """
    def u32(offset):
        if offset+4 > len(record):
            raise ValueError('Gimmick part list leaves the record')
        return struct.unpack_from('<I', record, offset)[0]

    cursor = 128+4*u32(124)+8+8+46*8
    count, cursor = u32(cursor), cursor+4
    parts = []
    for _ in range(count):
        offset, length, visible, _, sequence, _, layer = (u32(cursor+i*4) for i in range(7))
        end = cursor+104
        for _ in range(3):
            end += 4+4*u32(end)
        end += 12+40+8
        end += 4+8*u32(end)+4
        parts.append(dict(name=pool[offset:offset+length].decode('utf-8'), visible=bool(visible),
                          sequence=sequence, layer=layer))
        cursor = end
    if cursor > len(record):
        raise ValueError('Gimmick part list leaves the record')
    return parts


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
