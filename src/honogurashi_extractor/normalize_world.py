from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
import re

from .localization import build_name
from .models import (
    Character,
    Fish,
    FishAppearance,
    FishLocation,
    GiftItem,
    HuntReward,
    Item,
    ItemQuantity,
    Snapshot,
    WorldEntry,
    Quest,
    WorldSnapshot,
)
from .probe import _string_groups
from .table import TableContainer, TableFormatError


def _fishing_place_names(fishing, items) -> dict[str, str]:
    """Join exclusive night-fish descriptions to their actual spawn table.

    fishing.dat's names describe water flow, not player-facing locations.
    See docs/data-evidence/fishing-locations.md for the six cross-checks.
    """
    if not fishing or not items:
        return {}
    locations: dict[int, set[str]] = defaultdict(set)
    for record, group in zip(fishing.records, _string_groups(fishing), strict=True):
        count = _u32(record, 40)
        if 44 + count * 36 > len(record):
            raise TableFormatError("fishing appearance records are truncated")
        for index in range(count):
            locations[_u32(record, 44 + index * 36)].add(group[0])
    names: dict[str, str] = {}
    for record, group in zip(items.records, _string_groups(items), strict=True):
        if not group[0].startswith('ITEM_ID_FISHING_GHOST_FISH_') or len(group) <= 17:
            continue
        match = re.fullmatch(r'深夜時可於(.+?)釣魚處釣到。', group[17])
        places = locations[_u32(record, 0)]
        if not match or len(places) != 1:
            continue
        place = match[1].replace('村裡', '村中').replace('山裡', '山中') + '釣魚點'
        location_id = next(iter(places))
        if location_id in names and names[location_id] != place:
            raise TableFormatError(f"conflicting fishing location names: {location_id}")
        names[location_id] = place
    return names


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
    appearances_by_fish: dict[int, list[FishAppearance]] = defaultdict(list)
    seasons = ("spring", "summer", "autumn", "winter")
    periods = {"7:00-12:00": "morning", "12:00-18:00": "day", "18:00-0:00": "evening", "0:00-6:00": "late-night"}
    fishing = tables.get("fishing")
    place_names = _fishing_place_names(fishing, tables.get("item"))
    if fishing:
        for record, group in zip(fishing.records, _string_groups(fishing), strict=True):
            if not group:
                continue
            # Fishing rows contain an internal id, a Japanese place name, then
            # season/time labels rather than the standard localization columns.
            location_name = build_name(
                ja=group[1] if len(group) > 1 else group[0],
                zh_hant=place_names.get(group[0], ""),
                internal=group[0],
                overrides=overrides,
            )
            location = FishLocation(location_name.internal, location_name)
            spawn_count = _u32(record, 40)
            if 44 + spawn_count * 36 > len(record):
                raise TableFormatError("fishing appearance records are truncated")
            for index in range(spawn_count):
                offset = 44 + index * 36
                fish_id = _u32(record, offset)
                season = _u32(record, offset + 16)
                start = _u32(record, offset + 24)
                length = _u32(record, offset + 28)
                time_range = fishing.string_pool[start:start + length].decode("utf-8").rstrip("\0")
                if season >= len(seasons) or time_range not in periods:
                    raise TableFormatError(f"unknown fishing appearance: {season}, {time_range}")
                if fish_id:
                    locations_by_fish[fish_id].append(location)
                    appearances_by_fish[fish_id].append(FishAppearance(location.location_id, seasons[season], periods[time_range], time_range))

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
                    tuple(dict.fromkeys(appearances_by_fish[numeric_id])),
                    tuple(s for s in seasons if any(a.season == s for a in appearances_by_fish[numeric_id])),
                    tuple(p for p in periods.values() if any(a.time_period == p for a in appearances_by_fish[numeric_id])),
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
            # characterpresent is a conditional hand-in event table, NOT taste.
            # character.dat: four liked item IDs at 200, four disliked at 232.
            gifts = tuple(
                GiftItem(items_by_numeric[item_id].id, preference)
                for start, preference in ((200, 1), (232, -1))
                for offset in range(start, start + 32, 8)
                if (item_id := _u32(record, offset)) in items_by_numeric
            )
            birthday_season, birthday_day = _u32(record, 420), _u32(record, 424)
            has_birthday = birthday_season < 4 and 1 <= birthday_day <= 28
            world.characters[internal] = Character(
                internal,
                numeric_id,
                name,
                group[1] if len(group) > 1 else "",
                gifts,
                seasons[birthday_season] if has_birthday else None,
                birthday_day if has_birthday else None,
            )

    _normalize_named(tables.get("livestock"), world.livestock, overrides)
    _normalize_named(tables.get("facility"), world.facilities, overrides)
    _normalize_named(
        tables.get("facilityrelease"), world.facility_releases, overrides
    )
    _normalize_quests(tables.get("quest"), world.quests, overrides)
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


def _normalize_quests(table, output, overrides):
    if not table:
        return
    for record, group in zip(table.records, _string_groups(table), strict=True):
        name = _standard_name(group, overrides)
        def text(offset):
            if offset + 4 >= len(group):
                return ""
            return group[offset + 4] or group[offset]
        # Five six-language blocks precede the ordered objective list. The
        # second block is completion text, not the next action to perform.
        output[name.internal] = Quest(name.internal, _u32(record,0), name,
            text(13), text(19), tuple(text(i) for i in range(31, len(group), 6) if group[i]))


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
