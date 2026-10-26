import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, readDone, readSettings, writeDone, writeSettings } from './dailyData';

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } } as Storage;
};

describe('daily settings', () => {
  it('keeps settings per player', () => {
    const storage = memory();
    expect(writeSettings(storage, 'a', { horizon: 14, reserve: 0.3, choices: { 100: 0 } })).toBe(true);
    writeSettings(storage, 'b', { horizon: 7, reserve: 0, choices: {} });
    expect(readSettings(storage, 'a')).toEqual({ horizon: 14, reserve: 0.3, choices: { 100: 0 } });
    expect(readSettings(storage, 'b')).toEqual({ horizon: 7, reserve: 0, choices: {} });
    expect(readSettings(storage, 'c')).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for damaged or missing storage', () => {
    expect(readSettings(memory({ 'village-daily:settings:v1': '{' }), 'a')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memory({ 'village-daily:settings:v1': '{"a":{"horizon":-1,"reserve":2,"choices":{"1":"x","2":3}}}' }), 'a')).toEqual({ horizon: 0, reserve: 0.2, choices: { 2: 3 } });
    expect(readSettings(undefined, 'a')).toEqual(DEFAULT_SETTINGS);
    expect(writeSettings(undefined, 'a', DEFAULT_SETTINGS)).toBe(false);
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(writeSettings(full, 'a', DEFAULT_SETTINGS)).toBe(false);
  });
});

describe('ticked-off tasks', () => {
  it('keeps one save per player and forgets other saves', () => {
    const storage = memory();
    expect(writeDone(storage, 'a', '1-3-1', ['deliver', 'routine'])).toBe(true);
    writeDone(storage, 'b', '1-3-2', ['build']);
    expect(readDone(storage, 'a', '1-3-1')).toEqual(['deliver', 'routine']);
    expect(readDone(storage, 'a', '1-3-2')).toEqual([]);
    expect(readDone(storage, 'b', '1-3-2')).toEqual(['build']);
    writeDone(storage, 'a', '1-3-2', ['plant']);
    expect(readDone(storage, 'a', '1-3-1')).toEqual([]);
  });

  it('ignores damaged or missing storage', () => {
    expect(readDone(memory({ 'village-daily:done:v1': '{' }), 'a', 'd')).toEqual([]);
    expect(readDone(memory({ 'village-daily:done:v1': '{"a":{"save":"d","keys":["x",3]}}' }), 'a', 'd')).toEqual(['x']);
    expect(readDone(undefined, 'a', 'd')).toEqual([]);
    expect(writeDone(undefined, 'a', 'd', [])).toBe(false);
  });
});
