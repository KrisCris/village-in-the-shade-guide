import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel } from './saveModel';
import { flagEnabled, PROGRESSION, readEncyclopedia, readSkills } from './saveProgress';
import { SerTag } from './ser';

let model: ReturnType<typeof parseSaveModel>;
beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
describe.skipIf(!hasPrivateSaveFixtures)('collection and unlock edits', () => {
  it('adds and removes encyclopedia map pairs with exact counts and preserves other entries', () => {
    const before = readEncyclopedia(model.doc);
    const removed = [...before][0];
    const added = '660086';
    expect(before.has(added)).toBe(false);
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, { encyclopedia: { [removed]: false, [added]: true } }), 'edited'));
    expect(readEncyclopedia(restored.doc)).toEqual(new Set([...before].filter(id => id !== removed).concat(added)));
    expect(restored.nodeCount).toBe(model.nodeCount);
    expect(restored.doc.resolve('encyclopediaReleaseMap_')!.ref).toBe(before.size);
  });
  it('extends the string table for a map larger than the original', () => {
    const ids = Array.from({ length: 3000 }, (_, index) => String(1000000 + index));
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, { encyclopedia: Object.fromEntries(ids.map(id => [id, true])) }), 'edited'));
    expect(restored.nodeCount).toBe(model.nodeCount + ids.length * 2);
    const map = restored.doc.resolve('encyclopediaReleaseMap_')!;
    const children = restored.doc.children(map);
    expect(children.at(-1)!.name).toBe(`${map.ref - 1}v`);
    expect(children.at(-2)!.name).toBe(`${map.ref - 1}k`);
    expect(readEncyclopedia(restored.doc).size).toBe(readEncyclopedia(model.doc).size + 3000);
  });
  it('adds a skill with its unlock flag, zero initial value and a self pointer', () => {
    const skill = PROGRESSION.skills.find(skill => !readSkills(model.doc).has(String(skill.id)))!;
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, { skills: { [skill.id]: true } }), 'edited'));
    expect(readSkills(restored.doc).has(String(skill.id))).toBe(true);
    expect(flagEnabled(restored.doc, skill.flag)).toBe(true);
    expect(restored.nodeCount).toBe(model.nodeCount + 5);
    const last = restored.doc.children(restored.doc.resolve('pPlayerStatus_/p/skills_')!).at(-1)!;
    expect(last.tag).toBe(SerTag.Pointer); expect(last.ref).toBe(last.offset);
  });
  it('sets one outfit bit without changing any other flag', () => {
    const node = model.doc.resolve('flags_/flags_')!;
    const flag = 86011;
    const restored = parseSaveModel(decodeSave(exportSave(model, [], {}, { flags: { [flag]: !flagEnabled(model.doc, flag) } }), 'edited'));
    const expected = model.doc.payload(node).slice(); expected[flag >> 3] ^= 1 << (flag & 7);
    expect(restored.doc.payload(restored.doc.resolve('flags_/flags_')!)).toEqual(expected);
    expect(restored.nodeCount).toBe(model.nodeCount);
  });
  it('joins every recipe to a game item and verifies known outfit flags', () => {
    const names = JSON.parse(readFileSync('public/save-editor-names.json', 'utf8'));
    for (const recipe of PROGRESSION.recipes) expect(names.names.items[recipe.itemId]).toBeTruthy();
    expect(PROGRESSION.flags.find(flag => flag.id === 86011)?.code).toBe('GAME_FLAG_RELEASE_CLOTHING_13');
    expect(PROGRESSION.skills.find(skill => skill.id === 301)?.flag).toBe(6204);
  });
});
