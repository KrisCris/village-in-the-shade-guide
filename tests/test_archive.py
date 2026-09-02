from __future__ import annotations

import struct

import pytest

from honogurashi_extractor.archive import ArchiveFormatError, FafullfsArchive
from tests.fixtures.build_fafullfs import ENTRY, HEADER, build_fafullfs


def test_lists_and_reads_entries(tmp_path):
    """A wrong entry/name offset must not still produce the expected file list."""
    archive_path = build_fafullfs(
        tmp_path,
        {"data/a.dat": b"alpha", "data/b.dat": b"beta"},
    )

    archive = FafullfsArchive.open(archive_path)

    assert [entry.name for entry in archive.entries()] == ["data/a.dat", "data/b.dat"]
    assert archive.read_entry("data/b.dat") == b"beta"


def test_rejects_invalid_magic(tmp_path):
    """Removing the signature check must make this malformed archive pass."""
    archive_path = build_fafullfs(tmp_path, {"data/a.dat": b"alpha"})
    data = bytearray(archive_path.read_bytes())
    data[:8] = b"NOTFULL!"
    archive_path.write_bytes(data)

    with pytest.raises(ArchiveFormatError, match="magic"):
        FafullfsArchive.open(archive_path)


def test_rejects_entry_outside_archive(tmp_path):
    """Dropping bounds validation must expose an impossible archive entry."""
    archive_path = build_fafullfs(tmp_path, {"data/a.dat": b"alpha"})
    data = bytearray(archive_path.read_bytes())
    _, _, _, _, _, info_offset = HEADER.unpack_from(data)
    checksum, name_offset, reserved, size, _, timestamp = ENTRY.unpack_from(data, info_offset)
    ENTRY.pack_into(
        data,
        info_offset,
        checksum,
        name_offset,
        reserved,
        size,
        len(data) + 10,
        timestamp,
    )
    archive_path.write_bytes(data)

    with pytest.raises(ArchiveFormatError, match="outside archive"):
        FafullfsArchive.open(archive_path)
