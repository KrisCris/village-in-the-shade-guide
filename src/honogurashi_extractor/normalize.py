from __future__ import annotations

import re
from collections.abc import Mapping
import math

from .icons import item_icon_id, item_outline_icon_id
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
            )
            snapshot.items[item.id] = item
            items_by_numeric[numeric_id] = item

        for record in item_table.records:
            numeric_id = _u32(record, 0)
            related_id = _u32(record, 24)
            item = items_by_numeric[numeric_id]
            related = items_by_numeric.get(related_id)
            if related:
                replacement = Item(
                    id=item.id,
                    numeric_id=item.numeric_id,
                    name=item.name,
                    buy_price=item.buy_price,
                    sell_price=item.sell_price,
                    related_item_id=related.id,
                    icon_id=item.icon_id,
                    outline_icon_id=item.outline_icon_id,
                )
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
                    seasons.extend(_seasons(item_groups_by_numeric[seed.numeric_id]))
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
    _normalize_store(tables.get("storesales"), items_by_numeric, snapshot)
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
            snapshot.craft_recipes[name.internal] = Recipe(name.internal, record_id, name, machine_id, tuple(inputs), ItemQuantity(output_id, _u32(record, 100)))


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
            snapshot.cooking_recipes[name.internal] = Recipe(name.internal, record_id, name, None, tuple(inputs), ItemQuantity(output_id, _u32(record, 32)))


def _normalize_store(table, items_by_numeric, snapshot):
    if not table:
        return
    for record, group in zip(table.records, _string_groups(table), strict=True):
        record_id = _u32(record, 0)
        item_id = _resolve_item(_u32(record, 16), items_by_numeric, snapshot, table="storesales", record_id=record_id, field="item")
        if item_id:
            internal = group[0]
            snapshot.store_offers[internal] = StoreOffer(internal, record_id, item_id)
