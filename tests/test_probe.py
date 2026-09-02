from __future__ import annotations

from honogurashi_extractor.probe import build_probe
from honogurashi_extractor.table import read_table
from tests.fixtures.build_table import build_table


def test_probe_reports_rows_strings_and_cross_table_id_matches():
    items = read_table(
        build_table(
            records=[
                b"".join(value.to_bytes(4, "little") for value in (100, 0, 0, 8)),
                b"".join(value.to_bytes(4, "little") for value in (200, 0, 9, 8)),
            ],
            strings=b"ITEM_ONE\0ITEM_TWO\0",
        )
    )
    recipes = read_table(
        build_table(
            records=[
                b"".join(value.to_bytes(4, "little") for value in (1, 100, 0, 10)),
                b"".join(value.to_bytes(4, "little") for value in (2, 200, 11, 10)),
            ],
            strings=b"RECIPE_ONE\0RECIPE_TWO\0",
        )
    )

    report = build_probe({"item": items, "recipe": recipes})

    assert report["tables"]["item"]["record_sizes"] == {"16": 2}
    assert report["tables"]["item"]["representative_rows"][0]["strings"] == [
        "ITEM_ONE"
    ]
    assert report["tables"]["recipe"]["fields"]["4"]["foreign_keys"] == {
        "item": 2
    }


def test_probe_follows_string_offsets_when_record_order_differs():
    table = read_table(
        build_table(
            records=[
                b"".join(value.to_bytes(4, "little") for value in (2, 0, 9, 8)),
                b"".join(value.to_bytes(4, "little") for value in (1, 0, 0, 8)),
            ],
            strings=b"ITEM_ONE\0ITEM_TWO\0",
        )
    )

    rows = build_probe({"item": table})["tables"]["item"][
        "representative_rows"
    ]

    assert rows[0]["strings"] == ["ITEM_TWO"]
    assert rows[1]["strings"] == ["ITEM_ONE"]
