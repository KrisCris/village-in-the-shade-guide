import type { Entity, Perennial } from "../../data/types";
import { tr } from '../../i18n/active';

// These are wardrobe unlock categories, distinct from placeable furniture/accessories.
// GameAddInventoryItem -> 0x140268AE0 -> 0x1401488A0 checks categories 34–39
// via 0x1401653C0, unlocks the appearance via 0x140164ED0, then skips the backpack.
const wardrobe = new Set([
  "ITEM_CATEGORY_ORNAMENTS",
  "ITEM_CATEGORY_CLOTHES",
  "ITEM_CATEGORY_FRONT_HAIRSTYLE",
  "ITEM_CATEGORY_BACK_HAIRSTYLE",
  "ITEM_CATEGORY_COLLAR",
  "ITEM_CATEGORY_BAG",
]);
export const selectableEntity = (e: Entity) =>
  e.kind !== "items" || !wardrobe.has(e.category_id ?? "");
export const categoryKey = (e: Entity) => e.category_id || e.kind;
export const categoryLabel = (e: Entity) =>
  e.category_name?.zh_hans ||
  ({
    crops: tr('作物'),
    processes: tr('加工配方'),
    machines: tr('机械'),
    items: tr('其他物品'),
  }[e.kind] ??
    e.kind);
export const seasonNames: Record<string, string> = {
  spring: tr('春'),
  summer: tr('夏'),
  autumn: tr('秋'),
  winter: tr('冬'),
};
/** When a shrub or fruit tree bears, such as 夏季结果. */
export const bearingLabel = (perennial: Perennial) =>
  perennial.kind === "fruit_tree" && perennial.greenhouse_only
    ? tr('温室里四季结果')
    : tr('{seasons}季结果', { seasons: perennial.bearing_seasons.map((s) => seasonNames[s] ?? s).join("、") });
