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


@dataclass(frozen=True, slots=True)
class Crop:
    id: str
    numeric_id: int
    name: LocalizedName
    seed_item_ids: tuple[str, ...]
    harvest_item_ids: tuple[str, ...]
    seasons: tuple[str, ...] = ()


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
