from __future__ import annotations

from honogurashi_extractor.diff import diff_snapshots
from honogurashi_extractor.manifest import Provenance, write_snapshot
from honogurashi_extractor.models import Item, LocalizedName, Snapshot


def _snapshot(sell_price: int) -> Snapshot:
    name = LocalizedName(
        "洋葱", "洋蔥", "タマネギ", "ITEM_ID_CROPS_ONION", ("洋葱",), "override"
    )
    item = Item("ITEM_ID_CROPS_ONION", 100010, name, None, sell_price)
    return Snapshot(items={item.id: item})


def test_diff_reports_one_gameplay_value_change(tmp_path):
    provenance = Provenance(3934250, "24969282", "abc", {}, "0.1.0")
    before = write_snapshot(_snapshot(63), tmp_path / "before", provenance)
    after = write_snapshot(_snapshot(70), tmp_path / "after", provenance)

    result = diff_snapshots(before, after)

    assert result.added == ()
    assert result.removed == ()
    assert len(result.changed) == 1
    assert result.changed[0].entity_id == "ITEM_ID_CROPS_ONION"
    assert result.changed[0].before["sell_price"] == 63
    assert result.changed[0].after["sell_price"] == 70
    assert result.localization_changed == ()
