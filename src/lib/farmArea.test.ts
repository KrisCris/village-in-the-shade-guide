import { describe, expect, it } from 'vitest';
import { addToFarmArea, emptyFarmArea, FARM_AREA_KEY, learnFarmArea, readFarmArea, removeFromFarmArea, writeFarmArea } from './farmArea';
import type { DailyCell } from './saveDaily';

const cell = (id: number, soil: number, crop = 0): DailyCell => ({ id, crop, wild: false, soil, wet: false, form: 1, growth: 0, maximum: 0, fertilizer: 0 });

function memoryStorage(initial: Record<string, string> = {}, failWrites = false): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { if (failWrites) throw new Error('quota'); data.set(key, value); },
  };
}

describe('farm area', () => {
  it('learns tilled, ridge and paddy cells and keeps cells that reverted overnight', () => {
    const first = learnFarmArea(emptyFarmArea(), [cell(3, 1), cell(1, 2), cell(2, 0, 55), cell(4, 3)]);
    expect(first.include).toEqual([1, 3, 4]);
    // The next morning cell 3 is plain ground again; it stays in the area.
    expect(learnFarmArea(first, [cell(1, 2), cell(5, 1)]).include).toEqual([1, 3, 4, 5]);
  });

  it('keeps cells removed by hand out of the area while they are still tilled', () => {
    const area = removeFromFarmArea(learnFarmArea(emptyFarmArea(), [cell(1, 1), cell(2, 1)]), [2]);
    expect(area).toEqual({ include: [1], exclude: [2] });
    expect(learnFarmArea(area, [cell(1, 1), cell(2, 1)]).include).toEqual([1]);
    expect(addToFarmArea(area, [2, 7])).toEqual({ include: [1, 2, 7], exclude: [] });
  });

  it('stores one area per player and ignores unreadable or invalid values', () => {
    const storage = memoryStorage();
    expect(writeFarmArea(storage, 'A', { include: [1, 2], exclude: [3] })).toBe(true);
    expect(writeFarmArea(storage, 'B', { include: [9], exclude: [] })).toBe(true);
    expect(readFarmArea(storage, 'A')).toEqual({ include: [1, 2], exclude: [3] });
    expect(readFarmArea(storage, 'B')).toEqual({ include: [9], exclude: [] });
    expect(readFarmArea(storage, 'C')).toBeNull();
    expect(readFarmArea(memoryStorage({ [FARM_AREA_KEY]: '{oops' }), 'A')).toBeNull();
    expect(readFarmArea(memoryStorage({ [FARM_AREA_KEY]: JSON.stringify({ A: { include: ['x'], exclude: [] } }) }), 'A')).toBeNull();
    expect(readFarmArea(undefined, 'A')).toBeNull();
  });

  it('replaces an unreadable stored value and reports blocked storage', () => {
    const storage = memoryStorage({ [FARM_AREA_KEY]: '{oops' });
    expect(writeFarmArea(storage, 'A', { include: [1], exclude: [] })).toBe(true);
    expect(readFarmArea(storage, 'A')).toEqual({ include: [1], exclude: [] });
    expect(writeFarmArea(memoryStorage({}, true), 'A', emptyFarmArea())).toBe(false);
    expect(writeFarmArea(undefined, 'A', emptyFarmArea())).toBe(false);
  });
});
