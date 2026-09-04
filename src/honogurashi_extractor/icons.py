from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .archive import FafullfsArchive
from .table import TableContainer, read_table
from .texture import decode_nltx_image


@dataclass(frozen=True, slots=True)
class IconExtractionReport:
    requested: int
    written: int
    missing_icon: int
    failed: int


def _u32(record: bytes, offset: int) -> int:
    if offset + 4 > len(record):
        return 0
    return struct.unpack_from("<I", record, offset)[0]


def _table_string(table: TableContainer, record: bytes, offset: int) -> str:
    start = _u32(record, offset)
    size = _u32(record, offset + 4)
    if start + size > len(table.string_pool):
        raise ValueError("database string points outside its pool")
    return table.string_pool[start : start + size].decode("utf-8")


def item_icon_id(record: bytes) -> int:
    return _u32(record, len(record) - 52) if len(record) >= 52 else 0


def item_outline_icon_id(record: bytes) -> int:
    return _u32(record, len(record) - 44) if len(record) >= 44 else 0


def icon_bounds(record: bytes) -> tuple[int, int, int, int]:
    if len(record) < 48:
        raise ValueError("icon record is truncated")
    _depth, x, y, width, height = struct.unpack_from("<5f", record, 28)
    values = tuple(round(value) for value in (x, y, width, height))
    if any(value < 0 for value in values[:2]) or any(value <= 0 for value in values[2:]):
        raise ValueError("icon record has invalid bounds")
    return values


def _find_texture_archive(game_dir: Path, texture_paths: set[str]) -> FafullfsArchive:
    for path in sorted((game_dir / "data").glob("texture*.dat")):
        archive = FafullfsArchive.open(path)
        names = {entry.name for entry in archive.entries()}
        if texture_paths & names:
            return archive
    raise FileNotFoundError("no texture archive contains the requested icon atlases")


def extract_item_icons(
    game_dir: Path, snapshot_dir: Path, output_dir: Path
) -> IconExtractionReport:
    items_path = snapshot_dir / "entities" / "items.json"
    items = json.loads(items_path.read_text(encoding="utf-8"))
    requested = len(items)

    database_archive = FafullfsArchive.open(game_dir / "data.dat")
    item_table = read_table(database_archive.read_entry("data/database/item.dat"))
    icon_table = read_table(database_archive.read_entry("data/database/icon.dat"))
    texture_table = read_table(database_archive.read_entry("data/database/texture.dat"))

    item_records = {_u32(record, 0): record for record in item_table.records}
    icon_records = {_u32(record, 0): record for record in icon_table.records}
    texture_records = {_u32(record, 0): record for record in texture_table.records}

    texture_paths = {
        _table_string(texture_table, record, 24)
        for record in texture_table.records
        if _table_string(texture_table, record, 24).endswith(".nltx")
    }
    texture_archive = _find_texture_archive(game_dir, texture_paths)
    texture_entries = {entry.name for entry in texture_archive.entries()}
    atlas_cache: dict[str, Image.Image] = {}
    output_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    missing_icon = 0
    failed = 0
    for item in items:
        try:
            item_record = item_records.get(int(item["numeric_id"]))
            icon_id = item_icon_id(item_record) if item_record else 0
            icon_record = icon_records.get(icon_id)
            if not icon_record:
                missing_icon += 1
                continue
            texture_record = texture_records.get(_u32(icon_record, 24))
            if not texture_record:
                missing_icon += 1
                continue
            texture_path = _table_string(texture_table, texture_record, 24)
            if texture_path not in texture_entries:
                missing_icon += 1
                continue
            atlas = atlas_cache.get(texture_path)
            if atlas is None:
                atlas = decode_nltx_image(texture_archive.read_entry(texture_path))
                atlas_cache[texture_path] = atlas
            x, y, width, height = icon_bounds(icon_record)
            if x + width > atlas.width or y + height > atlas.height:
                raise ValueError("icon bounds exceed texture atlas")
            icon = atlas.crop((x, y, x + width, y + height))
            icon.save(output_dir / f"{item['id']}.webp", "WEBP", lossless=True)
            written += 1
        except (KeyError, TypeError, ValueError, OSError):
            failed += 1

    return IconExtractionReport(requested, written, missing_icon, failed)
