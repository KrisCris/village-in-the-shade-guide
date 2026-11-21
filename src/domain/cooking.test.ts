import { describe, expect, it } from 'vitest';
import type { Entity } from '../data/types';
import { getCatalog } from '../data/repository';
import { dishEffect, hearts, ingredientValue, menuEntry, recipeSource, staminaBars } from './cooking';

const item = (id: string, sell_price: number) => ({ id, kind: 'items', sell_price }) as unknown as Entity;

describe('cooking data', () => {
  it('reads what a dish restores', () => {
    // Boiled Eggs: 5 Health and 113 Stamina in item.dat.
    expect(dishEffect('ITEM_ID_COOKING_003')).toMatchObject({ hp: 5, stamina: 113 });
    expect(hearts(5)).toBe('1.25');
    expect(staminaBars(113)).toBe('0.6');
    expect(staminaBars(950)).toBe('5');
    expect(dishEffect(undefined)).toBeUndefined();
  });

  it('sums base sell prices and takes the cheapest choice for a free slot', () => {
    const byId = Object.fromEntries([item('egg', 30), item('duck', 50), item('soy', 20)].map(row => [row.id, row]));
    const recipe = { inputs: [{ item_id: 'egg', quantity: 2 }, { item_id: 'soy', quantity: 1 }], ingredient_options: [{ slot: 0, item_ids: ['duck', 'egg'] }] } as unknown as Entity;
    expect(ingredientValue(recipe, byId)).toBe(80);
    expect(ingredientValue({ inputs: [{ item_id: 'missing', quantity: 1 }] } as unknown as Entity, byId)).toBeNull();
  });

  it('gives every recipe exactly one source', () => {
    const catalog = getCatalog();
    const recipes = catalog.entities.filter(row => row.kind === 'cooking-recipes');
    expect(recipes).toHaveLength(118);
    const counts = recipes.reduce<Record<string, number>>((sum, recipe) => {
      const type = recipeSource(recipe)?.type ?? 'none';
      return { ...sum, [type]: (sum[type] ?? 0) + 1 };
    }, {});
    expect(counts).toEqual({ lesson: 42, dinner: 42, restaurant: 30, festival: 3, quest: 1 });
    expect(recipes.every(recipe => recipe.recipe_source_label && typeof recipe.heal_hp === 'number')).toBe(true);
  });

  it('enriches recipes, dishes and menu listings in the catalog', () => {
    const catalog = getCatalog();
    const rice = catalog.byId.COOKING_ID_001;
    expect(rice).toMatchObject({ menu_price: 450, menu_venue: 'restaurant', recipe_source_type: 'restaurant', recipe_source_label: '茶碗亭 · 点餐 3 次' });
    // Mitsuba and bracken each sell for their base price.
    expect(rice.ingredient_value).toBe(Number(catalog.byId.ITEM_ID_OBJECT_MITSUBA.sell_price) + Number(catalog.byId.ITEM_ID_OBJECT_BRACKEN.sell_price));
    expect(catalog.byId.ITEM_ID_COOKING_001).toMatchObject({ heal_hp: dishEffect('ITEM_ID_COOKING_001')!.hp, menu_price: 450 });
    expect(catalog.byId.STORE_SALE_ID_RESTAURANT_0001).toMatchObject({ location: '茶碗亭', menu_venue: 'restaurant' });
    expect(catalog.byId.STORE_SALE_ID_RESTAURANT_0117).toMatchObject({ location: '庙会', menu_venue: 'festival', conditions: ['夏 15 日 16:00～20:00'] });
    expect(menuEntry('ITEM_ID_COOKING_117')).toMatchObject({ venue: 'festival', price: 700 });
    expect(catalog.byId.COOKING_ID_003.recipe_source_label).toBe('委托：帮忙六角');
    expect(catalog.byId.COOKING_ID_001.searchText).toContain('茶碗亭');
  });
});
