import { describe, expect, it } from 'vitest';
import type { MachineDay, ProcessingPlan, ProduceLine, ProduceOption } from '../../domain/dailyProcessing';
import { produceRows } from './ProcessingSection';

const brew = (itemId: number, value: number): ProduceOption => ({ process: itemId, output: itemId + 1000, family: 'brew', machine: 1, minutes: 2820, inputs: 1, outputs: 1, value });
const line = (itemId: number, held: number, harvest: number, planned = 0): ProduceLine =>
  ({ itemId, held, harvest, grades: [{ rank: 0, count: held, harvest, today: 0 }], rawPrice: 10, options: [brew(itemId, 50)], best: itemId, planned, today: 0 });
const plan = (produce: ProduceLine[], loaded: ProduceLine[]): ProcessingPlan => {
  const machine: MachineDay = { family: 'brew', machine: 1, machines: 1, slots: loaded.length, free: loaded.length, ready: 0, later: [],
    fill: loaded.map((entry) => ({ itemId: entry.itemId, rank: 0, option: entry.options[0], batches: 1, count: 1, gain: 40 })) };
  return { produce, machines: [machine], build: [] };
};

describe('produceRows', () => {
  it('puts today’s harvest that gets no slot right after the loaded rows, ahead of bigger stock', () => {
    const loaded = line(1, 50, 0, 40);
    const stock = [2, 3, 4, 5, 6, 7, 8].map((itemId) => line(itemId, 1000 - itemId, 0));
    const potato = line(9, 199, 199), onion = line(10, 155, 150);
    const { listed, shown } = produceRows(plan([...stock, potato, onion, loaded], [loaded]));
    expect(listed.map((row) => row.line.itemId)).toEqual([1, 9, 10, 2, 3, 4, 5, 6, 7, 8]);
    expect(shown).toBe(6);
  });

  it('keeps every harvest row in view, however many there are', () => {
    const harvest = Array.from({ length: 9 }, (_, index) => line(index + 1, 100 - index, 100 - index));
    const { listed, shown } = produceRows(plan([...harvest, line(20, 5000, 0)], []));
    expect(listed.at(-1)?.line.itemId).toBe(20);
    expect(shown).toBe(9);
  });
});
