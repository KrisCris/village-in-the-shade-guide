import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges } from './saveModel';
import { heartFill, SAVE_RULES } from './saveRules';
import { APPEARANCE, hexToHsv, hsvToHex } from './saveAppearance';
import { readSigned } from './ser';
import { achievementWarnings } from './saveValidation';

let model: ReturnType<typeof parseSaveModel>;
beforeAll(() => { model = parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004')); });
const pathDrafts = (entries: Record<string, string>) => Object.fromEntries(Object.entries(entries).map(([path, value]) => [model.doc.resolve(path)!.offset, value]));

describe.skipIf(!hasPrivateSaveFixtures)('verified save editor rules', () => {
  it('uses non-linear NPC heart thresholds', () => {
    expect(heartFill(390, SAVE_RULES.npcHearts)).toEqual([1, 1, .3, 0, 0, 0]);
    expect(heartFill(2100, SAVE_RULES.npcHearts)).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it('round trips colour space including hue wrap, black and grey', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#8136ac', '#000000', '#808080']) expect(hsvToHex(...hexToHsv(hex))).toBe(hex);
    expect(hsvToHex(1, 1, 1)).toBe('#ff0000');
  });
  it('joins every appearance variant to a real item and preserves the white T-shirt index', () => {
    const names = JSON.parse(readFileSync('public/save-editor-names.json', 'utf8'));
    for (const rows of Object.values(APPEARANCE)) for (const row of rows) for (const variant of row.variants) expect(names.names.items[variant.itemId]).toBeTruthy();
    expect(APPEARANCE.playercrothing[0].variants.find(variant => variant.color === 8)?.itemId).toBe(500008);
    expect(APPEARANCE.playerbackaccessory).toHaveLength(1);
  });
  it('exports a longer box name without altering its contents', () => {
    const box = model.containers.find(container => container.kind === 'storage')!;
    const edited = exportSave(model, pendingChanges(model, { [box.nameOffset!]: '春天的种子与材料箱' }));
    const restored = parseSaveModel(decodeSave(edited, 'edited'));
    const found = restored.containers.find(container => container.id === box.id)!;
    expect(found.customName).toBe('春天的种子与材料箱');
    expect(found.slots.map(slot => slot.item && [slot.item.itemId, slot.item.count])).toEqual(box.slots.map(slot => slot.item && [slot.item.itemId, slot.item.count]));
  });
  it('validates current HP against the pending maximum and rejects partial hearts', () => {
    const changes = pendingChanges(model, pathDrafts({ 'pPlayerStatus_/p/hp_/max_': '28', 'pPlayerStatus_/p/hp_/this->value_': '28' }));
    const restored = parseSaveModel(decodeSave(exportSave(model, changes), 'edited'));
    expect(readSigned(restored.doc, restored.doc.resolve('pPlayerStatus_/p/hp_/this->value_')!)).toBe(28n);
    expect(() => exportSave(model, pendingChanges(model, pathDrafts({ 'pPlayerStatus_/p/hp_/max_': '25' })))).toThrow('完整');
    expect(() => exportSave(model, pendingChanges(model, pathDrafts({ 'pPlayerStatus_/p/hp_/max_': '12', 'pPlayerStatus_/p/hp_/this->value_': '24' })))).toThrow('不能超过');
  });
  it('rejects unsupported colour indices, malformed stack sizes, and currency above the game limit', () => {
    expect(() => exportSave(model, pendingChanges(model, pathDrafts({ 'pPlayerStatus_/p/crothingColor_': '10' })))).toThrow('配色');
    expect(() => exportSave(model, pendingChanges(model, pathDrafts({ 'money_/this->value_': '100000000' })))).toThrow('之间');
    const empty = model.containers.find(container => container.kind === 'backpack')!.slots[19];
    expect(() => exportSave(model, [], { [empty.pointer]: { itemId: '230000', count: '1000', rank: '0', quality: '0' } })).toThrow('物品数量');
  });
  it('reports currency increases as an achievement risk without inventing a trigger threshold', () => {
    expect(achievementWarnings(model, pendingChanges(model, pathDrafts({ 'money_/this->value_': '60084' })), {})).toHaveLength(1);
    expect(achievementWarnings(model, pendingChanges(model, pathDrafts({ 'money_/this->value_': '60082' })), {})).toEqual([]);
  });
});
