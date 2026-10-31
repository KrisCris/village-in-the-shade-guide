import type { SaveIdentity } from './saveSession';

/**
 * The planner never edits a save, so the chosen file is its whole session.
 * The bytes go to the save editor's content-addressed IndexedDB store; the tab
 * keeps only this pointer, so a refresh reopens the same save and closing the
 * tab forgets it.
 */
export const DAILY_SESSION_KEY = 'village-daily-planner:v1';

/** Storage may be missing or blocked; an unreadable or older value counts as no session. */
export function readDailySession(storage: Storage | undefined): SaveIdentity | null {
  try {
    const value = JSON.parse(storage?.getItem(DAILY_SESSION_KEY) ?? 'null');
    const identity = value?.version === 1 ? value.identity : undefined;
    if (typeof identity?.name === 'string' && Number.isSafeInteger(identity.size) && /^[a-f0-9]{64}$/.test(identity.sha256)) {
      return { name: identity.name, size: identity.size, sha256: identity.sha256 };
    }
  } catch { /* Fall through to no session. */ }
  return null;
}

/** Pass null to forget the session. */
export function writeDailySession(storage: Storage | undefined, identity: SaveIdentity | null): boolean {
  if (!storage) return false;
  try {
    if (identity) storage.setItem(DAILY_SESSION_KEY, JSON.stringify({ version: 1, identity }));
    else storage.removeItem(DAILY_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
