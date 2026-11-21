import cooking from '../../data/sources/game-cooking.json';
import recipeLessons from '../../data/sources/game-recipe-lessons.json';
import dinnerParties from '../../data/sources/game-dinner-parties.json';
import type { Entity } from '../data/types';
import type { RecipeSourceType } from './recipeSourceLabels';

export type { RecipeSourceType };
export type MenuEntry = (typeof cooking.menu)[number] & { venue: 'restaurant' | 'festival' };
export type RecipeSource =
  | { type: 'lesson'; character_numeric_id: number; level: number }
  | { type: 'dinner'; character_numeric_id: number }
  | { type: 'restaurant'; menu: MenuEntry }
  | { type: 'festival'; menu: MenuEntry }
  | { type: 'quest'; quest_id: string; reward_item_id: string };

export const ordersToLearn = cooking.orders_to_learn;
export const festival = cooking.festival;
export const player = cooking.player;

const menu = new Map(cooking.menu.map(entry => [entry.item_id, entry as MenuEntry]));
const effects = new Map(cooking.dishes.map(dish => [dish.item_id, dish]));
// The extractor asserts that every recipe flag appears in exactly one of these lists.
const sources = new Map<number, RecipeSource>([
  ...recipeLessons.lessons.map(lesson => [lesson.recipe_unlock_flag, { type: 'lesson', character_numeric_id: lesson.character_numeric_id, level: lesson.friendship_level }] as const),
  ...dinnerParties.hosts.flatMap(host => host.dinners.map(dinner => [dinner.recipe_unlock_flag, { type: 'dinner', character_numeric_id: host.character_numeric_id }] as const)),
  ...[...menu.values()].map(entry => [entry.recipe_unlock_flag, { type: entry.venue, menu: entry } as RecipeSource] as const),
  ...cooking.quests.map(quest => [quest.recipe_unlock_flag, { type: 'quest', quest_id: quest.quest_id, reward_item_id: quest.reward_item_id }] as const),
]);

export const cookingQuests = cooking.quests;

export function recipeSource(recipe: Entity): RecipeSource | undefined {
  return sources.get(Number(recipe.unlock_flag));
}

/** Where a dish is served or sold, if anywhere. */
export function menuEntry(itemId: string | undefined): MenuEntry | undefined {
  return itemId ? menu.get(itemId) : undefined;
}

/** The menu entry behind a STORE_SALE_ID_RESTAURANT_* listing. */
export function menuEntryForSale(saleId: string): MenuEntry | undefined {
  return [...menu.values()].find(entry => entry.sale_ids.includes(saleId));
}

/** HP and stamina restored by eating the item. */
export function dishEffect(itemId: string | undefined): { hp: number; stamina: number } | undefined {
  return itemId ? effects.get(itemId) : undefined;
}

/** HP in hearts, as the HUD draws them (a heart holds four HP). */
export function hearts(hp: number): string {
  return String(Math.round(hp / player.hp_per_heart * 100) / 100);
}

/** Stamina in HUD bars, to one decimal. */
export function staminaBars(stamina: number): string {
  return String(Math.round(stamina / player.stamina_per_bar * 10) / 10);
}

type Input = { item_id: string; quantity: number };
type Option = { slot: number; item_ids: string[] };

/** Base sell price of the ingredients; a slot that takes any item of a kind counts its cheapest choice. */
export function ingredientValue(recipe: Entity, byId: Record<string, Entity | undefined>): number | null {
  const options = (recipe.ingredient_options ?? []) as Option[];
  let total = 0;
  for (const [slot, input] of ((recipe.inputs ?? []) as Input[]).entries()) {
    const candidates = options.find(option => option.slot === slot)?.item_ids ?? [input.item_id];
    const prices = candidates.map(id => byId[id]?.sell_price).filter((price): price is number => typeof price === 'number');
    if (!prices.length) return null;
    total += Math.min(...prices) * input.quantity;
  }
  return total;
}
