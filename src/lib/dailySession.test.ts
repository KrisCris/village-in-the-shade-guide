import { describe, expect, it } from 'vitest';
import { DAILY_SESSION_KEY, readDailySession, writeDailySession } from './dailySession';
import { identifySave } from './saveSession';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as unknown as Storage;
}

describe('daily planner session', () => {
  it('reopens the save identity it wrote and forgets it on request', async () => {
    const storage = memoryStorage();
    const identity = await identifySave(new Uint8Array([1, 2, 3]), 'save.002');
    expect(writeDailySession(storage, identity)).toBe(true);
    expect(readDailySession(storage)).toEqual(identity);
    expect(writeDailySession(storage, null)).toBe(true);
    expect(readDailySession(storage)).toBeNull();
  });

  it('treats missing, blocked, malformed or older values as no session', () => {
    const sha256 = 'a'.repeat(64);
    expect(readDailySession(undefined)).toBeNull();
    expect(readDailySession(memoryStorage())).toBeNull();
    expect(readDailySession({ getItem: () => { throw new Error('blocked'); } } as unknown as Storage)).toBeNull();
    for (const value of ['{', 'null', '[]', JSON.stringify({ version: 2, identity: { name: 'save.001', size: 3, sha256 } }),
      JSON.stringify({ version: 1, identity: { name: 'save.001', size: 1.5, sha256 } }),
      JSON.stringify({ version: 1, identity: { name: 'save.001', size: 3, sha256: 'not-a-hash' } }),
      JSON.stringify({ version: 1, identity: { size: 3, sha256 } })]) {
      expect(readDailySession(memoryStorage({ [DAILY_SESSION_KEY]: value }))).toBeNull();
    }
  });

  it('reports storage that cannot be written', async () => {
    const full = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(writeDailySession(undefined, null)).toBe(false);
    expect(writeDailySession(full, await identifySave(new Uint8Array([1]), 'save.001'))).toBe(false);
  });
});
