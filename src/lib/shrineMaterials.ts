import recipes from '../../data/sources/game-shrine-recipe-materials.json';
import type { MaterialRequest } from './saveInventory';
import { UNLOCKS } from './saveDeliveries';
import { tr } from '../i18n/active';

// The shrine UI's six-item array at native 0x1403e2218–0x1403e224f.
export const SHRINE_COST_ITEMS = [650000, 650010, 650020, 650030, 650040, 650060] as const;
export function shrineLearningMaterials(nodeId: number): MaterialRequest[] {
  const node = UNLOCKS.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error(tr('神龛节点不存在。'));
  return node.costs.flatMap((count, index) => count ? [{ itemId: SHRINE_COST_ITEMS[index], count }] : []);
}

export function shrineRecipeMaterials(itemId: number): MaterialRequest[] {
  return recipes.find(recipe => recipe.output === itemId)?.materials ?? [];
}
