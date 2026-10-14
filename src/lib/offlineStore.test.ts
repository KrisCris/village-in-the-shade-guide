import { describe, expect, it } from 'vitest';
import { pendingEntries, staleEntries, storedBytes, totalBytes, type OfflineEntry } from './offlineStore';

const entries: OfflineEntry[] = [
  ['', 100, 'aaa'],
  ['data/crops/', 200, 'bbb'],
  ['icons/a.webp', 50, 'ccc'],
];

describe('offline download bookkeeping', () => {
  it('fetches missing and changed files only', () => {
    const stored = { '': 'aaa', 'data/crops/': 'old' };
    expect(pendingEntries(entries, stored).map(([path]) => path)).toEqual(['data/crops/', 'icons/a.webp']);
    expect(pendingEntries(entries, { '': 'aaa', 'data/crops/': 'bbb', 'icons/a.webp': 'ccc' })).toEqual([]);
  });

  it('counts only current files as stored', () => {
    expect(storedBytes(entries, { '': 'aaa', 'data/crops/': 'old' })).toBe(100);
    expect(totalBytes(entries)).toBe(350);
  });

  it('finds stored files a deployment removed', () => {
    expect(staleEntries(entries, { '': 'aaa', 'guides/old/': 'ddd' })).toEqual(['guides/old/']);
  });
});
