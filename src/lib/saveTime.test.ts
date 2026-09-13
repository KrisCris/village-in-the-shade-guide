import { describe, expect, it } from 'vitest';
import { joinGameTime, MAX_GAME_SECONDS, splitGameTime } from './saveTime';

describe('game calendar conversion', () => {
  it.each([
    ['0', '1', '0', '1', '7', '0', '0'],
    ['61200', '1', '0', '1', '0', '0', '0'],
    ['86399', '1', '0', '1', '6', '59', '59'],
    ['86400', '1', '0', '2', '7', '0', '0'],
    ['2419199', '1', '0', '28', '6', '59', '59'],
    ['2419200', '1', '1', '1', '7', '0', '0'],
    ['9676799', '1', '3', '28', '6', '59', '59'],
    ['9676800', '2', '0', '1', '7', '0', '0'],
    ['7344000', '1', '3', '2', '7', '0', '0'],
  ])('round-trips %s across day/season/year boundaries', (seconds, year, season, day, hour, minute, second) => {
    const date = { year, season, day, hour, minute, second };
    expect(splitGameTime(seconds)).toEqual(date);
    expect(joinGameTime(date)).toBe(seconds);
  });

  it('keeps i64 values exact, including above Number precision', () => {
    for (const value of ['9007199254740993', String(MAX_GAME_SECONDS)]) {
      expect(joinGameTime(splitGameTime(value)!)).toBe(value);
    }
  });

  it('rejects incomplete, out-of-range and overflowing inputs', () => {
    for (const value of ['', '-1', '1.2', 'abc', String(MAX_GAME_SECONDS + 1n)]) expect(splitGameTime(value)).toBeNull();
    const date = splitGameTime('0')!;
    for (const patch of [{ year: '' }, { year: '0' }, { day: '29' }, { season: '4' }, { hour: '24' }, { minute: '60' }, { second: '-1' }, { year: String(MAX_GAME_SECONDS) }]) {
      expect(joinGameTime({ ...date, ...patch })).toBeNull();
    }
  });
});
