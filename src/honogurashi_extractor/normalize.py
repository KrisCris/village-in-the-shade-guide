from __future__ import annotations

import re
from collections.abc import Mapping
import math
from dataclasses import replace

from .icons import item_icon_id, item_outline_icon_id
from .harvest import normalize_harvest_quantities
from .localization import build_name
from .models import (
    Crop,
    Issue,
    Item,
    ItemQuantity,
    Process,
    Recipe,
    Snapshot,
    StoreOffer,
)
from .probe import _string_groups
from .schema import TableSchema
from .table import TableContainer


MACHINE_ITEM_IDS = {
    *(
        400000 + offset
        for offset in (
            0, 1, 10, 11, 20, 21, 30, 31, 40, 41, 50, 51, 60, 61,
            70, 71, 80, 81, 90, 91, 100, 101, 110, 111, 120, 130, 140, 141,
        )
    ),
    402040,
    402050,
    402070,
    402100,
    402110,
    402120,
    403000,
    403010,
    403040,
}


def _u32(record: bytes, offset: int) -> int:
    if offset + 4 > len(record):
        return 0
    return int.from_bytes(record[offset : offset + 4], "little")


def _growth_data(record: bytes) -> tuple[int | None, int | None, int | None, int | None]:
    """Decode verified crop growth thresholds.

    A watered day contributes 100 growth points. Ordinary crops store their
    initial visual-stage thresholds in 264-byte entries beginning at byte 488.
    Repeating crops store a second threshold sequence at byte 2080.
    """
    thresholds: list[int] = []
    previous = 0
    offset = 492
    while offset + 4 <= len(record):
        value = _u32(record, offset)
        if value <= previous or value > 10_000:
            break
        thresholds.append(value)
        previous = value
        offset += 264
    if not thresholds:
        return None, None, None, None
    growth_points = thresholds[-1]
    regrow_points = None
    if len(record) >= 2616 and _u32(record, 1812) == 4 and _u32(record, 1816) in (2, 3):
        regrow_thresholds: list[int] = []
        previous = 0
        offset = 2084
        while offset + 4 <= len(record):
            value = _u32(record, offset)
            if value <= previous or value > 10_000:
                break
            regrow_thresholds.append(value)
            previous = value
            offset += 264
        if regrow_thresholds:
            regrow_points = regrow_thresholds[-1]
    return (
        growth_points,
        math.ceil(growth_points / 100),
        regrow_points,
        math.ceil(regrow_points / 100) if regrow_points else None,
    )


def _name(group: tuple[str, ...], overrides: Mapping[str, str]):
    internal = group[0]
    ja = group[1] if len(group) > 1 else ""
    zh_hant = group[5] if len(group) > 5 else ""
    return build_name(ja=ja, zh_hant=zh_hant, internal=internal, overrides=overrides)


def _seasons(group: tuple[str, ...]) -> tuple[str, ...]:
    source = " ".join(group)
    found = []
    for character, season in (("春", "spring"), ("夏", "summer"), ("秋", "autumn"), ("冬", "winter")):
        if character in source:
            found.append(season)
    if re.search(r"全年|年中|四季", source):
        return ("spring", "summer", "autumn", "winter")
    return tuple(found)


def _resolve_item(
    numeric_id: int,
    items_by_numeric: Mapping[int, Item],
    snapshot: Snapshot,
    *,
    table: str,
    record_id: int,
    field: str,
) -> str | None:
    if numeric_id == 0:
        return None
    item = items_by_numeric.get(numeric_id)
    if item is None:
        snapshot.issues.append(Issue(table, record_id, field, numeric_id))
        return None
    return item.id


def normalize_snapshot(
    tables: Mapping[str, TableContainer],
    schemas: Mapping[str, TableSchema],
    overrides: Mapping[str, str],
) -> Snapshot:
    del schemas  # Schema evidence is verified before normalization.
    snapshot = Snapshot()
    items_by_numeric: dict[int, Item] = {}
    item_groups_by_numeric: dict[int, tuple[str, ...]] = {}
    machine_by_gimmick_numeric: dict[int, str] = {}
    category_labels = "未分类 种苗 素材 采集物 作物 畸形作物 花卉 果实 畜产品 加工品 调味料 料理 鱼类 畸形鱼 猎物 矿石 购买素材 机械 农具 动物用品 猎具 狩猎许可 狩猎证明 家畜 收纳 桌子 椅子 寝具 架子 照明 壁挂 地板与墙材 小物件 庭院树木 前发 后发 服装 围巾 饰品 包 夜间家具 咒物 废料 关键物品 药品 夜间物品".split()
    categories = {}
    category_table = tables.get("itemcategory")
    if category_table:
        for record, group in zip(category_table.records, _string_groups(category_table), strict=True):
            category_id = _u32(record, 0)
            translated = {group[0]: category_labels[category_id]} if category_id < len(category_labels) else {}
            categories[category_id] = build_name(ja=group[1], zh_hant="", internal=group[0], overrides=translated)

    item_table = tables.get("item")
    if item_table:
        for record, group in zip(item_table.records, _string_groups(item_table), strict=True):
            numeric_id = _u32(record, 0)
            item_groups_by_numeric[numeric_id] = group
            name = _name(group, overrides)
            item = Item(
                id=name.internal,
                numeric_id=numeric_id,
                name=name,
                buy_price=_u32(record, 292) or None,
                sell_price=_u32(record, 296),
                icon_id=item_icon_id(record) or None,
                outline_icon_id=item_outline_icon_id(record) or None,
                category_numeric_id=_u32(record, 280),
                category_id=categories[_u32(record, 280)].internal if _u32(record, 280) in categories else None,
                category_name=categories.get(_u32(record, 280)),
                description="\n".join(group[i+4] or group[i] for i in (13,19,25) if len(group)>i+4 and (group[i+4] or group[i])),
            )
            snapshot.items[item.id] = item
            items_by_numeric[numeric_id] = item

        for record in item_table.records:
            numeric_id = _u32(record, 0)
            related_id = _u32(record, 24)
            item = items_by_numeric[numeric_id]
            related = items_by_numeric.get(related_id)
            if related:
                replacement = replace(item, related_item_id=related.id)
                snapshot.items[item.id] = replacement
                items_by_numeric[numeric_id] = replacement

        snapshot.machines = {
            item.id: item
            for item in snapshot.items.values()
            if item.numeric_id in MACHINE_ITEM_IDS or item.id.startswith("ITEM_ID_MACHINE_")
        }

        gimmick_table = tables.get("gimmick")
        if gimmick_table:
            for record in gimmick_table.records:
                item = items_by_numeric.get(_u32(record, len(record) - 48))
                if item and item.id in snapshot.machines:
                    machine_by_gimmick_numeric[_u32(record, 0)] = item.id

    crop_table = tables.get("crops")
    if crop_table:
        crop_groups = _string_groups(crop_table)
        for record, group in zip(crop_table.records, crop_groups, strict=True):
            crop_numeric_id = _u32(record, 0)
            seeds: list[str] = []
            harvests: list[str] = []
            seasons: list[str] = []
            if item_table:
                for item_record in item_table.records:
                    seed = items_by_numeric[_u32(item_record, 0)]
                    if not seed.id.startswith("ITEM_ID_SEED_"):
                        continue
                    if _u32(item_record, 356) != crop_numeric_id:
                        continue
                    seeds.append(seed.id)
                    # Only the growth description, not later flavour text about
                    # the crop changing into another harvest in a later season.
                    seed_group = item_groups_by_numeric[seed.numeric_id]
                    seasons.extend(_seasons(tuple(seed_group[13:19])))
                    if seed.related_item_id:
                        harvests.append(seed.related_item_id)
            name = _name(group, overrides)
            growth_points, growth_days, regrow_points, regrow_days = _growth_data(record)
            snapshot.crops[name.internal] = Crop(
                id=name.internal,
                numeric_id=crop_numeric_id,
                name=name,
                seed_item_ids=tuple(seeds),
                harvest_item_ids=tuple(dict.fromkeys(harvests)),
                seasons=tuple(dict.fromkeys(seasons or _seasons(group))),
                growth_points=growth_points,
                growth_days=growth_days,
                regrow_points=regrow_points,
                regrow_days=regrow_days,
                cultivation_method='菌类栽培' if seeds and any('栽培キット' in items_by_numeric[_u32(r,0)].name.ja for r in item_table.records if items_by_numeric[_u32(r,0)].id in seeds) else '',
            )

    process_table = tables.get("gimmickprocess")
    if process_table:
        for record, group in zip(
            process_table.records, _string_groups(process_table), strict=True
        ):
            record_id = _u32(record, 0)
            machine_count = _u32(record, 24)
            base = 28 + machine_count * 8
            machine_ids_list = []
            for index in range(machine_count):
                numeric_machine_id = _u32(record, 28 + index * 8)
                item_id = machine_by_gimmick_numeric.get(numeric_machine_id)
                if item_id is None:
                    item = items_by_numeric.get(numeric_machine_id)
                    item_id = item.id if item else None
                if item_id:
                    machine_ids_list.append(item_id)
                else:
                    snapshot.issues.append(
                        Issue(
                            "gimmickprocess",
                            record_id,
                            f"machine_ids[{index}]",
                            numeric_machine_id,
                        )
                    )
            machine_ids = tuple(machine_ids_list)
            inputs = []
            for index, offset in enumerate((base, base + 12)):
                item_id = _resolve_item(
                    _u32(record, offset),
                    items_by_numeric,
                    snapshot,
                    table="gimmickprocess",
                    record_id=record_id,
                    field=f"inputs[{index}]",
                )
                if item_id:
                    inputs.append(ItemQuantity(item_id, _u32(record, offset + 8)))
            output_id = _resolve_item(
                _u32(record, base + 24),
                items_by_numeric,
                snapshot,
                table="gimmickprocess",
                record_id=record_id,
                field="output",
            )
            if output_id:
                process_internal = group[0]
                output_name = snapshot.items[output_id].name
                name = build_name(
                    ja=output_name.ja,
                    zh_hant=output_name.zh_hant,
                    internal=process_internal,
                    overrides=overrides,
                )
                snapshot.processes[name.internal] = Process(
                    id=name.internal,
                    numeric_id=record_id,
                    name=name,
                    machine_ids=machine_ids,
                    inputs=tuple(inputs),
                    output=ItemQuantity(output_id, _u32(record, base + 32)),
                    duration_minutes=_u32(record, base + 36),
                )

    _normalize_craft(
        tables.get("craft"),
        items_by_numeric,
        machine_by_gimmick_numeric,
        snapshot,
        overrides,
    )
    _normalize_cooking(tables.get("cooking"), items_by_numeric, snapshot, overrides)
    _normalize_store(tables.get("storesales"), items_by_numeric, snapshot, tables.get("gameflag"))
    normalize_harvest_quantities(tables.get("cropsharvest"), snapshot)
    return snapshot


def _normalize_craft(table, items_by_numeric, machines_by_numeric, snapshot, overrides):
    if not table:
        return
    for record, group in zip(table.records, _string_groups(table), strict=True):
        record_id = _u32(record, 0)
        inputs = []
        for index, offset in enumerate((32, 44, 56)):
            item_id = _resolve_item(_u32(record, offset), items_by_numeric, snapshot, table="craft", record_id=record_id, field=f"inputs[{index}]")
            if item_id:
                inputs.append(ItemQuantity(item_id, _u32(record, offset + 8)))
        output_id = _resolve_item(_u32(record, 92), items_by_numeric, snapshot, table="craft", record_id=record_id, field="output")
        if output_id:
            output_name = snapshot.items[output_id].name
            name = build_name(
                ja=output_name.ja,
                zh_hant=output_name.zh_hant,
                internal=group[0],
                overrides=overrides,
            )
            numeric_machine_id = _u32(record, 24)
            machine_id = machines_by_numeric.get(numeric_machine_id)
            if machine_id is None:
                direct_machine = items_by_numeric.get(numeric_machine_id)
                machine_id = direct_machine.id if direct_machine else None
            if machine_id is None and numeric_machine_id:
                snapshot.issues.append(Issue("craft", record_id, "machine", numeric_machine_id))
            snapshot.craft_recipes[name.internal] = Recipe(name.internal, record_id, name, machine_id, tuple(inputs), ItemQuantity(output_id, _u32(record, 100)), _u32(record, 116) or None)


def _normalize_cooking(table, items_by_numeric, snapshot, overrides):
    if not table:
        return
    for record, group in zip(table.records, _string_groups(table), strict=True):
        record_id = _u32(record, 0)
        inputs = []
        for index, offset in enumerate((52, 72, 92, 112, 132)):
            item_id = _resolve_item(_u32(record, offset), items_by_numeric, snapshot, table="cooking", record_id=record_id, field=f"inputs[{index}]")
            if item_id:
                inputs.append(ItemQuantity(item_id, _u32(record, offset + 16)))
        output_id = _resolve_item(_u32(record, 24), items_by_numeric, snapshot, table="cooking", record_id=record_id, field="output")
        if output_id:
            output_name = snapshot.items[output_id].name
            name = build_name(
                ja=output_name.ja,
                zh_hant=output_name.zh_hant,
                internal=group[0],
                overrides=overrides,
            )
            snapshot.cooking_recipes[name.internal] = Recipe(name.internal, record_id, name, None, tuple(inputs), ItemQuantity(output_id, _u32(record, 32)), _u32(record, 152) or None)


def _normalize_store(table, items_by_numeric, snapshot, flags=None):
    if not table:
        return
    flag_names = {_u32(r,0): g for r,g in zip(flags.records, _string_groups(flags), strict=True)} if flags else {}
    known = {
        520: "第二年春起", 521: "第三年春起", 522: "第一年夏起",
        523: "第二年夏起", 524: "第三年夏起", 525: "第一年秋起",
        526: "第二年秋起", 527: "第一年冬起", 528: "首次出货后",
        529: "夏季蔬菜出货后", 530: "水果累计出货50个且第一年秋起",
        531: "获得犁后", 532: "首次参加品评会后", 533: "秋季品评会次日起",
        534: "温室建筑解锁后", 535: "建造铁砧后", 536: "彩色小鸡售卖活动开放",
        399: "安心生活模式", 6101: "随身背包已扩充至Lv2",
        6102: "随身背包已扩充至Lv3", 6103: "已购买镰刀",
        18704: "完成进入今野房间的居民事件", 6465: "六角好感度突破Lv6",
        70003: "庙会场景开放",
    }
    season_names = ("spring", "summer", "autumn", "winter")
    for record, group in zip(table.records, _string_groups(table), strict=True):
        record_id = _u32(record, 0)
        item_id = _resolve_item(_u32(record, 16), items_by_numeric, snapshot, table="storesales", record_id=record_id, field="item")
        if item_id:
            internal = group[0]
            cursor = 28
            conditions = []
            flag_lists = []
            for required in (True, False):
                count = _u32(record,cursor)
                cursor += 4
                if count > (len(record) - cursor) // 8:
                    raise ValueError(f"storesales {internal}: invalid flag count")
                flag_lists.append(tuple(_u32(record, cursor + index * 8) for index in range(count)))
                for index in range(count):
                    flag = _u32(record,cursor + index*8)
                    label = known.get(flag)
                    if 86000 <= flag < 86200:
                        conditions.append("已解锁此款外观" if required else "尚未解锁此款外观")
                    elif 80000 <= flag < 81000:
                        conditions.append("已解锁此制作配方" if required else "尚未解锁此制作配方")
                    elif 560 <= flag <= 578:
                        conditions.append("前一份限量商品已售出" if required else "本份限量商品尚未售出")
                    elif label:
                        conditions.append(label if required else "不满足：" + label)
                    else:
                        # Retain the raw predicate, including its polarity; an
                        # unknown flag must never become an unconditional offer.
                        raw_name = flag_names.get(flag, (str(flag),))[0]
                        conditions.append(("需满足条件：" if required else "需未满足条件：") + raw_name)
                cursor += count*8
            season_count = _u32(record, cursor)
            if season_count > 4 or cursor + 4 + season_count * 4 > len(record):
                raise ValueError(f"storesales {internal}: invalid seasons")
            seasons = tuple(season_names[_u32(record, cursor + 4 + i * 4)] for i in range(season_count))
            location = next((label for key, label in {
                "GENERAL": "田上杂货店", "VENDOR": "行商", "RESTAURANT": "六角食堂",
                "CRAFT": "树木建设", "HUNTER": "狩猎商店",
            }.items() if f"_{key}_" in internal), "商店")
            snapshot.store_offers[internal] = StoreOffer(
                internal, record_id, item_id, tuple(dict.fromkeys(conditions)), location,
                seasons, flag_lists[0], flag_lists[1],
            )
