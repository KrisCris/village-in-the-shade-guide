from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path


HEADER = struct.Struct("<8sIIQQQ")
ENTRY = struct.Struct("<QQQQQQ")
MAGIC = b"FAFULLFS"


class ArchiveFormatError(ValueError):
    """Raised when an archive cannot be read without leaving its bounds."""


@dataclass(frozen=True, slots=True)
class ArchiveEntry:
    name: str
    offset: int
    size: int
    checksum: int


class FafullfsArchive:
    def __init__(self, path: Path, entries: tuple[ArchiveEntry, ...]) -> None:
        self.path = path
        self._entries = entries
        self._entries_by_name = {entry.name: entry for entry in entries}

    @classmethod
    def open(cls, path: Path) -> "FafullfsArchive":
        path = Path(path)
        file_size = path.stat().st_size
        with path.open("rb") as stream:
            raw_header = stream.read(HEADER.size)
            if len(raw_header) != HEADER.size:
                raise ArchiveFormatError("archive header is truncated")
            magic, file_count, _reserved, names_offset, names_size, info_offset = HEADER.unpack(
                raw_header
            )
            if magic != MAGIC:
                raise ArchiveFormatError("invalid FAFULLFS magic")
            cls._require_range(info_offset, file_count * ENTRY.size, file_size, "entry table")
            cls._require_range(names_offset, names_size, file_size, "name table")

            stream.seek(names_offset)
            names = stream.read(names_size)
            stream.seek(info_offset)
            entries: list[ArchiveEntry] = []
            for _ in range(file_count):
                raw_entry = stream.read(ENTRY.size)
                if len(raw_entry) != ENTRY.size:
                    raise ArchiveFormatError("entry table is truncated")
                checksum, name_offset, _zero, size, offset, _timestamp = ENTRY.unpack(raw_entry)
                name = cls._read_name(names, name_offset)
                cls._require_range(offset, size, file_size, f"entry {name!r}")
                entries.append(ArchiveEntry(name=name, offset=offset, size=size, checksum=checksum))

        if len({entry.name for entry in entries}) != len(entries):
            raise ArchiveFormatError("archive contains duplicate entry names")
        return cls(path=path, entries=tuple(entries))

    @staticmethod
    def _require_range(offset: int, size: int, file_size: int, label: str) -> None:
        if offset < 0 or size < 0 or offset > file_size or size > file_size - offset:
            raise ArchiveFormatError(f"{label} is outside archive")

    @staticmethod
    def _read_name(names: bytes, offset: int) -> str:
        if offset >= len(names):
            raise ArchiveFormatError("entry name offset is outside name table")
        end = names.find(b"\0", offset)
        if end < 0:
            raise ArchiveFormatError("entry name is not null terminated")
        try:
            return names[offset:end].decode("utf-8")
        except UnicodeDecodeError as error:
            raise ArchiveFormatError("entry name is not valid UTF-8") from error

    def entries(self) -> tuple[ArchiveEntry, ...]:
        return self._entries

    def read_entry(self, name: str) -> bytes:
        try:
            entry = self._entries_by_name[name]
        except KeyError as error:
            raise KeyError(f"archive entry not found: {name}") from error
        with self.path.open("rb") as stream:
            stream.seek(entry.offset)
            payload = stream.read(entry.size)
        if len(payload) != entry.size:
            raise ArchiveFormatError(f"entry {name!r} became truncated while reading")
        return payload
