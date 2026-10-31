export type HuntRewardEntry = { item_id: string; quantity: number; weight: number };

export type HuntRewardOdds = HuntRewardEntry & {
  /** Chance that one draw lands on this entry. */
  perDraw: number;
  /** Chance that one certificate lands on this entry at least once. */
  perCertificate: number;
};

/**
 * Reward odds for one hunt-rewards entity (huntreward.dat).
 *
 * village.exe build 25640656 (filing box 0x14026b320, submit menu 0x140432cd0): each certificate makes draw_count
 * independent draws. A draw picks one entry with probability weight / sum of weights, and gives quantity of it.
 * See docs/data-evidence/hunt-rewards.md.
 */
export function huntRewardOdds(reward: { draw_count?: unknown; rewards?: unknown; [field: string]: unknown }): HuntRewardOdds[] {
  const entries = (reward.rewards ?? []) as HuntRewardEntry[];
  const draws = Number(reward.draw_count ?? 0);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  return entries.map((entry) => {
    const perDraw = total ? entry.weight / total : 0;
    return { ...entry, perDraw, perCertificate: 1 - (1 - perDraw) ** draws };
  });
}
