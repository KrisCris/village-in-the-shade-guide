import type { Entity } from "../../data/types";

// These are wardrobe unlock categories, distinct from placeable furniture/accessories.
const wardrobe = new Set([
  "ITEM_CATEGORY_ORNAMENTS",
  "ITEM_CATEGORY_CLOTHES",
  "ITEM_CATEGORY_FRONT_HAIRSTYLE",
  "ITEM_CATEGORY_BACK_HAIRSTYLE",
  "ITEM_CATEGORY_COLLAR",
]);
export const selectableEntity = (e: Entity) =>
  e.kind !== "items" || !wardrobe.has(e.category_id ?? "");
export const categoryKey = (e: Entity) => e.category_id || e.kind;
export const categoryLabel = (e: Entity) =>
  e.category_name?.zh_hans ||
  ({
    crops: "作物",
    processes: "加工配方",
    machines: "机械",
    items: "其他物品",
  }[e.kind] ??
    e.kind);
export const seasonNames: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};
