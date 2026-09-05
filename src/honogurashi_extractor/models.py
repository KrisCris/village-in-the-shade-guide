from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class LocalizedName:
    zh_hans: str
    zh_hant: str
    ja: str
    internal: str
    aliases: tuple[str, ...]
    review_status: str


@dataclass(frozen=True, slots=True)
class Item:
    id: str
    numeric_id: int
    name: LocalizedName
    buy_price: int | None
    sell_price: int
    related_item_id: str | None = None
    icon_id: int | None = None
    outline_icon_id: int | None = None
    category_numeric_id: int | None = None
    category_id: str | None = None
    category_name: LocalizedName | None = None


@dataclass(frozen=True, slots=True)
class Crop:
    id: str
    numeric_id: int
    name: LocalizedName
    seed_item_ids: tuple[str, ...]
    harvest_item_ids: tuple[str, ...]
    seasons: tuple[str, ...] = ()
    growth_points: int | None = None
    growth_days: int | None = None
    regrow_points: int | None = None
    regrow_days: int | None = None
    harvest_quantity: int | None = None


@dataclass(frozen=True, slots=True)
class ItemQuantity:
    item_id: str
    quantity: int


@dataclass(frozen=True, slots=True)
class Process:
    id: str
    numeric_id: int
    name: LocalizedName
    machine_ids: tuple[str, ...]
    inputs: tuple[ItemQuantity, ...]
    output: ItemQuantity
    duration_minutes: int


@dataclass(frozen=True, slots=True)
class Recipe:
    id: str
    numeric_id: int
    name: LocalizedName
    machine_id: str | None
    inputs: tuple[ItemQuantity, ...]
    output: ItemQuantity


@dataclass(frozen=True, slots=True)
class StoreOffer:
    id: str
    numeric_id: int
    item_id: str


@dataclass(frozen=True, slots=True)
class Issue:
    table: str
    record_id: int
    field: str
    target_id: int


@dataclass(slots=True)
class Snapshot:
    items: dict[str, Item] = field(default_factory=dict)
    crops: dict[str, Crop] = field(default_factory=dict)
    machines: dict[str, Item] = field(default_factory=dict)
    processes: dict[str, Process] = field(default_factory=dict)
    craft_recipes: dict[str, Recipe] = field(default_factory=dict)
    cooking_recipes: dict[str, Recipe] = field(default_factory=dict)
    store_offers: dict[str, StoreOffer] = field(default_factory=dict)
    issues: list[Issue] = field(default_factory=list)
    fish: dict[str, Fish] = field(default_factory=dict)
    livestock: dict[str, WorldEntry] = field(default_factory=dict)
    characters: dict[str, Character] = field(default_factory=dict)
    facilities: dict[str, WorldEntry] = field(default_factory=dict)
    facility_releases: dict[str, WorldEntry] = field(default_factory=dict)
    quests: dict[str, WorldEntry] = field(default_factory=dict)
    collectibles: dict[str, WorldEntry] = field(default_factory=dict)
    hunt_rewards: dict[str, HuntReward] = field(default_factory=dict)
    weather: dict[str, WorldEntry] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class FishLocation:
    location_id: str
    name: LocalizedName


@dataclass(frozen=True, slots=True)
class FishAppearance:
    location_id: str
    season: str
    time_period: str
    time_range: str


@dataclass(frozen=True, slots=True)
class Fish:
    id: str
    numeric_id: int
    name: LocalizedName
    sell_price: int
    locations: tuple[FishLocation, ...]
    appearances: tuple[FishAppearance, ...] = ()
    seasons: tuple[str, ...] = ()
    time_periods: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class GiftItem:
    item_id: str
    preference: int


@dataclass(frozen=True, slots=True)
class Character:
    id: str
    numeric_id: int
    name: LocalizedName
    role_ja: str
    gift_items: tuple[GiftItem, ...]


@dataclass(frozen=True, slots=True)
class WorldEntry:
    id: str
    numeric_id: int
    name: LocalizedName


@dataclass(frozen=True, slots=True)
class HuntReward:
    id: str
    numeric_id: int
    certificate_item_id: str | None
    rewards: tuple[ItemQuantity, ...]


@dataclass(slots=True)
class WorldSnapshot:
    fish: dict[str, Fish] = field(default_factory=dict)
    livestock: dict[str, WorldEntry] = field(default_factory=dict)
    characters: dict[str, Character] = field(default_factory=dict)
    facilities: dict[str, WorldEntry] = field(default_factory=dict)
    facility_releases: dict[str, WorldEntry] = field(default_factory=dict)
    quests: dict[str, WorldEntry] = field(default_factory=dict)
    collectibles: dict[str, WorldEntry] = field(default_factory=dict)
    hunt_rewards: dict[str, HuntReward] = field(default_factory=dict)
    weather: dict[str, WorldEntry] = field(default_factory=dict)
