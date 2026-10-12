export type QuestStatus = 'hidden' | 'complete' | 'pending';
/**
 * Quest records use state 0 (hidden), 1 or 2 (shown) and 3 (complete), but the main-story
 * village rules stay at 1 or 2 after their last step. With a checklist, every checked step means finished.
 */
export function questStatus(state: number, check: number, steps: { level: number }[]): QuestStatus {
  if (state === 0) return 'hidden';
  return state === 3 || (steps.length > 0 && steps.every(step => check > step.level)) ? 'complete' : 'pending';
}
