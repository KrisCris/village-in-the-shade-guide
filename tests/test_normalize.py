from __future__ import annotations

import struct

from honogurashi_extractor.localization import build_name
from honogurashi_extractor.normalize import _growth_data, normalize_snapshot
from honogurashi_extractor.table import read_table
from tests.fixtures.build_table import build_table


def _localized_group(internal: str, ja: str, zh_hant: str) -> bytes:
    values = [internal, ja, "", "", "", zh_hant, ""]
    return ("\0".join(values) + "\0").encode()


def _record(size: int, values: dict[int, int]) -> bytes:
    result = bytearray(size)
    for offset, value in values.items():
        struct.pack_into("<I", result, offset, value)
    return bytes(result)


def test_growth_thresholds_are_converted_to_watered_days():
    one_harvest = _record(2108, {492: 100, 756: 200, 1020: 400, 1284: 600, 1548: 800})
    repeating = _record(3180, {492: 240, 756: 480, 1020: 720, 1284: 960, 1548: 1200, 1812: 4, 1816: 3, 2084: 100, 2348: 400})

    assert _growth_data(one_harvest) == (800, 8, None, None)
    assert _growth_data(repeating) == (1200, 12, 400, 4)


def test_store_conditions_keep_year_season_and_exclusion_separate():
    from honogurashi_extractor.normalize import _normalize_store
    from honogurashi_extractor.models import Snapshot
    from types import SimpleNamespace
    table = read_table(build_table(records=[_record(108, {
        0: 57, 16: 11170, 28: 1, 32: 526, 40: 1, 44: 86000,
        52: 1, 56: 2,
    })], strings=b"STORE_SALE_ID_GENERAL_0208\0"))
    snapshot = Snapshot()
    _normalize_store(table, {11170: SimpleNamespace(id="ITEM_ID_SEED_DAHLIA")}, snapshot)
    offer = snapshot.store_offers["STORE_SALE_ID_GENERAL_0208"]
    assert offer.seasons == ("autumn",)
    assert offer.required_flags == (526,)
    assert offer.excluded_flags == (86000,)
    assert offer.conditions == ("第二年秋起", "尚未解锁此款外观")


def test_official_names_and_aliases_are_preserved():
    name = build_name(
        ja="タマネギ",
        zh_hant="洋蔥",
        internal="CROPS_ID_ONION",
        overrides={"CROPS_ID_ONION": "洋葱"},
    )

    assert name.zh_hans == "洋葱"
    assert {"洋蔥", "タマネギ", "CROPS_ID_ONION"} <= set(name.aliases)
    assert name.review_status == "override"


def test_item_category_comes_from_the_game_category_table():
    item_group = _localized_group("ITEM_ID_CURSED_TEST", "呪物", "詛咒物")
    category_group = "ITEM_CATEGORY_CURSE\0呪い\0".encode()
    tables = {
        "item": read_table(
            build_table(
                records=[_record(496, {0: 800000, 8: 0, 12: 19, 280: 41, 296: 100})],
                strings=item_group,
            )
        ),
        "itemcategory": read_table(
            build_table(
                records=[_record(52, {0: 41, 8: 0, 12: 19})],
                strings=category_group,
            )
        ),
    }

    snapshot = normalize_snapshot(tables, {}, {})
    item = snapshot.items["ITEM_ID_CURSED_TEST"]

    assert item.category_numeric_id == 41
    assert item.category_id == "ITEM_CATEGORY_CURSE"
    assert item.category_name is not None
    assert item.category_name.zh_hans == "咒物"
    assert item.category_name.ja == "呪い"


def test_normalizes_crop_seed_and_processing_relationships():
    item_groups = [
        _localized_group("ITEM_ID_SEED_ONION", "タマネギの種", "洋蔥種子"),
        _localized_group("ITEM_ID_CROPS_ONION", "タマネギ", "洋蔥"),
        _localized_group("ITEM_ID_MACHINE_PICKLE", "漬物樽", "醃漬桶"),
        _localized_group("ITEM_ID_PICKLED_ONION", "タマネギの漬物", "醃洋蔥"),
        _localized_group("ITEM_ID_LIVESTOCK_CHICKEN", "ニワトリ", "雞"),
        _localized_group("ITEM_ID_COOKING_ONION_SOUP", "オニオンスープ", "洋蔥湯"),
    ]
    starts = []
    cursor = 0
    for group in item_groups:
        starts.append(cursor)
        cursor += len(group)
    item_records = [
        _record(
            496,
            {
                0: 10010,
                8: starts[0],
                12: 18,
                24: 100010,
                292: 40,
                296: 30,
                356: 1,
                444: 777,
                452: 778,
            },
        ),
        _record(496, {0: 100010, 8: starts[1], 12: 20, 296: 63}),
        _record(496, {0: 400000, 8: starts[2], 12: 22, 296: 37}),
        _record(496, {0: 200010, 8: starts[3], 12: 21, 296: 83}),
        _record(496, {0: 900000, 8: starts[4], 12: 25, 356: 1}),
        _record(496, {0: 60000, 8: starts[5], 12: 26, 296: 120}),
    ]
    crop_group = _localized_group("CROPS_ID_ONION", "タマネギ", "洋蔥")
    crop_record = _record(488, {0: 1, 8: 0, 12: 14})
    process_group = ("GIMMICK_PROCESS_PICKLED_ONION\0タマネギの漬物\0").encode()
    process_record = _record(
        104,
        {
            0: 1001,
            8: 0,
            12: 29,
            24: 2,
            28: 240010000,
            36: 240010000,
            44: 100010,
            52: 1,
            68: 200010,
            76: 1,
            80: 1380,
        },
    )
    gimmick_group = ("GIMMICK_ID_STORAGE_JAR\0保存ジャー\0").encode()
    gimmick_record = _record(
        96, {0: 240010000, 8: 0, 12: 22, 48: 400000}
    )
    cooking_group = ("COOKING_ID_ONION_SOUP\0オニオンスープ\0").encode()
    cooking_record = _record(
        176, {0: 13, 8: 0, 12: 21, 24: 60000, 32: 1, 52: 100010, 68: 2}
    )
    tables = {
        "item": read_table(
            build_table(records=item_records, strings=b"".join(item_groups))
        ),
        "crops": read_table(build_table(records=[crop_record], strings=crop_group)),
        "gimmickprocess": read_table(
            build_table(records=[process_record], strings=process_group)
        ),
        "gimmick": read_table(
            build_table(records=[gimmick_record], strings=gimmick_group)
        ),
        "cooking": read_table(
            build_table(records=[cooking_record], strings=cooking_group)
        ),
    }

    snapshot = normalize_snapshot(tables, {}, {"CROPS_ID_ONION": "洋葱"})

    seed = snapshot.items["ITEM_ID_SEED_ONION"]
    crop = snapshot.crops["CROPS_ID_ONION"]
    process = snapshot.processes["GIMMICK_PROCESS_PICKLED_ONION"]
    assert crop.seed_item_ids == ("ITEM_ID_SEED_ONION",)
    assert seed.icon_id == 777
    assert seed.outline_icon_id == 778
    assert crop.harvest_item_ids == ("ITEM_ID_CROPS_ONION",)
    assert process.machine_ids == ("ITEM_ID_MACHINE_PICKLE", "ITEM_ID_MACHINE_PICKLE")
    assert process.inputs[0].item_id == "ITEM_ID_CROPS_ONION"
    assert process.output.item_id == "ITEM_ID_PICKLED_ONION"
    assert process.duration_minutes == 1380
    assert process.name.zh_hans == "腌洋葱"
    assert snapshot.cooking_recipes["COOKING_ID_ONION_SOUP"].name.zh_hans == "洋葱汤"
