from __future__ import annotations

import json

import pytest

from honogurashi_extractor.audit import AuditError, audit_snapshot


def test_audit_rejects_duplicate_entity_ids(tmp_path):
    entities = tmp_path / "entities"
    entities.mkdir()
    (entities / "items.json").write_text(
        json.dumps([{"id": "ITEM_ONE"}, {"id": "ITEM_ONE"}]), encoding="utf-8"
    )
    (tmp_path / "issues.json").write_text("[]", encoding="utf-8")

    with pytest.raises(AuditError, match="duplicate"):
        audit_snapshot(tmp_path)
