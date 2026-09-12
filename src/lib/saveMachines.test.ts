import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel } from './saveModel';
import { MACHINES, machineJobs, machineSpec } from './saveMachines';
import { readSigned } from './ser';
let model: ReturnType<typeof parseSaveModel>;
beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
describe.skipIf(!hasPrivateSaveFixtures)('native processing machine jobs', () => {
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
