from __future__ import annotations

import struct

from honogurashi_extractor.models import Item, LocalizedName, Snapshot
from honogurashi_extractor.normalize_world import normalize_world, _fishing_place_names
from honogurashi_extractor.table import read_table
from tests.fixtures.build_table import build_table


def _record(size: int, values: dict[int, int]) -> bytes:
    result = bytearray(size)
    for offset, value in values.items():
        struct.pack_into("<I", result, offset, value)
    return bytes(result)


def _item(internal: str, numeric_id: int, zh_hans: str) -> Item:
    name = LocalizedName(
        zh_hans, zh_hans, zh_hans, internal, (zh_hans, internal), "override"
    )
    return Item(internal, numeric_id, name, None, 10)


def test_fishing_place_names_join_item_descriptions_to_spawn_ids_not_list_order():
    # Deliberately use a different table ID: the join must follow the spawn row.
    item_strings = ['ITEM_ID_FISHING_GHOST_FISH_01'] + [''] * 16 + ['深夜時可於岔路釣魚處釣到。']
    item_table = read_table(build_table(records=[_record(496, {0: 162000, 8: 0, 12: 27})], strings=('\0'.join(item_strings)+'\0').encode()))
    fishing_table = read_table(build_table(records=[_record(80, {0: 6, 8: 0, 12: 13, 40: 1, 44: 162000})], strings=b'FISHING_ID_06\0internal label\0'))
    assert _fishing_place_names(fishing_table, item_table) == {'FISHING_ID_06': '岔路釣魚點'}


def test_character_gift_and_fish_location_relations_use_stable_ids():
    onion = _item("ITEM_ID_CROPS_ONION", 100010, "洋葱")
    fish_item = _item("ITEM_ID_FISH_CARP", 160000, "鲤鱼")
    core = Snapshot(items={onion.id: onion, fish_item.id: fish_item})
    fishing_group = (
        "\0".join(
            [
                "FISHING_ID_RIVER",
                "川",
                "7:00-12:00",
                "18:00-0:00",
            ]
        )
        + "\0"
    ).encode()
    morning_offset = fishing_group.index(b"7:00-12:00")
    evening_offset = fishing_group.index(b"18:00-0:00")
    character_group = "CHARA_ID_RIN\0巫女\0リン\0\0\0\0凛\0".encode()
    tables = {
        "fish": read_table(
            build_table(records=[_record(56, {0: 160000})], strings=b"")
        ),
        "fishing": read_table(
            build_table(
                records=[
                    _record(
                        116,
                        {
                            0: 1,
                            8: 0,
                            12: 16,
                            40: 2,
                            44: 160000,
                            60: 0,
                            68: morning_offset,
                            72: len("7:00-12:00"),
                            80: 160000,
                            96: 2,
                            104: evening_offset,
                            108: len("18:00-0:00"),
                        },
                    )
                ],
                strings=fishing_group,
            )
        ),
        "character": read_table(
            build_table(
                records=[_record(684, {0: 1040, 8: 0, 12: 12, 200: 100010, 208: 160000, 232: 160000, 420: 0, 424: 4})],
                strings=character_group,
            )
        ),
        "characterpresent": read_table(
            build_table(
                records=[_record(136, {0: 1, 8: 1040, 12: 2, 16: 100010})],
                strings=b"GIFT_ROW\0",
            )
        ),
    }

    world = normalize_world(tables, core, {})

    assert world.characters["CHARA_ID_RIN"].gift_items[0].item_id == onion.id
    assert [gift.preference for gift in world.characters["CHARA_ID_RIN"].gift_items] == [1, 1, -1]
    assert world.characters["CHARA_ID_RIN"].birthday_season == "spring"
    assert world.characters["CHARA_ID_RIN"].birthday_day == 4
    assert world.fish[fish_item.id].locations[0].location_id == "FISHING_ID_RIVER"
    assert world.fish[fish_item.id].locations[0].name.zh_hans == "川"
    assert [appearance.season for appearance in world.fish[fish_item.id].appearances] == [
        "spring",
        "autumn",
    ]
    assert [appearance.time_period for appearance in world.fish[fish_item.id].appearances] == [
        "morning",
        "evening",
    ]
    assert world.fish[fish_item.id].seasons == ("spring", "autumn")
    assert world.fish[fish_item.id].time_periods == ("morning", "evening")
