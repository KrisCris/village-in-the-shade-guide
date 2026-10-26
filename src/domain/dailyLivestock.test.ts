import { describe, expect, it } from 'vitest';
import type { DailyBundleSpec, HouseOrder } from '../data/dailyPayload';
import type { DailyHouse } from '../lib/saveDaily';
import type { DeliveryPlan } from './dailyDeliveries';
import { livestockPlan } from './dailyLivestock';

const COW = 1, SHEEP = 2, PIG = 3, TURKEY = 5, HORSE = 17, MILK = 130000, TRUFFLE = 130100, EGG = 130080, HAIR = 130160;
const animals = [{ species: COW, house: 0, products: [MILK] }, { species: PIG, house: 0, products: [TRUFFLE] }, { species: TURKEY, house: 1, products: [EGG] }, { species: HORSE, house: 2, products: [HAIR] }];
const order = (type: number, slots: number, from: number | null, flag: number | null = null): HouseOrder => ({ type, name: `h${type}-${slots}`, slots, from, limit: from === null ? (type === 2 ? 1 : 4) : 0, flag, inputs: [], money: 1000 });
const orders = [order(0, 4, null), order(0, 8, 4), order(0, 12, 8), order(1, 8, null), order(1, 12, 8), order(2, 3, null, 550)];
const house = (id: number, type: number, slots: number, residents: number[]): DailyHouse => ({ id, type, title: '', slots, residents });
const pending = (id: number, ...lines: Array<[itemId: number, species: number[], owned: boolean]>): DeliveryPlan => ({
  spec: { id, list: 'catalog', name: '', place: '', items: [], rewards: [] } as DailyBundleSpec, ready: false,
  lines: lines.map(([itemId, species, owned]) => ({ itemId, rank: 0, remain: 1, have: 0, sources: [{ kind: 'animal', species, owned }] })),
});

describe('livestock plan', () => {
  it('adds up housing by type', () => {
    const { housing } = livestockPlan([house(1, 0, 4, [COW, SHEEP]), house(2, 0, 8, [COW]), house(3, 1, 8, [])], [], animals);
    expect(housing).toEqual([{ type: 0, houses: 2, slots: 12, used: 3 }, { type: 1, houses: 1, slots: 8, used: 0 }]);
  });

  it('suggests animals whose products deliveries miss, with the room their house has', () => {
    const houses = [house(1, 0, 4, [COW, COW, COW, COW]), house(2, 1, 8, [])];
    const { ideas } = livestockPlan(houses, [pending(59, [EGG, [TURKEY], false]), pending(60, [TRUFFLE, [PIG], false], [MILK, [COW], true]), pending(61, [TRUFFLE, [PIG], false])], animals, orders);
    expect(ideas.map(({ species, items, bundles, room, housed }) => ({ species, items, bundles, room, housed }))).toEqual([
      { species: TURKEY, items: [EGG], bundles: [59], room: 8, housed: true },
      { species: PIG, items: [TRUFFLE], bundles: [60, 61], room: 0, housed: true },
    ]);
    // A full barn: renovate the smallest one first.
    expect(ideas[1].order).toMatchObject({ type: 0, slots: 8, from: 4, locked: false });
    expect(ideas[0].order).toBeUndefined();
  });

  it('builds another house once every house is at the largest size, up to the limit', () => {
    const full = (count: number) => Array.from({ length: count }, (_, index) => house(index, 0, 12, Array(12).fill(COW)));
    expect(livestockPlan(full(2), [pending(60, [TRUFFLE, [PIG], false])], animals, orders).ideas[0].order).toMatchObject({ slots: 4, from: null });
    expect(livestockPlan(full(4), [pending(60, [TRUFFLE, [PIG], false])], animals, orders).ideas[0].order).toBeUndefined();
  });

  it('marks the stable locked until its flag is on', () => {
    const plan = (unlocked: Set<number>) => livestockPlan([], [pending(61, [HAIR, [HORSE], false])], animals, orders, unlocked).ideas[0];
    expect(plan(new Set())).toMatchObject({ housed: false, room: 0, order: { type: 2, slots: 3, locked: true } });
    expect(plan(new Set([550])).order?.locked).toBe(false);
  });
});
