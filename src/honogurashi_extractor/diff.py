from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class EntityChange:
    collection: str
    entity_id: str
    before: dict[str, object]
    after: dict[str, object]


@dataclass(frozen=True, slots=True)
class SnapshotDiff:
    added: tuple[str, ...]
    removed: tuple[str, ...]
    changed: tuple[EntityChange, ...]
    localization_changed: tuple[EntityChange, ...]


def _entities(root: Path) -> dict[str, tuple[str, dict[str, object]]]:
    result = {}
    for path in sorted((Path(root) / "entities").glob("*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            result[row["id"]] = (path.stem, row)
    return result


def diff_snapshots(before: Path, after: Path) -> SnapshotDiff:
    old = _entities(before)
    new = _entities(after)
    added = tuple(sorted(new.keys() - old.keys()))
    removed = tuple(sorted(old.keys() - new.keys()))
    changed = []
    localization_changed = []
    for entity_id in sorted(old.keys() & new.keys()):
        old_collection, old_row = old[entity_id]
        new_collection, new_row = new[entity_id]
        if old_row == new_row and old_collection == new_collection:
            continue
        change = EntityChange(new_collection, entity_id, old_row, new_row)
        old_without_name = {key: value for key, value in old_row.items() if key != "name"}
        new_without_name = {key: value for key, value in new_row.items() if key != "name"}
        if old_without_name == new_without_name:
            localization_changed.append(change)
        else:
            changed.append(change)
    return SnapshotDiff(
        added=added,
        removed=removed,
        changed=tuple(changed),
        localization_changed=tuple(localization_changed),
    )
