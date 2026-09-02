from __future__ import annotations

from honogurashi_extractor.manifest import Provenance, write_snapshot
from honogurashi_extractor.models import Item, LocalizedName, Snapshot


def _snapshot() -> Snapshot:
    name = LocalizedName(
        "洋葱", "洋蔥", "タマネギ", "ITEM_ID_CROPS_ONION", ("洋葱",), "override"
    )
    item = Item("ITEM_ID_CROPS_ONION", 100010, name, None, 63)
    return Snapshot(items={item.id: item})


def test_snapshot_json_is_stable(tmp_path):
    provenance = Provenance(
        app_id=3934250,
        build_id="24969282",
        archive_sha256="abc",
        table_sha256={"item": "def"},
        extractor_version="0.1.0",
    )

    first = write_snapshot(_snapshot(), tmp_path / "a", provenance)
    second = write_snapshot(_snapshot(), tmp_path / "b", provenance)

    assert (first / "manifest.json").read_bytes() == (
        second / "manifest.json"
    ).read_bytes()
    assert (first / "entities/items.json").read_bytes() == (
        second / "entities/items.json"
    ).read_bytes()
