import { describe, expect, it } from 'vitest';
import curse from '../../data/sources/game-curse-items.json';
import fishing from '../../data/sources/game-fishing.json';
import { catchChances, WHITE_FISH } from './fishingOdds';

const kinds = curse.fish_kind as Record<string, number>;

describe('catchChances', () => {
  it('gives the waterfall white carp 1/99 of the rows before it, not its fishing.dat weight', () => {
    const rows = fishing.spawns.filter(row => row.spot === 'FISHING_ID_03' && row.season === 'spring' && row.period === 'morning');
    expect(rows.at(-1)).toMatchObject({ item: 'ITEM_ID_FISHING_WHITE_CARP', weight: 0.5 });
    const chances = catchChances(rows, kinds);
    // The seven rows before it weigh 100+100+300+300+600+300+100 = 1800, so the carp weighs 18.
    expect(chances.get('ITEM_ID_FISHING_WHITE_CARP')).toBeCloseTo(18 / 1818);
    expect(chances.get('ITEM_ID_FISHING_FRESHWATER_CRAB')).toBeCloseTo(600 / 1818);
    expect([...chances.values()].reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });
  it('uses the running total, so a white fish listed first never bites', () => {
    const chances = catchChances([{ item: 'ITEM_ID_FISHING_WHITE_CARP', weight: 0.5 }, { item: 'ITEM_ID_FISHING_CARP', weight: 3 }], kinds);
    expect(chances.get('ITEM_ID_FISHING_WHITE_CARP')).toBe(0);
    expect(chances.get('ITEM_ID_FISHING_CARP')).toBe(1);
  });
  it('knows the kind of every fishing.dat item', () => {
    expect(fishing.spawns.every(row => row.item in kinds)).toBe(true);
    expect(fishing.spawns.filter(row => kinds[row.item] === WHITE_FISH).every(row => row.item.startsWith('ITEM_ID_FISHING_WHITE_'))).toBe(true);
  });
});
