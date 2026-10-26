import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, readSettings, writeSettings } from './dailyData';

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
