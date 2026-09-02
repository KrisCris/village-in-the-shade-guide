from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping

from .localization import build_name
from .models import (
    Character,
    Fish,
    FishLocation,
    GiftItem,
    HuntReward,
    Item,
    ItemQuantity,
    Snapshot,
    WorldEntry,
    WorldSnapshot,
)
from .probe import _string_groups
from .table import TableContainer


WEATHER_NAMES = {
    "WEATHER_ID_SUNNY": "晴朗",
    "WEATHER_ID_RAIN": "雨天",
    "WEATHER_ID_CLOUDY": "阴天",
    "WEATHER_ID_SNOW": "雪天",
    "WEATHER_ID_TYPHOON": "台风",
    "WEATHER_ID_HEAVY_SNOW": "暴雪",
}


def _u32(record: bytes, offset: int) -> int:
    if offset + 4 > len(record):
        return 0
    return int.from_bytes(record[offset : offset + 4], "little")


def _standard_name(group, overrides):
    return build_name(
        ja=group[1] if len(group) > 1 else "",
        zh_hant=group[5] if len(group) > 5 else "",
        internal=group[0],
        overrides=overrides,
    )


def normalize_world(
    tables: Mapping[str, TableContainer],
    core: Snapshot,
    overrides: Mapping[str, str],
) -> WorldSnapshot:
    world = WorldSnapshot()
    items_by_numeric: dict[int, Item] = {
        item.numeric_id: item for item in core.items.values()
    }

    locations_by_fish: dict[int, list[FishLocation]] = defaultdict(list)
    fishing = tables.get("fishing")
    if fishing:
        for record, group in zip(fishing.records, _string_groups(fishing), strict=True):
            if not group:
                continue
            # Fishing rows contain an internal id, a Japanese place name, then
            # season/time labels rather than the standard localization columns.
            location_name = build_name(
                ja=group[1] if len(group) > 1 else group[0],
                zh_hant="",
                internal=group[0],
                overrides=overrides,
            )
            location = FishLocation(location_name.internal, location_name)
            spawn_count = _u32(record, 24)
            for index in range(spawn_count):
                fish_id = _u32(record, 28 + index * 36 + 16)
                if fish_id:
                    locations_by_fish[fish_id].append(location)

    fish_table = tables.get("fish")
    if fish_table:
        for record in fish_table.records:
            numeric_id = _u32(record, 0)
            item = items_by_numeric.get(numeric_id)
            if item:
                world.fish[item.id] = Fish(
                    item.id,
                    numeric_id,
                    item.name,
                    item.sell_price,
                    tuple(dict.fromkeys(locations_by_fish[numeric_id])),
                )

    gift_items: dict[int, list[GiftItem]] = defaultdict(list)
    presents = tables.get("characterpresent")
    if presents:
        for record in presents.records:
            item = items_by_numeric.get(_u32(record, 16))
            if item:
                gift_items[_u32(record, 8)].append(
                    GiftItem(item.id, _u32(record, 12))
                )

    characters = tables.get("character")
    if characters:
        for record, group in zip(
            characters.records, _string_groups(characters), strict=True
        ):
            internal = group[0]
            name = build_name(
                ja=group[2] if len(group) > 2 else group[1],
                zh_hant=group[6] if len(group) > 6 else "",
                internal=internal,
                overrides=overrides,
            )
            numeric_id = _u32(record, 0)
            world.characters[internal] = Character(
                internal,
                numeric_id,
                name,
                group[1] if len(group) > 1 else "",
                tuple(gift_items[numeric_id]),
            )

    _normalize_named(tables.get("livestock"), world.livestock, overrides)
    _normalize_named(tables.get("facility"), world.facilities, overrides)
    _normalize_named(
        tables.get("facilityrelease"), world.facility_releases, overrides
    )
    _normalize_named(tables.get("quest"), world.quests, overrides)
    _normalize_named(tables.get("lostbook"), world.collectibles, overrides)
    _normalize_weather(tables.get("weather"), world.weather, overrides)
    _normalize_hunt_rewards(
        tables.get("huntreward"), world.hunt_rewards, items_by_numeric
    )
    return world


def _normalize_named(table, output, overrides):
    if not table:
        return
    for record, group in zip(table.records, _string_groups(table), strict=True):
        if not group:
            continue
        name = _standard_name(group, overrides)
        output[name.internal] = WorldEntry(name.internal, _u32(record, 0), name)


def _normalize_weather(table, output, overrides):
    if not table:
        return
    weather_overrides = dict(WEATHER_NAMES)
    weather_overrides.update(overrides)
    _normalize_named(table, output, weather_overrides)


def _normalize_hunt_rewards(table, output, items_by_numeric):
    if not table:
        return
    for record, group in zip(table.records, _string_groups(table), strict=True):
        if not group:
            continue
        count = _u32(record, 20)
        rewards = []
        for index in range(count):
            offset = 24 + index * 12
            item = items_by_numeric.get(_u32(record, offset))
            if item:
                rewards.append(ItemQuantity(item.id, _u32(record, offset + 4)))
        certificate = items_by_numeric.get(_u32(record, 16))
        internal = group[0]
        output[internal] = HuntReward(
            internal,
            _u32(record, 0),
            certificate.id if certificate else None,
            tuple(rewards),
        )
