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


def test_quest_steps_preserve_order_and_do_not_replace_them_with_completed_text():
    groups=["QUEST_ID_TEST"]
    for ja,zh in [("依頼","委託"),("完了","已完成"),("説明","說明"),("目的","目標"),("",""),("集める","收集酸酸的樹液兩份"),("渡す","交給蓮實")]:
        groups.extend([ja,"","","",zh,""])
    table=read_table(build_table(records=[_record(480,{0:1})],strings=("\0".join(groups)+"\0").encode()))
    result=normalize_world({"quest":table},Snapshot(),{}).quests['QUEST_ID_TEST']
    assert result.description == '說明'
    assert result.objective == '目標'
    assert result.steps == ('收集酸酸的樹液兩份','交給蓮實')


def test_seven_language_character_gifts_and_birthday_offsets():
    item = _item("ITEM_GIFT", 60400, "礼物")
    strings = ("\0".join(["CHARA_TEST", "役", "トバリ", "", "", "", "帷", "토바리", "帷"]) + "\0").encode()
    table = read_table(build_table(records=[_record(740, {0: 1010, 216: 60400, 248: 60400, 460: 2, 464: 12})], strings=strings), language_count=7)
    char = normalize_world({"character": table}, Snapshot(items={item.id: item}), {}).characters["CHARA_TEST"]
    assert [gift.preference for gift in char.gift_items] == [1, -1]
    assert (char.birthday_season, char.birthday_day) == ("autumn", 12)
    assert char.name.translations == {"ja": "トバリ", "en": "", "fr": "", "es": "", "zh-TW": "帷", "ko": "토바리", "zh-CN": "帷"}


def test_seven_language_quest_keeps_ordered_translations():
    groups = ["QUEST_TEST"]
    for text in ("依頼", "完了", "説明", "目的", "", "集める", "渡す"):
        groups.extend([text, "", "", "", "繁" + text if text else "", "한" + text if text else "", "简" + text if text else ""])
    table = read_table(build_table(records=[_record(600, {0: 1})], strings=("\0".join(groups) + "\0").encode()), language_count=7)
    quest = normalize_world({"quest": table}, Snapshot(), {}).quests["QUEST_TEST"]
    assert (quest.description, quest.objective, quest.steps) == ("简説明", "简目的", ("简集める", "简渡す"))
    assert quest.description_translations["ko"] == "한説明"
    assert [step["zh-CN"] for step in quest.step_translations] == ["简集める", "简渡す"]


def test_native_quest_objective_array_uses_60_byte_entries():
    values = ["QUEST_NATIVE"] + [""] * 35
    values.extend(["first", "", "", "", "第一", "첫째", "第一步"])
    values.extend(["second", "", "", "", "第二", "둘째", "第二步"])
    values.extend(["not an objective", "", "", "", "尾部", "후속", "尾部"])
    pool = ("\0".join(values) + "\0").encode()
    offsets = []
    cursor = 0
    for value in values:
        offsets.append(cursor)
        cursor += len(value.encode()) + 1
    scalars = {0: 1, 336: 2}
    for index in range(2):
        for slot in range(7):
            scalar = 340 + index * 60 + slot * 8
            source = 36 + index * 7 + slot
            scalars[scalar] = offsets[source]
            scalars[scalar + 4] = len(values[source].encode())
    table = read_table(build_table(records=[_record(536, scalars)], strings=pool), language_count=7)
    quest = normalize_world({"quest": table}, Snapshot(), {}).quests["QUEST_NATIVE"]
    assert quest.steps == ("第一步", "第二步")
    assert quest.step_translations[1]["ko"] == "둘째"


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


def test_hunt_reward_keeps_weights_and_draw_count_from_four_fixed_slots():
    bones = _item("ITEM_ID_HUNTING_SMALL_ANIMAL_BONES", 150020, "小动物的骨头")
    meat = _item("ITEM_ID_HUNTING_SMALL_ANIMAL_GAME_MEAT", 150000, "野生小动物的肉")
    plume = _item("ITEM_ID_HUNTING_PHEASANT_PLUME", 150040, "绿雉的饰羽")
    certificate = _item("ITEM_ID_HUNTING_CERTIFICATE_PHEASANT", 155060, "绿雉的狩猎证明")
    items = {entry.id: entry for entry in (bones, meat, plume, certificate)}
    # dropNum (byte 20) is 4 here, more than the three filled slots, so it
    # must not be read as a slot count. Slot 4 names an item with Rate 0,
    # which the game skips, and bytes 72-88 hold version and platform words.
    record = _record(88, {
        0: 6, 16: 155060, 20: 4,
        24: 150020, 28: 1, 32: 50,
        36: 150000, 40: 1, 44: 40,
        48: 150040, 52: 1, 56: 10,
        60: 150040, 64: 2, 68: 0,
        72: 150020, 76: 1, 80: 1,
    })
    table = read_table(build_table(records=[record], strings=b"HUNT_REWARD_PHEASANT\0"), language_count=7)
    reward = normalize_world({"huntreward": table}, Snapshot(items=items), {}).hunt_rewards["HUNT_REWARD_PHEASANT"]
    assert reward.certificate_item_id == "ITEM_ID_HUNTING_CERTIFICATE_PHEASANT"
    assert reward.draw_count == 4
    assert [(entry.item_id, entry.quantity, entry.weight) for entry in reward.rewards] == [
        ("ITEM_ID_HUNTING_SMALL_ANIMAL_BONES", 1, 50),
        ("ITEM_ID_HUNTING_SMALL_ANIMAL_GAME_MEAT", 1, 40),
        ("ITEM_ID_HUNTING_PHEASANT_PLUME", 1, 10),
    ]
