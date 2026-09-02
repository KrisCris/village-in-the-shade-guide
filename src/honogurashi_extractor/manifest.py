from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from .models import Snapshot


@dataclass(frozen=True, slots=True)
class Provenance:
    app_id: int
    build_id: str
    archive_sha256: str
    table_sha256: dict[str, str]
    extractor_version: str


ENTITY_FILES = {
    "items": "items.json",
    "crops": "crops.json",
    "machines": "machines.json",
    "processes": "processes.json",
    "craft_recipes": "craft-recipes.json",
    "cooking_recipes": "cooking-recipes.json",
    "store_offers": "store-offers.json",
    "fish": "fish.json",
    "livestock": "livestock.json",
    "characters": "characters.json",
    "facilities": "facilities.json",
    "facility_releases": "facility-releases.json",
    "quests": "quests.json",
    "collectibles": "collectibles.json",
    "hunt_rewards": "hunt-rewards.json",
    "weather": "weather.json",
}


def _json_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    ).encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_snapshot(
    snapshot: Snapshot, output: Path, provenance: Provenance
) -> Path:
    output = Path(output)
    entities_dir = output / "entities"
    entities_dir.mkdir(parents=True, exist_ok=True)
    generated: dict[str, str] = {}
    counts: dict[str, int] = {}

    for attribute, filename in ENTITY_FILES.items():
        collection = getattr(snapshot, attribute)
        payload = [asdict(collection[key]) for key in sorted(collection)]
        data = _json_bytes(payload)
        relative = f"entities/{filename}"
        (output / relative).write_bytes(data)
        generated[relative] = _sha256(data)
        counts[attribute] = len(payload)

    issues_data = _json_bytes([asdict(issue) for issue in snapshot.issues])
    (output / "issues.json").write_bytes(issues_data)
    generated["issues.json"] = _sha256(issues_data)

    manifest = {
        "format": 1,
        "app_id": provenance.app_id,
        "build_id": provenance.build_id,
        "archive_sha256": provenance.archive_sha256,
        "table_sha256": dict(sorted(provenance.table_sha256.items())),
        "extractor_version": provenance.extractor_version,
        "counts": counts,
        "issue_count": len(snapshot.issues),
        "generated_files": generated,
    }
    (output / "manifest.json").write_bytes(_json_bytes(manifest))
    return output
