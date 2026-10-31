import { describe, expect, it } from 'vitest';
import type { DailyBundleSpec } from '../data/dailyPayload';
import { dailyActions, leadSource } from './dailyActions';
import type { DailyDigest } from './dailyDigest';
import type { DeliveryDigest, DeliveryLine, DeliveryPlan } from './dailyDeliveries';
import type { MaterialLine } from './dailyMaterials';
import type { BuildLine, MachineDay, ProcessingPlan } from './dailyProcessing';
import type { ItemSource } from './dailySources';

const digest = (fields: Partial<DailyDigest> = {}): DailyDigest => ({
  date: { year: 1, season: 3, day: 2, hour: 7, minute: 0 }, daysLeft: 26, hoursToTurnover: 0, harvest: [], forecast: [],
  seasonEnd: { lost: [], witherTomorrow: [] }, scarecrows: [],
  chores: { water: [], withered: [], spentScarecrows: [], hungry: 0, shipping: 0 },
  machines: { done: [], running: [], idle: [], freeSlots: 0 }, ...fields,
});
const fish: ItemSource = { kind: 'fish', seasons: [3], now: true, today: true, night: false };
const dayFish: ItemSource = { ...fish, today: false }, cursed: ItemSource = { ...fish, night: true };
const wild: ItemSource = { kind: 'wild', season: 3, now: true };
const line = (itemId: number, remain: number, have: number, sources: ItemSource[] = []): DeliveryLine => ({ itemId, rank: 0, remain, have, sources });
const plan = (id: number, lines: DeliveryLine[], list: DailyBundleSpec['list'] = 'shrine'): DeliveryPlan => ({ spec: { id, list, name: `b${id}`, place: '', items: [], rewards: [] } as DailyBundleSpec, ready: false, lines });
const deliveries = (fields: Partial<DeliveryDigest> = {}): DeliveryDigest => ({ ready: [], pending: [], done: 0, total: 0, catalogOpen: true, keep: [], ...fields });
const day = (fields: Partial<MachineDay>): MachineDay => ({ family: 'jar', machine: 501, machines: 2, slots: 2, free: 1, ready: 0, later: [], fill: [], ...fields });
const buildLine = (fields: Partial<BuildLine>): BuildLine => ({
  family: 'barrel', machine: 601, machines: 6, slots: 6, stored: 0, days: 74, waiting: [], perSlot: 25, options: [{ machine: 601, upgrade: false, slots: 1, inputs: [], afford: 0 }], ...fields,
});
const processing = (fields: Partial<ProcessingPlan> = {}): ProcessingPlan => ({ produce: [], machines: [], build: [], ...fields });
const material = (itemId: number, short: number, sources: ItemSource[], parent?: number): MaterialLine => ({ itemId, need: short, held: 0, short, sources, ...(parent ? { for: parent } : {}) });
const run = (fields: Partial<Parameters<typeof dailyActions>[0]> = {}) => dailyActions({ digest: digest(), deliveries: deliveries(), processing: processing(), materials: [], planting: [], vacant: 0, animals: [], ...fields });

describe('daily actions', () => {
  it('groups the deliveries one trip finishes by fishing and foraging', () => {
    const actions = run({ deliveries: deliveries({ pending: [
      plan(1, [line(300, 1, 0, [fish])]),
      plan(2, [line(300, 2, 0, [fish]), line(301, 1, 0, [fish])]),
      plan(3, [line(310, 5, 3, [wild])]),
      // Needs a fish and a wild plant: two trips, so it is left to the delivery section.
      plan(4, [line(300, 1, 0, [fish]), line(310, 1, 0, [wild])]),
      plan(5, [line(300, 1, 0, [fish]), line(400, 1, 0, [{ kind: 'plant', crop: 1, seasons: [0], now: false }])]),
    ] }) });
    expect(actions.map((action) => action.kind === 'fetch' ? [action.trip, action.items, action.plans.map((entry) => entry.spec.id)] : action.kind)).toEqual([
      ['fish', [[300, 3], [301, 1]], [1, 2]],
      ['wild', [[310, 2]], [3]],
    ]);
  });

  it('puts machine work, building and gathering before sowing, animals and routine care', () => {
    const option = { process: 11, output: 900, family: 'jar', machine: 501, minutes: 1440, inputs: 1, outputs: 1, value: 40 };
    const jar = day({ fill: [{ itemId: 100, option, batches: 1, count: 1, gain: 30 }] }), mill = day({ family: 'mill', machine: 701 });
    // A machine the farm owns but cannot craft yet is not a job for today.
    const barrel = buildLine({}), locked = buildLine({ family: 'kiln', machine: 801, options: [], locked: { skill: null } });
    const quarry: ItemSource = { kind: 'quarry', from: 71, to: 79, perHundred: 26.5, reached: true };
    const sapSweet: ItemSource = { kind: 'sap', tree: 1000, trees: [1], collectors: 0 }, sapSour: ItemSource = { kind: 'sap', tree: 1003, trees: [2], collectors: 1 };
    const actions = run({
      digest: digest({ harvest: [{ crop: 1, kind: 'ripe', cells: [9] }], chores: { water: [9, 10], withered: [], spentScarecrows: [], hungry: 2, shipping: 0 }, machines: { done: [{ itemId: 7, count: 2, slots: 1 }], running: [], idle: [], freeSlots: 0 } }),
      deliveries: deliveries({ ready: [plan(8, [line(1, 1, 1)])] }),
      processing: processing({ machines: [jar, mill], build: [barrel, locked], produce: [{ itemId: 100, held: 5, harvest: 4, rawPrice: 10, best: option.process, planned: 30, today: 2, options: [option] }] }),
      materials: [material(210020, 22, [{ kind: 'machine', machine: 9, inputs: [], count: 1, minutes: 710 }]), material(240020, 108, [quarry], 210020), material(140300, 33, [sapSweet]), material(140370, 28, [sapSour])],
      vacant: 10, planting: [{ needed: 0 } as never],
      animals: [{ species: 5, house: 1, items: [130080], bundles: [59], room: 4, housed: true }, { species: 3, house: 0, items: [130100], bundles: [60], room: 0, housed: true }],
    });
    expect(actions.map((action) => action.kind)).toEqual(['deliver', 'machines', 'build', 'gather', 'gather', 'plant', 'animal', 'routine']);
    const [, machines, build, ore, sap] = actions;
    // Two go in but one is in storage: the other is picked first.
    expect(machines).toEqual({ kind: 'machines', outputs: 2, fill: [jar], harvest: [100] });
    expect(build).toMatchObject({ lines: [barrel], short: [{ itemId: 210020 }, { itemId: 140300 }, { itemId: 140370 }] });
    // The bars wait on their ore, so the ore is the trip; both saps come from one round of extractors.
    expect(ore).toMatchObject({ lines: [{ material: { itemId: 240020 }, source: quarry }] });
    expect(sap).toMatchObject({ lines: [{ source: sapSweet }, { source: sapSour }] });
    expect(actions.at(-1)).toEqual({ kind: 'routine', harvest: [9], water: [9, 10], hungry: 2 });
  });

  it('lists the encyclopedia entries within reach before routine care, leaving delivery shortfalls to their trips', () => {
    const ore: ItemSource = { kind: 'quarry', from: 1, to: 9, perHundred: 4, reached: true };
    const collect = {
      periods: [0, 1, 2, 3],
      spots: [
        { id: 'a', name: 'a', catches: [{ itemId: 300, missing: true, short: 0, odds: [.1, 0, 0, 0] }, { itemId: 301, missing: false, short: 2, odds: [.2, 0, 0, 0] }] },
        { id: 'b', name: 'b', catches: [{ itemId: 300, missing: true, short: 0, odds: [.3, 0, 0, 0] }] },
      ],
      lines: [{ itemId: 240020, missing: true, short: 0, source: ore }, { itemId: 240010, missing: false, short: 5, source: ore }],
    };
    const actions = run({ collect, digest: digest({ chores: { water: [1], withered: [], spentScarecrows: [], hungry: 0, shipping: 0 } }) });
    expect(actions.map((action) => action.kind)).toEqual(['collect', 'routine']);
    expect(actions[0]).toEqual({ kind: 'collect', fish: [300], lines: [collect.lines[0]] });
    // Nothing missing from the encyclopedia: no task.
    expect(run({ collect: { ...collect, spots: [], lines: [collect.lines[1]] } })).toEqual([]);
  });

  it('leaves the catalog and day fishing for after the 07:00 turnover in a midnight save', () => {
    const actions = run({
      digest: digest({ date: { year: 1, season: 3, day: 2, hour: 1, minute: 0 }, hoursToTurnover: 6, chores: { water: [4], withered: [], spentScarecrows: [], hungry: 0, shipping: 0 } }),
      deliveries: deliveries({
        ready: [plan(40, [line(1, 1, 1)], 'catalog'), plan(30, [line(1, 1, 1)], 'repair')],
        pending: [plan(1, [line(300, 1, 0, [dayFish])]), plan(2, [line(162000, 1, 0, [cursed])]), plan(3, [line(310, 1, 0, [wild])])],
      }),
    });
    expect(actions.map((action) => action.kind === 'fetch' ? `fetch:${action.trip}:${action.plans.map((entry) => entry.spec.id)}${action.later ? ':later' : ''}`
      : action.kind === 'deliver' ? `deliver:${action.plans.map((entry) => entry.spec.id)}${action.later ? ':later' : ''}` : action.kind)).toEqual([
      'deliver:30', 'fetch:fish:2', 'fetch:wild:3', 'routine', 'deliver:40:later', 'fetch:fish:1:later',
    ]);
    // On the last night of the season the day fish never come back, so no trip is offered for them.
    const last = run({ digest: digest({ hoursToTurnover: 6, daysLeft: 0 }), deliveries: deliveries({ pending: [plan(1, [line(300, 1, 0, [dayFish])])] }) });
    expect(last).toEqual([]);
  });

  it('warns first about crops that wither tomorrow', () => {
    const actions = run({ digest: digest({
      seasonEnd: { lost: [], witherTomorrow: [{ crop: 1, cause: 'season', cells: [1] }] },
      harvest: [{ crop: 1, kind: 'ripe', cells: [1] }, { crop: 2, kind: 'ripe', cells: [2] }],
    }) });
    expect(actions[0].kind).toBe('wither');
    // The withering cell is harvested under the warning, not counted again in routine care.
    expect(actions.at(-1)).toMatchObject({ kind: 'routine', harvest: [2] });
  });

  it('leads with the trip that can happen today', () => {
    expect(leadSource([{ kind: 'plant', crop: 1, seasons: [0], now: false }, { kind: 'fish', seasons: [0], now: false, today: false, night: false }])).toBeUndefined();
    expect(leadSource([{ kind: 'machine', machine: 9, inputs: [], count: 1, minutes: 1 }, { kind: 'quarry', from: 1, to: 9, perHundred: 1, reached: true }])?.kind).toBe('quarry');
  });
});
