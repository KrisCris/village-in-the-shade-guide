import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';
import { readSigned } from './ser';
import { questRecord, questStateForChecklist, questStatus, questStatuses } from './saveQuests';
import data from '../../data/sources/game-save-quests.json';
describe.skipIf(!hasPrivateSaveFixtures)('quest checklist records', () => {
  let model: ReturnType<typeof parseSaveModel>;
  beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
  it('edits a verified checkpoint and state without touching story flags', () => {
    const pointers = model.doc.children(model.doc.resolve('questMap_')!).filter((_, index) => index % 2 === 1);
    const pointer = pointers.find(pointer => Number(readSigned(model.doc, model.doc.resolve('p/dataID_', pointer)!)) === 3)!;
    const check = model.doc.resolve('p/checkLevel_', pointer)!, state = model.doc.resolve('p/state_', pointer)!;
    const quest = data.quests.find(quest => quest.id === 3)!;
    const level = Math.max(...quest.steps.map(step => step.level)) + 1;
    const restored = parseSaveModel(decodeSave(exportSave(model, pendingChanges(model, { [check.offset]: String(level), [state.offset]: '3' })), 'edited'));
    expect(readSigned(restored.doc, restored.doc.node(check.offset))).toBe(BigInt(level));
    const flags = 'flags_/flags_';
    expect(restored.doc.payload(restored.doc.resolve(flags)!)).toEqual(model.doc.payload(model.doc.resolve(flags)!));
    expect(() => exportSave(model, pendingChanges(model, { [state.offset]: '4' }))).toThrow('任务');
    expect(() => exportSave(model, pendingChanges(model, { [check.offset]: '999' }))).toThrow('进度');
  });
});

describe('quest status', () => {
  const steps = [{ level: 0 }, { level: 2 }];
  it('completes the village goal once every village rule is complete', () => {
    const goal = { code: 'QUEST_ID_CHAIN_GRAND_GOAL', state: 1, check: 0, steps: [] };
    const rules = [1, 2].map(n => ({ code: `QUEST_ID_CHAIN_VILLAGE_RULES_0${n}`, state: 2, check: 3, steps }));
    expect(questStatuses([goal, ...rules]).get(goal)).toBe('complete');
    const unfinished = { ...rules[1], check: 2 };
    expect(questStatuses([goal, rules[0], unfinished]).get(goal)).toBe('pending');
    expect(questStatuses([goal]).get(goal)).toBe('pending');
    const hidden = { ...goal, state: 0 };
    expect(questStatuses([hidden, ...rules]).get(hidden)).toBe('hidden');
  });
  it('treats a fully checked list as complete even when the record stays shown', () => {
    expect(questStatus(2, 3, steps)).toBe('complete');
    expect(questStatus(1, 3, steps)).toBe('complete');
    expect(questStatus(2, 2, steps)).toBe('pending');
    expect(questStatus(2, -1, steps)).toBe('pending');
  });
  it('keeps hidden and checklist-free records as saved', () => {
    expect(questStatus(0, 3, steps)).toBe('hidden');
    expect(questStatus(3, -1, [])).toBe('complete');
    expect(questStatus(2, 0, [])).toBe('pending');
  });
});

describe('quest record states', () => {
  it('writes the states game saves use', () => {
    // Shown quests are 2 in every game save; editing the checklist keeps that state.
    expect(questStateForChecklist('QUEST_ID_SUB_001', 0, 1, 1)).toBe(3);
    expect(questStateForChecklist('QUEST_ID_SUB_001', 0, 0, 1)).toBe(2);
    expect(questStateForChecklist('QUEST_ID_CHAIN_VILLAGE_RULES_05', 2, 2, 4)).toBe(2);
    expect(questStateForChecklist('QUEST_ID_CHAIN_VILLAGE_RULES_05', 0, 2, 4)).toBe(2);
    // Village rules and villager requests stay open after the last step; other quests close.
    expect(questStateForChecklist('QUEST_ID_CHAIN_VILLAGE_RULES_05', 2, 4, 4)).toBe(2);
    expect(questStateForChecklist('QUEST_ID_HUNTER_01', 2, 4, 4)).toBe(2);
    expect(questStateForChecklist('QUEST_ID_CHAIN_SHRINE_REPAIR_REQUEST', 2, 5, 5)).toBe(3);
    expect(questStateForChecklist('QUEST_ID_CHAPTER_02_03', 3, 1, 2)).toBe(2);
    expect(questRecord('QUEST_ID_HUNTER_01', 3, 2, 'done', 4)).toEqual({ state: 2, check: 4 });
    expect(questRecord('QUEST_ID_SUB_001', 1, 2, 'done', 1)).toEqual({ state: 3, check: 1 });
    expect(questRecord('QUEST_ID_CHAPTER_01_01', 0, 2, 'done', 0)).toEqual({ state: 3, check: undefined });
    expect(questRecord('QUEST_ID_CHAPTER_01_01', 0, 0, 'shown', 0)).toEqual({ state: 2 });
    expect(questRecord('QUEST_ID_CHAPTER_01_01', 0, 2, 'hidden', 0)).toEqual({ state: 0 });
  });
  it('matches how every game save stores finished checklists', () => {
    for (const name of ['save.001', 'save.004']) {
      if (!hasPrivateSaveFixtures) return;
      const doc = parseSaveModel(decodeSave(new Uint8Array(readFileSync(`tests/gamesave/${name}`)), name)).doc;
      for (const pointer of doc.children(doc.resolve('questMap_')!).filter((_, index) => index % 2 === 1)) {
        const info = data.quests.find(quest => quest.id === Number(readSigned(doc, doc.resolve('p/dataID_', pointer)!)))!;
        const state = Number(readSigned(doc, doc.resolve('p/state_', pointer)!)), check = Number(readSigned(doc, doc.resolve('p/checkLevel_', pointer)!));
        const max = Math.max(0, ...info.steps.map(step => step.level + 1));
        if (state && info.steps.length && check >= max) expect(questStateForChecklist(info.code, state, check, max), info.code).toBe(state);
      }
    }
  });
});

