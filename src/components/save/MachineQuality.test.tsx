import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { beforeAll, describe, expect, it } from 'vitest';
import { hasPrivateSaveFixtures } from '../../../tests/support/privateSaveFixtures';
import { decodeSave } from '../../lib/saveEditor';
import { parseSaveModel } from '../../lib/saveModel';
import { deviceEnabled, machineJobs, machineSpec } from '../../lib/saveMachines';
import type { SaveNameTables } from '../../lib/saveNames';
import DeviceBrowser from './DeviceBrowser';
import MachinePanel from './MachinePanel';

let model: ReturnType<typeof parseSaveModel>;
let names: SaveNameTables;
describe.skipIf(!hasPrivateSaveFixtures)('machine quality visible before and after opening a device', () => {
  beforeAll(() => {
    model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004'));
    names = JSON.parse(readFileSync('public/save-editor-names.json', 'utf8'));
  });
  it.each([0, 1, 2, 3, 4])('keeps grid, product and ingredients in sync at rank %i', rank => {
    const container = model.containers.find(c => deviceEnabled(model.doc, c) && machineSpec(c)?.mode === 'processing' && machineJobs(model.doc, c).some(j => j.seconds > 0))!;
    const job = machineJobs(model.doc, container).find(j => j.seconds > 0)!;
    const edits = { [`${container.id}/${job.index}`]: { rank, finish: true } };
    const grid = load(renderToStaticMarkup(<DeviceBrowser model={model} names={names} edits={edits}>{() => null}</DeviceBrowser>));
    const ring = grid(`[data-device-id="${container.id}"] .save-product-ring`).eq(job.index);
    expect(ring.hasClass('is-ready')).toBe(true);
    expect(ring.find('.save-rank-badge').length).toBe(rank ? 1 : 0);
    if (rank) expect(ring.find('.save-rank-badge image').attr('href')).toContain(`rank-${rank}.webp`);
    const detail = load(renderToStaticMarkup(<MachinePanel model={model} container={container} names={names} edits={edits} drafts={{}} onChange={() => {}} onDraft={() => {}} />));
    const article = detail('.save-machine-job').eq(job.index);
    expect(article.find('.save-machine-output .save-rank-badge').length).toBe(rank ? 1 : 0);
    expect(article.find('.save-machine-inputs .save-rank-badge').length).toBe(rank ? job.inputs.length : 0);
    article.find('.save-rank-badge').each((_, image) => expect(detail(image).find('image').attr('href')).toContain(`rank-${rank}.webp`));
    expect(article.find('.save-rank-picker button[aria-pressed="true"]').length).toBe(1);
  });
});
