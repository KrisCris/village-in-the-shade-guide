from __future__ import annotations

import struct


HEADER = struct.Struct("<IIII")


def build_table(*, records: list[bytes], strings: bytes) -> bytes:
    if not records:
        raise ValueError("at least one record is required")
    record_bytes = sum(len(record) for record in records)
    header = HEADER.pack(len(records), record_bytes, len(strings), len(records[0]))
    encoded_records = bytearray()
    for index, record in enumerate(records):
        encoded_records.extend(record)
        if index + 1 < len(records):
            encoded_records.extend(struct.pack("<I", len(records[index + 1])))
    return header + encoded_records + strings
