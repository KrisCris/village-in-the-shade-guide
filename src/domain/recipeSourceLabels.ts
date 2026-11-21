import { msg } from '../i18n/translate';

export type RecipeSourceType = 'lesson' | 'dinner' | 'restaurant' | 'festival' | 'quest';

/** Recipe source filter labels, in the order the recipe list offers them. */
export const recipeSourceLabels: Record<RecipeSourceType, string> = {
  lesson: msg('村民交谈传授'),
  dinner: msg('村民晚饭邀请'),
  restaurant: msg('茶碗亭点餐'),
  festival: msg('庙会摊位'),
  quest: msg('委托奖励'),
};
