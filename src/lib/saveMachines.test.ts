import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel } from './saveModel';
import { MACHINES, machineJobs, machineSpec, specialSpec, deviceIdentity, deviceEnabled, displayedItem, gameDuration } from './saveMachines';
import { readSigned } from './ser';
let model: ReturnType<typeof parseSaveModel>;
describe.skipIf(!hasPrivateSaveFixtures)('native processing machine jobs', () => {
  beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
  it('separates each actual machine from placement, crafting, quest and shared containers', () => {
    const devices = model.containers.filter(c => machineSpec(c) && deviceEnabled(model.doc, c));
    expect(devices).toHaveLength(163);
    expect(new Set(devices.map(c => deviceIdentity(model.doc, c))).size).toBe(devices.length);
    const special = model.containers.filter(c => specialSpec(c));
    expect(special).toHaveLength(16);
    expect(special.every(c => !machineSpec(c))).toBe(true);
    const altar = model.containers.find(c => c.id === 'gimmick-589')!;
    expect(specialSpec(altar)).toMatchObject({ kind: 'display', itemId: 454000 });
    expect(displayedItem(model.doc, altar)).toBe(0);
    expect(machineJobs(model.doc, altar)).toEqual([]);
    const unknown = { ...altar, dataId: -123 };
    expect(machineSpec(unknown)).toBeUndefined(); expect(specialSpec(unknown)).toBeUndefined();
  });
  it('reads extractor output from the item template and preserves it on completion', () => {
    const container = model.containers.find(c => machineSpec(c)?.mode === 'extractor' && machineJobs(model.doc, c)[0]?.remaining > 0)!;
    const job = machineJobs(model.doc, container)[0];
    expect(job).toMatchObject({ output: Number(container.slots[0].item!.itemId), count: 1, inputs: [] });
    const key = `${container.id}/0`;
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, { [key]: { finish: true } }), 'edited'));
    const next = restored.containers.find(c => c.id === container.id)!;
    expect(machineJobs(restored.doc, next)[0]).toMatchObject({ ...job, remaining: 0 });
    expect(next.slots.map(slot => slot.item && [slot.item.itemId, slot.item.count])).toEqual(container.slots.map(slot => slot.item && [slot.item.itemId, slot.item.count]));
    const recipe = MACHINES.processes.find(r => r.machines.includes(container.dataId!))!;
    expect(() => exportSave(model, [], {}, {}, { [key]: { recipeId: recipe.id, finish: false } })).toThrow('自动采集');
  });
  it('does not invent timed jobs for livestock collectors', () => {
    const collectors = model.containers.filter(c => machineSpec(c)?.mode === 'collector');
    expect(collectors).toHaveLength(2);
    for (const container of collectors) {
      expect(machineJobs(model.doc, container)).toEqual([]);
      expect(() => exportSave(model, [], {}, {}, { [`${container.id}/0`]: { finish: true } })).toThrow('栏位');
    }
  });
  it('finishes an existing job without emptying it or changing its ingredients', () => {
    const container = model.containers.find(container => machineJobs(model.doc, container).some(job => job.remaining > 0))!;
    const job = machineJobs(model.doc, container).find(job => job.remaining > 0)!;
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, { [`${container.id}/${job.index}`]: { finish: true } }), 'edited'));
    const next = restored.containers.find(c => c.id === container.id)!;
    expect(machineJobs(restored.doc, next)[job.index]).toMatchObject({ seconds: job.seconds, remaining: 0, inputs: job.inputs, output: job.output, count: job.count });
    expect(next.used).toBe(container.used);
  });
  it('exposes three jobs for 24 internal entries and creates a valid recipe with a fresh unique ID', () => {
    const container = model.containers.find(c => machineSpec(c)?.capacity === 3 && machineJobs(model.doc, c).some(job => !job.seconds))!;
    expect(container.slots.length).toBe(24);
    const jobs = machineJobs(model.doc, container);
    expect(jobs).toHaveLength(3);
    const job = jobs.find(job => !job.seconds)!;
    const recipe = MACHINES.processes.find(recipe => recipe.machines.includes(container.dataId!))!;
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, {}, { [`${container.id}/${job.index}`]: { recipeId: recipe.id, finish: false } }), 'edited'));
    const next = restored.containers.find(c => c.id === container.id)!;
    expect(machineJobs(restored.doc, next)[job.index]).toMatchObject({ seconds: recipe.minutes * 60, remaining: recipe.minutes * 60, inputs: recipe.inputs, output: recipe.output, count: recipe.count });
    const seedPath = 'statusUniqueIDGenerator_/idSeed_';
    expect(readSigned(restored.doc, restored.doc.resolve(seedPath)!)).toBe(readSigned(model.doc, model.doc.resolve(seedPath)!) + BigInt(recipe.inputs.length));
    expect(() => exportSave(model, [], {}, {}, { [`${container.id}/3`]: { finish: true } })).toThrow('栏位');
    expect(() => exportSave(model, [], {}, {}, { [`${container.id}/${job.index}`]: { recipeId: -1, finish: false } })).toThrow('配方');
  });
  it('uses species and feature 11 for five animal hearts, including the dog', () => {
    const animals = model.sections.find(section => section.id === 'barn')!.tables[0];
    const maxes = animals.rows.map(row => row.cells.find(field => field?.control === 'animal-friendship')?.max);
    expect(maxes).toContain('1500'); expect(maxes).toContain('2000');
    expect(maxes[0]).toBe('2000');
  });
});

it('formats game time without implying a live wall-clock countdown', () => {
  expect(gameDuration(259200)).toBe('3天');
  expect(gameDuration(63480)).toBe('17小时 38分钟');
  expect(gameDuration(1)).toBe('1分钟');
  expect(gameDuration(0)).toBe('0分钟');
});
