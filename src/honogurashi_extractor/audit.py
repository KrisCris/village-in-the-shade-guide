from __future__ import annotations

import json
from pathlib import Path


class AuditError(ValueError):
    """Raised when generated data would expose a broken guide relationship."""


def audit_snapshot(root: Path) -> dict[str, int]:
    root = Path(root)
    collections: dict[str, list[dict[str, object]]] = {}
    for path in sorted((root / "entities").glob("*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        ids = [row["id"] for row in rows]
        if len(ids) != len(set(ids)):
            raise AuditError(f"duplicate entity ID in {path.name}")
        collections[path.stem] = rows

    issues = json.loads((root / "issues.json").read_text(encoding="utf-8"))
    if issues:
        raise AuditError(f"snapshot has {len(issues)} unresolved core relationships")

    items = {row["id"] for row in collections.get("items", [])}
    machines = {row["id"] for row in collections.get("machines", [])}
    for crop in collections.get("crops", []):
        _require_ids(items, crop.get("seed_item_ids", []), crop["id"], "seed")
        _require_ids(items, crop.get("harvest_item_ids", []), crop["id"], "harvest")
    for process in collections.get("processes", []):
        if not process.get("duration_minutes"):
            raise AuditError(f"process {process['id']} has no duration")
        _require_ids(machines, process.get("machine_ids", []), process["id"], "machine")
        _require_ids(
            items,
            [row["item_id"] for row in process.get("inputs", [])],
            process["id"],
            "input",
        )
        _require_ids(items, [process["output"]["item_id"]], process["id"], "output")
    return {name: len(rows) for name, rows in collections.items()}


def _require_ids(known: set[str], values, owner: str, field: str) -> None:
    missing = sorted(set(values) - known)
    if missing:
        raise AuditError(f"{owner} has broken {field} references: {missing}")
