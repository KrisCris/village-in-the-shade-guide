from __future__ import annotations

import struct

from honogurashi_extractor.localization import build_name
from honogurashi_extractor.normalize import _crop_record, _extractor_item, _growth_data, _perennial, normalize_snapshot
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
    header = {76: 1, 84: 1, 92: 1, 100: 2, 216: 1, 220: 1, 224: 6}
    one_harvest = _record(2108, {**header, 492: 100, 756: 200, 1020: 400, 1284: 600, 1548: 800})
    repeating = _record(3180, {**header, 216: 2, 492: 240, 756: 480, 1020: 720, 1284: 960, 1548: 1200, 1812: 4, 1816: 3, 2084: 100, 2348: 400})

    assert _growth_data(one_harvest) == (800, 8, None, None)
    assert _growth_data(repeating) == (1200, 12, 400, 4)


def test_growth_reads_variable_arrays_and_stage_counts_for_mushrooms():
    mushroom = _record(2632, {
        76: 1, 84: 1, 92: 0, 96: 2, 212: 2,
        216: 1, 220: 5, 488: 200, 752: 400, 1016: 600, 1280: 800,
        1544: 4, 1548: 4, 1816: 100, 2080: 200, 2344: 400,
    })
    assert _growth_data(mushroom) == (800, 8, 400, 4)
    assert _growth_data(mushroom[:1500]) == (None, None, None, None)


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


def test_official_simplified_name_precedes_override_and_keeps_native_slots():
    name = build_name(ja="トバリ", zh_hant="帷", internal="CHARA_ID_ORPHAN",
                      overrides={"CHARA_ID_ORPHAN": "灯"},
                      translations={"ja": "トバリ", "zh-TW": "帷", "ko": "토바리", "zh-CN": "帷"})
    assert name.zh_hans == "帷"
    assert name.translations["ko"] == "토바리"
    assert name.review_status == "official"
    assert "灯" in name.aliases


def test_seven_language_item_scalars_description_and_seed_relationship():
    groups = []
    for internal in ("ITEM_ID_SEED_TEST", "ITEM_ID_CROP_TEST"):
        values = [internal]
        for ja, hant, hans in (("種", "種子", "官方种子"), ("", "", ""),
                                ("春に植える", "春天種植", "春天种植"), ("説明", "說明", "说明"), ("", "", "")):
            values.extend([ja, "", "", "", hant, "한국어", hans])
        groups.append(("\0".join(values) + "\0").encode())
    tables = {
        "item": read_table(build_table(records=[
            _record(544, {0: 1, 24: 2, 320: 4, 332: 80, 336: 60, 384: 1, 388: 11, 396: 17}),
            _record(536, {0: 2, 8: len(groups[0]), 336: 63}),
        ], strings=b"".join(groups)), language_count=7),
        "crops": read_table(build_table(records=[_record(500, {0: 17})],
            strings=("\0".join(["CROPS_TEST", "作物", "", "", "", "作物", "작물", "作物"]) + "\0").encode()), language_count=7),
    }
    snapshot = normalize_snapshot(tables, {}, {"ITEM_ID_SEED_TEST": "旧种子"})
    item = snapshot.items["ITEM_ID_SEED_TEST"]
    assert (item.buy_price, item.sell_price, item.category_numeric_id, item.feature_ids) == (80, 60, 4, (11,))
    assert item.name.zh_hans == "官方种子"
    assert item.description == "春天种植\n说明"
    assert item.description_translations["zh-TW"] == "春天種植\n說明"
    assert snapshot.crops["CROPS_TEST"].seed_item_ids == (item.id,)
    assert snapshot.crops["CROPS_TEST"].seasons == ("spring",)



def _crop_bytes(numeric_id, *, crop_type=1, suitable=(), sowing=(), harvest=(), land=(1,),
                features=(), forms=None, language_count=7):
    """A crops.dat record in the CropsData field order (village.exe 0x14001A090)."""
    stride = 264 + (language_count - 6) * 8
    change_form = 128 + (language_count - 6) * 8
    out = bytearray(80 + (language_count - 7) * 8)
    struct.pack_into("<I", out, 0, numeric_id)
    out += struct.pack("<I", crop_type)
    for values, fmt in ((suitable, "I"), (sowing, "I"), (harvest, "I"), (land, "q")):
        out += struct.pack(f"<I{len(values)}{fmt}", len(values), *values)
    out += struct.pack("<qI", 0, 80)
    out += struct.pack(f"<I{len(features)}q", len(features), *features)
    out += bytes(80)
    forms = forms or {1: [(0, 0), (500, 0), (1000, 0)]}
    out += struct.pack("<I", len(forms))
    for form, stages in forms.items():
        out += struct.pack("<II", form, len(stages))
        for points, after in stages:
            stage = bytearray(stride)
            struct.pack_into("<I", stage, 0, points)
            struct.pack_into("<I", stage, change_form, after)
            out += stage
    return bytes(out + bytes(24))


def test_fruit_tree_reads_bearing_season_past_its_feature_array():
    apple = _crop_bytes(1, crop_type=2, suitable=(2,), sowing=(0, 1, 2, 3), land=(1, 2),
                        features=(10, 22, 8), forms={1: [(0, 0), (300, 0), (600, 0), (900, 0), (1200, 0)]})
    banana = _crop_bytes(9, crop_type=2, suitable=(0, 1, 2, 3), features=(16, 22),
                         forms={1: [(0, 0), (1200, 0)]})
    assert _perennial(apple, 1, 7) == {"kind": "fruit_tree", "bearing_seasons": ["autumn"],
                                       "fruit_per_day": 1, "greenhouse_only": False}
    assert _perennial(banana, 9, 7)["greenhouse_only"] is True
    # Growth used to be read at a fixed offset and failed whenever features were present.
    assert _growth_data(apple, 7) == (1200, 12, None, None)


def test_shrub_rebears_from_its_post_harvest_form_only_in_harvest_season():
    forms = {1: [(0, 0), (500, 0), (1000, 5)], 4: [(0, 5)], 5: [(0, 0), (200, 5)], 10: [(0, 0)]}
    mulberry = _crop_bytes(67, harvest=(1,), sowing=(0, 1, 2, 3), features=(), forms=forms)
    tea = _crop_bytes(64, harvest=(0,), land=(2,), features=(8,), forms=forms)
    assert _perennial(mulberry, 67, 7) == {"kind": "shrub", "bearing_seasons": ["summer"],
                                           "rebear_points": 200, "rebear_days": 2}
    assert _perennial(tea, 64, 7)["bearing_seasons"] == ["spring"]
    assert _growth_data(tea, 7) == (1000, 10, None, None)
    # Without RESEASON the shrub logic in village.exe does not apply.
    assert _perennial(_crop_bytes(67, harvest=(1,), forms={k: v for k, v in forms.items() if k != 10}), 67, 7) is None


def test_ordinary_crops_and_short_records_are_not_perennial():
    regrowing = _crop_bytes(58, suitable=(0,), forms={1: [(0, 0), (800, 4)], 4: [(0, 0), (400, 4)]})
    assert _perennial(regrowing, 58, 7) is None
    assert _growth_data(regrowing, 7) == (800, 8, 400, 4)
    assert _crop_record(regrowing[:150], 7) is None


def test_seven_language_crop_stages_use_272_byte_stride():
    record = _record(1048, {84: 0, 88: 0, 92: 0, 96: 0, 196: 1, 200: 1, 204: 3,
                             480: 100, 752: 400})
    assert _growth_data(record, language_count=7) == (400, 4, None, None)


def test_cooking_category_ingredients_use_native_item_features():
    groups = [_localized_group(f"ITEM_{i}", f"物品{i}", f"物品{i}") for i in range(1, 5)]
    records = []
    cursor = 0
    for i, group in enumerate(groups, 1):
        records.append(_record(496, {0:i, 8:cursor, 344:1, 348:11 if i < 3 else 12}))
        cursor += len(group)
    tables = {
        "item": read_table(build_table(records=records, strings=b"".join(groups))),
        "cooking": read_table(build_table(records=[_record(176, {0:1,24:4,32:1,52:1,60:11,68:2})], strings=b"COOKING_TEST\0")),
    }
    snapshot = normalize_snapshot(tables, {}, {})
    assert snapshot.items['ITEM_1'].feature_ids == (11,)
    option = snapshot.cooking_recipes['COOKING_TEST'].ingredient_options[0]
    assert option == {'slot':0, 'default_item_id':'ITEM_1', 'feature_numeric_id':11, 'feature_name':'蛋类', 'quantity':2, 'item_ids':['ITEM_1','ITEM_2']}


def test_item_descriptions_survive_related_item_linking():
    strings=['ITEM_ID_SEED_TEST']+['種','','','','種子','']+['']*6
    for text in ['夏天種在田裡','可以連續種植','入秋變成黃豆']:
        strings.extend(['説明','','','',text,''])
    blob=('\0'.join(strings)+'\0').encode()
    tables={'item':read_table(build_table(records=[_record(496,{0:1,24:1})],strings=blob))}
    item=normalize_snapshot(tables,{},{}).items['ITEM_ID_SEED_TEST']
    assert item.related_item_id == item.id
    assert item.description == '夏天種在田裡\n可以連續種植\n入秋變成黃豆'


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


def test_extractor_item_is_the_u64_24_bytes_before_the_record_end():
    record = bytearray(64)
    struct.pack_into("<Q", record, 40, 140300)
    assert _extractor_item(bytes(record)) == 140300
    assert _extractor_item(bytes(64)) == 0
    assert _extractor_item(bytes(16)) == 0
