import { describe, expect, it } from 'vitest';
import type { DailyCraft } from '../data/dailyPayload';
import type { DailyMachine } from '../lib/saveDaily';
import { expectedHarvest, NOT_PROCESSED, planProcessing, type MachineSpecRow, type ProcessRow } from './dailyProcessing';

const JAR = 501, JAR_2 = 502, BARREL = 601, COMPOST = 701, BAR = 210020, WOOD = 230000;
const RICE = 100, BEAN = 101, WEED = 102, HOP = 103;
const DAY = 1440;
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
const jar = (key: string, remaining = 0): DailyMachine => ({ key, itemId: JAR, jobs: remaining ? [{ output: 900, count: 1, seconds: DAY * 60, remaining }] : [] });
const plan = (free: Array<[number, number]>, fields: Partial<Parameters<typeof planProcessing>[0]> = {}) => planProcessing({
  machines: [jar('a'), jar('b')], specs, processes, prices, crafts, unlocked: new Set([7, 8]), free: new Map(free), coming: new Map(), isProduce: () => true, horizon: 7, ...fields,
});

describe('processing plan', () => {
  it('counts the first harvest and regrowth picks within the horizon', () => {
    const crops = new Map([[1, { seasons: ['winter'], harvest: [[RICE, 1]] as Array<[number, number]>, regrow: { days: 3, items: [[RICE, 2]] as Array<[number, number]> } }]]);
    const rows = [{ crop: 1, cell: 1, days: 2, left: 20 }, { crop: 1, cell: 2, days: 6, left: 6 }, { crop: 1, cell: 3, days: 9, left: 20 }];
    // Cell 1: day 2 and a regrowth on day 5. Cell 2: day 6 only, its season ends first. Cell 3: after the horizon.
    expect(expectedHarvest(rows, crops, 7)).toEqual(new Map([[RICE, 4]]));
  });

  it('keeps produce on machines the farm owns while they have room', () => {
    const result = plan([[RICE, 10]]);
    expect(result.produce[0]).toMatchObject({ itemId: RICE, held: 10, rawPrice: 10, choice: 11 });
    expect(result.produce[0].options.map((option) => option.process)).toEqual([12, 11, 13]);
    expect(result.families).toEqual([expect.objectContaining({ family: 'jar', machines: 2, idle: 2, slots: 2, demand: 10 * DAY, days: 5, extraSlots: 0, build: [] })]);
  });

  it('builds a machine the farm lacks only when the recipe adds enough over selling raw', () => {
    const result = plan([[WEED, 5], [HOP, 3]]);
    expect(result.produce.find((line) => line.itemId === WEED)?.choice).toBe(NOT_PROCESSED);
    expect(result.produce.find((line) => line.itemId === HOP)?.choice).toBe(16);
    expect(result.families.find((family) => family.family === 'barrel')).toMatchObject({ machines: 0, slots: 0, days: Infinity, extraSlots: 1, build: [{ machine: BARREL, count: 1, upgrade: false }] });
    expect(result.materials).toEqual([[WOOD, 20], [BAR, 1]]);
  });

  it('upgrades the machines already standing before building new ones', () => {
    // 30 days of work for 2 slots in 7 days: 3 more slots.
    const result = plan([[BEAN, 30]]);
    const family = result.families.find((entry) => entry.family === 'jar')!;
    expect(family).toMatchObject({ days: 15, extraSlots: 3, build: [{ machine: JAR_2, count: 2, upgrade: true }] });
    // The upgrade recipe takes the old jar, which is not a material to gather.
    expect(result.materials).toEqual([[BAR, 4]]);
    const more = plan([[BEAN, 70]]).families.find((entry) => entry.family === 'jar')!;
    expect(more.build).toEqual([{ machine: JAR, count: 2, upgrade: false }, { machine: JAR_2, count: 4, upgrade: true }]);
  });

  it('falls back to first-level machines, or names the skill, when recipes are locked', () => {
    expect(plan([[BEAN, 30]], { unlocked: new Set() }).families[0]).toMatchObject({ build: [{ machine: JAR, count: 3, upgrade: false }] });
    const locked = plan([[BEAN, 30]], { unlocked: new Set(), crafts: crafts.map((craft) => craft.machine === JAR ? { ...craft, flag: 9, skill: '木工' } : craft) });
    expect(locked.families[0]).toMatchObject({ build: [], locked: { skill: '木工' } });
    expect(locked.materials).toEqual([]);
  });

  it('counts running jobs and follows the player’s pick', () => {
    const busy = plan([[RICE, 4]], { machines: [jar('a', 2 * DAY * 60), jar('b')] });
    expect(busy.families[0]).toMatchObject({ idle: 1, busy: 2 * DAY, days: 3 });
    const raw = plan([[RICE, 4]], { choices: { [RICE]: NOT_PROCESSED } });
    expect(raw.produce[0].choice).toBe(NOT_PROCESSED);
    expect(raw.families[0].demand).toBe(0);
    expect(plan([[RICE, 4]], { choices: { [RICE]: 12 } }).families.map((family) => family.family)).toEqual(['barrel', 'jar']);
  });
});
