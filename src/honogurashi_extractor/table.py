from __future__ import annotations

import struct
from dataclasses import dataclass


HEADER = struct.Struct("<IIII")
UINT32 = struct.Struct("<I")


class TableFormatError(ValueError):
    """Raised when a database container has inconsistent boundaries."""


@dataclass(frozen=True, slots=True)
class TableContainer:
    record_count: int
    record_size: int
    records: tuple[bytes, ...]
    auxiliary_index: tuple[int, ...]
    string_pool: bytes

    def strings(self) -> tuple[str, ...]:
        try:
            text = self.string_pool.decode("utf-8")
        except UnicodeDecodeError as error:
            raise TableFormatError("string pool is not valid UTF-8") from error
        values = text.split("\0")
        if values and values[-1] == "":
            values.pop()
        return tuple(values)


def read_table(data: bytes) -> TableContainer:
    if len(data) < HEADER.size:
        raise TableFormatError("table length is shorter than its header")
    record_count, record_bytes, string_bytes, record_size = HEADER.unpack_from(data)
    if record_count == 0 or record_size == 0:
        raise TableFormatError("table must contain non-empty records")
    separator_bytes = (record_count - 1) * UINT32.size
    expected_length = HEADER.size + record_bytes + separator_bytes + string_bytes
    if len(data) != expected_length:
        raise TableFormatError(
            f"table length mismatch: declared {expected_length}, actual {len(data)}"
        )

    strings_start = len(data) - string_bytes
    cursor = HEADER.size
    next_record_size = record_size
    records: list[bytes] = []
    auxiliary_index: list[int] = []
    for index in range(record_count):
        if next_record_size == 0 or cursor + next_record_size > strings_start:
            raise TableFormatError("record size leaves the declared record bytes")
        records.append(data[cursor : cursor + next_record_size])
        cursor += next_record_size
        if index + 1 < record_count:
            if cursor + UINT32.size > strings_start:
                raise TableFormatError("record size separator is truncated")
            next_record_size = UINT32.unpack_from(data, cursor)[0]
            auxiliary_index.append(next_record_size)
            cursor += UINT32.size

    parsed_record_bytes = sum(len(record) for record in records)
    if parsed_record_bytes != record_bytes or cursor != strings_start:
        raise TableFormatError(
            f"parsed record bytes {parsed_record_bytes} disagree with declared {record_bytes}"
        )
    return TableContainer(
        record_count=record_count,
        record_size=record_size,
        records=tuple(records),
        auxiliary_index=tuple(auxiliary_index),
        string_pool=data[strings_start:],
    )
