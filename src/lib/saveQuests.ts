export type QuestStatus = 'hidden' | 'complete' | 'pending';
/**
 * Quest records use state 0 (hidden), 1 or 2 (shown) and 3 (complete), but the main-story
 * village rules stay at 1 or 2 after their last step. With a checklist, every checked step means finished.
 */
export function questStatus(state: number, check: number, steps: { level: number }[]): QuestStatus {
  if (state === 0) return 'hidden';
  return state === 3 || (steps.length > 0 && steps.every(step => check > step.level)) ? 'complete' : 'pending';
}

export const GRAND_GOAL = 'QUEST_ID_CHAIN_GRAND_GOAL';
const VILLAGE_RULE = /^QUEST_ID_CHAIN_VILLAGE_RULES_\d+$/;

/**
 * 成为彼津村的一员 has no checklist and its record stays shown after the story ends, while the
 * game shows it done; it is the goal the village rules build up to, so it is complete once every rule is.
 */
export function questStatuses<T extends { code: string; state: number; check: number; steps: { level: number }[] }>(quests: T[]): Map<T, QuestStatus> {
  const result = new Map(quests.map(quest => [quest, questStatus(quest.state, quest.check, quest.steps)]));
  const rules = quests.filter(quest => VILLAGE_RULE.test(quest.code));
  const goal = quests.find(quest => quest.code === GRAND_GOAL);
  if (goal && result.get(goal) === 'pending' && rules.length && rules.every(rule => result.get(rule) === 'complete')) result.set(goal, 'complete');
  return result;
}
