from __future__ import annotations

import struct

import pytest

from honogurashi_extractor.table import TableFormatError, read_table
from tests.fixtures.build_table import build_table


def test_splits_records_auxiliary_index_and_strings():
    """Changing any section boundary must break the observable split."""
    payload = build_table(
        records=[b"\x01\0\0\0AAAA", b"\x02\0\0\0BBBB"],
        strings=b"ID_ONE\0ID_TWO\0",
    )

    table = read_table(payload)

    assert table.record_count == 2
    assert table.record_size == 8
    assert table.records[1][:4] == b"\x02\0\0\0"
    assert table.auxiliary_index == (8,)
    assert table.strings() == ("ID_ONE", "ID_TWO")


def test_uses_interleaved_sizes_to_read_variable_length_records():
    """Assuming one fixed stride must fail on the real crops-table layout."""
    payload = build_table(
        records=[b"\x01\0\0\0AAAA", b"\x02\0\0\0BBBBCCCC"],
        strings=b"ROW_ONE\0ROW_TWO\0",
    )

    table = read_table(payload)

    assert [len(record) for record in table.records] == [8, 12]
    assert table.auxiliary_index == (12,)
    assert table.strings() == ("ROW_ONE", "ROW_TWO")


def test_rejects_record_byte_count_that_disagrees_with_shape():
    """Ignoring the declared record bytes must admit a shifted string pool."""
    payload = bytearray(build_table(records=[b"1234", b"5678"], strings=b"ID\0"))
    struct.pack_into("<I", payload, 4, 9)

    with pytest.raises(TableFormatError):
        read_table(bytes(payload))


def test_rejects_truncated_declared_sections():
    """Removing the total-length check must allow partial table data."""
    payload = build_table(records=[b"1234"], strings=b"ID\0")[:-1]

    with pytest.raises(TableFormatError, match="length"):
        read_table(payload)


def test_reports_invalid_utf8_in_string_pool():
    """Silently replacing invalid bytes would corrupt official names."""
    table = read_table(build_table(records=[b"1234"], strings=b"\xff\0"))

    with pytest.raises(TableFormatError, match="UTF-8"):
        table.strings()
