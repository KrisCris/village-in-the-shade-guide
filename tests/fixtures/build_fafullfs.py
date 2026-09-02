from __future__ import annotations

import struct
from collections.abc import Mapping
from pathlib import Path


HEADER = struct.Struct("<8sIIQQQ")
ENTRY = struct.Struct("<QQQQQQ")


def build_fafullfs(tmp_path: Path, files: Mapping[str, bytes]) -> Path:
    """Create the smallest valid archive matching the game's observed layout."""
    names = bytearray()
    name_offsets: dict[str, int] = {}
    for name in files:
        name_offsets[name] = len(names)
        names.extend(name.encode("utf-8") + b"\0")

    data_offset = HEADER.size
    payload = bytearray()
    rows: list[bytes] = []
    for name, content in files.items():
        offset = data_offset + len(payload)
        payload.extend(content)
        rows.append(ENTRY.pack(0, name_offsets[name], 0, len(content), offset, 0))

    info_offset = data_offset + len(payload)
    names_offset = info_offset + len(rows) * ENTRY.size
    header = HEADER.pack(b"FAFULLFS", len(rows), 0, names_offset, len(names), info_offset)
    archive_path = tmp_path / "data.dat"
    archive_path.write_bytes(header + payload + b"".join(rows) + names)
    return archive_path
