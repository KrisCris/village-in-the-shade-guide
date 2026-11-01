import { describe, expect, it } from 'vitest';
import type { DailyCraft } from '../data/dailyPayload';
import type { DailyMachine } from '../lib/saveDaily';
import { BUILD_DAYS, NOT_PROCESSED, planProcessing, type MachineSpecRow, type ProcessRow } from './dailyProcessing';

const JAR = 501, JAR_2 = 502, BARREL = 601, COMPOST = 701, BAR = 210020, WOOD = 230000;
const RICE = 100, BEAN = 101, WEED = 102, HOP = 103;
const DAY = 1440, HOUR = 3600;
const specs: MachineSpecRow[] = [
  { id: 1, itemId: JAR, capacity: 1, family: 'jar', mode: 'processing' },
  { id: 2, itemId: JAR_2, capacity: 3, family: 'jar', mode: 'processing' },
  { id: 3, itemId: BARREL, capacity: 1, family: 'barrel', mode: 'processing' },
  { id: 4, itemId: COMPOST, capacity: 1, family: 'compost', mode: 'processing' },
];
const recipe = (id: number, machine: number, input: number, output: number): ProcessRow => ({ id, machines: [machine], inputs: [{ itemId: input, count: 1 }], output, count: 1, minutes: DAY });
const processes = [recipe(11, 1, RICE, 900), recipe(12, 3, RICE, 901), recipe(13, 4, RICE, 902), recipe(14, 1, BEAN, 903), recipe(15, 4, WEED, 904), recipe(16, 3, HOP, 905)];
const prices = { [RICE]: 10, 900: 40, 901: 60, 902: 15, [BEAN]: 5, 903: 50, [WEED]: 10, 904: 15, [HOP]: 10, 905: 60 };
const crafts: DailyCraft[] = [
  { machine: JAR, inputs: [[WOOD, 10]], flag: null, skill: null },
  { machine: JAR_2, inputs: [[JAR, 1], [BAR, 2]], flag: 7, skill: '腌菜' },
  { machine: BARREL, inputs: [[WOOD, 20], [BAR, 1]], flag: 8, skill: '酿造' },
  { machine: COMPOST, inputs: [[WOOD, 5]], flag: null, skill: null },
];
/** A one-slot machine; `remaining` seconds left on its job, 0 for a finished one, none for an empty slot. */
const machine = (key: string, itemId: number, remaining?: number): DailyMachine => ({ key, itemId, jobs: remaining === undefined ? [] : [{ output: 900, count: 1, seconds: DAY * 60, remaining }] });
const plan = (free: Array<[number, number]>, fields: Partial<Parameters<typeof planProcessing>[0]> = {}) => planProcessing({
  machines: [machine('a', JAR), machine('b', JAR)], specs, processes, prices, crafts, unlocked: new Set([7, 8]), free: new Map(free), isProduce: (itemId) => itemId < 200, dayLeft: 17 * HOUR, ...fields,
});

describe('processing plan', () => {
  it('loads today’s slots for the most money, not greedily item by item', () => {
    // Rice adds 50 in the barrel and 30 in a jar; hops add 50 but only in the barrel. Rice taking the barrel would leave the jar empty.
    const result = plan([[RICE, 1], [HOP, 1], [BAR, 3]], { machines: [machine('a', JAR), machine('c', BARREL)] });
    const fill = Object.fromEntries(result.machines.map((day) => [day.family, day.fill.map(({ itemId, count, gain }) => [itemId, count, gain])]));
    expect(fill).toEqual({ jar: [[RICE, 1, 30]], barrel: [[HOP, 1, 50]] });
    expect(result.produce.map(({ itemId, held, today }) => [itemId, held, today])).toEqual([[RICE, 1, 1], [HOP, 1, 1]]);
    expect(result.build).toEqual([]);
  });

  it('loads today’s harvest along with the stock', () => {
    const result = plan([[RICE, 1]], { harvest: new Map([[RICE, 2], [HOP, 1]]) });
    expect(result.produce.map(({ itemId, held, harvest, today }) => [itemId, held, harvest, today])).toEqual([[RICE, 3, 2, 2], [HOP, 1, 1, 0]]);
  });

  it('counts finished slots as free and loads the ones that finish before the day ends', () => {
    const result = plan([[RICE, 10]], { machines: [machine('a', JAR, 0), machine('b', JAR, 2 * HOUR + 30), machine('c', JAR, 30 * HOUR), machine('d', BARREL, 20 * HOUR)] });
    const jar = result.machines.find((day) => day.family === 'jar')!, barrel = result.machines.find((day) => day.family === 'barrel')!;
    // Rounded up to the minute the slot frees.
    expect(jar).toMatchObject({ machines: 3, slots: 3, free: 1, ready: 1, later: [{ after: 2 * HOUR + 60, slots: 1 }], fill: [{ itemId: RICE, count: 2 }] });
    expect(jar.next).toBeUndefined();
    expect(barrel).toMatchObject({ free: 0, later: [], next: 20 * HOUR, fill: [] });
  });

  it('follows the player’s pick for an item', () => {
    const machines = [machine('a', JAR), machine('c', BARREL)];
    expect(plan([[RICE, 2]], { machines, choices: { [RICE]: NOT_PROCESSED } }).machines.flatMap((day) => day.fill)).toEqual([]);
    const jarOnly = plan([[RICE, 2]], { machines, choices: { [RICE]: 11 } });
    expect(jarOnly.produce[0]).toMatchObject({ pick: 11, today: 1 });
    expect(jarOnly.machines.find((day) => day.family === 'jar')?.fill).toMatchObject([{ itemId: RICE, count: 1 }]);
    // A pick for a recipe the item does not have is ignored.
    expect(plan([[RICE, 2]], { machines, choices: { [RICE]: 99 } }).produce[0].pick).toBeUndefined();
  });

  it('names the plan’s own recipe for each item, also when the player picked another', () => {
    const machines = [machine('a', JAR), machine('c', BARREL, 20 * HOUR)];
    const best = (choices: Record<string, number> = {}) => Object.fromEntries(plan([[RICE, 3], [HOP, 2], [WEED, 2]], { machines, choices }).produce.map((line) => [line.itemId, [line.best, line.planned, line.today]]));
    // The barrel is busy: rice goes in the jar today, hops wait for the barrel, and weeds add too little to build a compost bin for.
    expect(best()).toEqual({ [RICE]: [11, 30, 1], [HOP]: [16, 0, 0], [WEED]: [NOT_PROCESSED, 0, 0] });
    expect(best({ [RICE]: 12 })).toEqual({ [RICE]: [11, 30, 0], [HOP]: [16, 0, 0], [WEED]: [NOT_PROCESSED, 0, 0] });
  });

  it('suggests more of a machine whose queue runs past a week, with the cost and count of each way to add slots', () => {
    // Two jars, 30 beans of a day each: 15 days. Two more jars sit in storage.
    const result = plan([[BEAN, 30], [BAR, 5], [WOOD, 25], [JAR, 2]]);
    expect(result.build).toHaveLength(1);
    const [jar] = result.build;
    expect(jar).toMatchObject({ family: 'jar', machine: JAR, machines: 2, slots: 2, days: 15, stored: 2, perSlot: 45, waiting: [{ itemId: BEAN, count: 28 }] });
    expect(jar.days).toBeGreaterThan(BUILD_DAYS);
    // The upgrade recipe takes a standing jar, which is not a material to gather; a new upgraded jar needs both recipes' materials.
    expect(jar.options).toEqual([
      { machine: JAR_2, upgrade: true, slots: 2, inputs: [{ itemId: BAR, count: 2, held: 5 }], afford: 2, limit: BAR, basics: 2 },
      { machine: JAR_2, upgrade: false, via: JAR, slots: 3, inputs: [{ itemId: WOOD, count: 10, held: 25 }, { itemId: BAR, count: 2, held: 5 }], afford: 2, limit: WOOD },
      { machine: JAR, upgrade: false, slots: 1, inputs: [{ itemId: WOOD, count: 10, held: 25 }], afford: 2, limit: WOOD },
    ]);
    // A material both recipes take is counted once, summed.
    const shared = plan([[BEAN, 30], [BAR, 9]], { crafts: crafts.map((craft) => craft.machine === JAR ? { ...craft, inputs: [[BAR, 1]] } : craft) });
    expect(shared.build[0].options.find((option) => option.via)).toMatchObject({ inputs: [{ itemId: BAR, count: 3, held: 9 }], afford: 3, limit: BAR });
    // Twelve beans fit in a week: no suggestion.
    expect(plan([[BEAN, 12]]).build).toEqual([]);
  });

  it('suggests a machine the farm lacks only when it adds enough per item, and names the skill when it is locked', () => {
    const result = plan([[WEED, 5], [HOP, 3], [WOOD, 50], [BAR, 1]]);
    expect(result.build.map((line) => line.family)).toEqual(['barrel']);
    expect(result.build[0]).toMatchObject({ machines: 0, slots: 0, days: Infinity, waiting: [{ itemId: HOP, count: 3, gain: 50 }],
      options: [{ machine: BARREL, upgrade: false, slots: 1, afford: 1 }] });
    // A machine not learned yet is not suggested; one the farm already has but cannot craft names its skill.
    expect(plan([[HOP, 3]], { unlocked: new Set() }).build).toEqual([]);
    const locked = plan([[BEAN, 30]], { unlocked: new Set(), crafts: crafts.map((craft) => craft.machine === JAR ? { ...craft, flag: 9, skill: '木工' } : craft) });
    expect(locked.build[0]).toMatchObject({ family: 'jar', options: [], locked: { skill: '木工' } });
    // With the first level learned but not the upgrade, only new jars are offered.
    expect(plan([[BEAN, 30], [WOOD, 10]], { unlocked: new Set() }).build[0].options).toEqual([{ machine: JAR, upgrade: false, slots: 1, inputs: [{ itemId: WOOD, count: 10, held: 10 }], afford: 1, limit: WOOD }]);
  });
});
