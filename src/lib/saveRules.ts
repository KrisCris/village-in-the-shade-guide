import source from '../../data/sources/game-save-editor-rules.json';

const constants = source.constants;
export const SAVE_RULES = {
  moneyMax: constants.MONEY_MAX.value,
  stackMax: constants.ITEM_STACK_MAX.value,
  hp: { initial: constants.PLAYER_STATUS_HP_INITIAL_VALUE.value, max: constants.PLAYER_STATUS_HP_MAX_VALUE.value, unit: constants.PLAYER_STATUS_HP_HEART_MAX.value },
  stamina: { initial: constants.PLAYER_STATUS_ST_INITIAL_VALUE.value, max: constants.PLAYER_STATUS_ST_MAX_VALUE.value, unit: constants.PLAYER_STATUS_ST_GAUGE_MAX.value },
  npcHearts: [constants.NPC_LOVE_LEVEL1_MAX.value, constants.NPC_LOVE_LEVEL2_MAX.value, constants.NPC_LOVE_LEVEL3_MAX.value, constants.NPC_LOVE_LEVEL4_MAX.value, constants.NPC_LOVE_LEVEL5_MAX.value, constants.NPC_LOVE_LEVEL6_MAX.value],
};

/** The game's final rank is BRAND, not an independently defined platinum rank. */
export const ITEM_RANKS = [
  { value: constants.ITEM_RANK_NORMAL.value, label: '普通' },
  { value: constants.ITEM_RANK_COPPER.value, label: '铜星' },
  { value: constants.ITEM_RANK_SILVER.value, label: '银星' },
  { value: constants.ITEM_RANK_GOLD.value, label: '金星' },
  { value: constants.ITEM_RANK_BRAND.value, label: '品牌' },
];

export function heartFill(points: number, thresholds: readonly number[]): number[] {
  return thresholds.map((end, index) => {
    const start = thresholds[index - 1] ?? 0;
    return Math.max(0, Math.min(1, (points - start) / (end - start)));
  });
}
