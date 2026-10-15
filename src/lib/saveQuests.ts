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

/**
 * Game saves never use state 1: a shown quest is 2. The village rules and the villagers' help
 * requests stay at 2 after their last checklist step; every other quest closes at 3.
 */
const OPEN_WHEN_DONE = /^QUEST_ID_(CHAIN_VILLAGE_RULES|HUNTER|ORPHAN|BOY|STREET_VENDOR|GIRL|GENERAL_STORE_MASTER|YOUNG_MAN|OLD_MAN|SECRETARY|FEMALE_DOCTOR|CARPENTER|WOODCUTTER)_\d+$/;
const shownState = (state: number) => state === 1 || state === 2 ? state : 2;

/** The record state that goes with a new checklist level. */
export function questStateForChecklist(code: string, state: number, check: number, max: number): number {
  return max > 0 && check >= max && !OPEN_WHEN_DONE.test(code) ? 3 : shownState(state);
}

/** State and checklist level for a record choice; `check` is undefined when it stays as is. */
export function questRecord(code: string, stepCount: number, state: number, record: 'hidden' | 'shown' | 'done', max: number): { state: number; check?: number } {
  if (record === 'hidden') return { state: 0 };
  if (record === 'shown') return { state: shownState(state) };
  return { state: stepCount && OPEN_WHEN_DONE.test(code) ? shownState(state) : 3, check: stepCount ? max : undefined };
}
