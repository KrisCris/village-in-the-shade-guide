import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeSave } from './saveEditor';
import { readSigned, readString, SerDocument } from './ser';
import {
  collectFields,
  describeGameTime,
  exportSave,
  parseSaveModel,
  pendingChanges,
  type SaveField,
  type SaveModel,
  type SaveSectionId,
} from './saveModel';

function load(name: string): SaveModel {
  return parseSaveModel(decodeSave(new Uint8Array(readFileSync(`tests/gamesave/${name}`)), name));
}

function section(model: SaveModel, id: SaveSectionId) {
  return model.sections.find((entry) => entry.id === id)!;
}

function field(model: SaveModel, label: string): SaveField {
  for (const entry of section(model, 'basic').groups.concat(section(model, 'player').groups)) {
    const found = entry.fields.find((candidate) => candidate.label === label);
    if (found) return found;
  }
  throw new Error(`no field ${label}`);
}

describe.skipIf(!hasPrivateSaveFixtures)('save model', () => {
  it('reads the values the game shows for save.004', () => {
    const model = load('save.004');
    expect(field(model, '玩家名字').value).toBe('losty');
    expect(field(model, '狗狗名字').value).toBe('maple');
    expect(field(model, '持有金钱').value).toBe('60083');
    expect(field(model, '供奉金钱').value).toBe('0');
    expect(field(model, '游戏内累计秒数').value).toBe('7344000');
    expect(field(model, '生命（上限）').value).toBe('24');
    expect(field(model, '体力（上限）').value).toBe('760');
    // The game's own load screen shows 062:20:05 for this slot.
    expect(
      ['天', '小时', '分', '秒'].map((unit) => field(model, `游玩时长 · ${unit}`).value).join(':'),
    ).toBe('0:62:20:5');
  });

  it('derives the in-game calendar the title screen agrees with', () => {
    // save.004 loads as 第1年 冬 2日, AM 07:00.
    expect(describeGameTime(7344000n)).toBe('第 1 年 冬 2 日 07:00');
    expect(describeGameTime(0n)).toBe('第 1 年 春 1 日 07:00');
  });

  it('lists inventory, livestock, npc and brand rows from the real tree', () => {
    const model = load('save.004');
    const backpack = model.containers.find((entry) => entry.id === 'inventoryItemList_')!;
    expect(backpack.slots).toHaveLength(30);
    expect(backpack.used).toBe(19);
    expect(backpack.slots[0].item!.itemId).toBe('60020');
    expect(backpack.slots[0].item!.count).toBe('9');
    expect(backpack.slots[19].item).toBeNull();

    const tools = model.containers.find((entry) => entry.id === 'toolItemList_')!;
    expect(tools.slots[5].item!.itemId).toBe('660070');

    const barn = section(model, 'barn').tables[0];
    expect(barn.rows).toHaveLength(10);
    expect(barn.rows.map((row) => row.cells[0]!.value)).toEqual([
      'maple', 'CHUU', 'MACHA', 'PEACH', 'MOCHA', 'shiro', 'chief', 'Wooly', 'KURO', '牛鬼',
    ]);
    expect(barn.rows[1].cells[2]!.value).toBe('764');

    const npc = section(model, 'npc').tables[0];
    expect(npc.rows).toHaveLength(16);
    expect(npc.rows[0].cells[0]!.value).toBe('1010');
    expect(npc.rows[0].cells[1]!.value).toBe('390');

    const brands = section(model, 'brand').tables.find((table) => table.id === 'brandCropsNameMap_')!;
    expect(brands.rows.map((row) => row.cells[1]!.value)).toEqual(['金克拉小麦', '上帝压狗']);
  });

  it('produces stable shapes across all five slot saves', () => {
    for (const name of ['save.001', 'save.002', 'save.003', 'save.004', 'save.005']) {
      const model = load(name);
      const ids = model.sections.map((entry) => entry.id).join(',');
      expect(`${name}:${ids}`).toBe(`${name}:basic,player,items,barn,npc,brand`);
      expect(`${name}:${section(model, 'barn').tables[0].rows.length}`).toBe(`${name}:10`);
      expect(`${name}:${section(model, 'npc').tables[0].rows.length}`).toBe(`${name}:16`);
      expect(`${name}:${collectFields(model).size > 100}`).toBe(`${name}:true`);
    }
  }, 60_000);

  it('exports an edited save that reads back with the new values', () => {
    const model = load('save.003');
    const barn = section(model, 'barn').tables[0];
    const drafts = {
      [field(model, '玩家名字').offset]: '新的玩家名字',
      [field(model, '持有金钱').offset]: '12345',
      [barn.rows[1].cells[0]!.offset]: 'Q',
      [barn.rows[1].cells[2]!.offset]: '800',
    };
    const changes = pendingChanges(model, drafts);
    expect(changes).toHaveLength(4);

    const packed = exportSave(model, changes);
    expect(packed.length).toBe(model.save.original.length);

    const reread = parseSaveModel(decodeSave(packed, 'edited'));
    expect(field(reread, '玩家名字').value).toBe('新的玩家名字');
    expect(field(reread, '持有金钱').value).toBe('12345');
    const rebuiltBarn = section(reread, 'barn').tables[0];
    expect(rebuiltBarn.rows[1].cells[0]!.value).toBe('Q');
    expect(rebuiltBarn.rows[1].cells[2]!.value).toBe('800');
    // Untouched data downstream of the shifted region survived.
    expect(rebuiltBarn.rows[9].cells[0]!.value).toBe('牛鬼');
    expect(reread.nodeCount).toBe(model.nodeCount);
    const doc = new SerDocument(decodeSave(packed, 'edited').data);
    expect(readString(doc, doc.resolve('brandCropsNameMap_/#3')!)).toBe('上帝压狗');

    // The uploaded bytes are untouched.
    expect(Buffer.from(model.save.original).equals(readFileSync('tests/gamesave/save.003'))).toBe(true);
  }, 60_000);

  it('refuses out-of-range and malformed values', () => {
    const model = load('save.003');
    const money = field(model, '持有金钱');
    expect(() => exportSave(model, [{ field: money, before: money.value, after: '-1' }])).toThrow(/持有金钱/);
    expect(() => exportSave(model, [{ field: money, before: money.value, after: 'abc' }])).toThrow(/整数/);
  }, 30_000);
});

describe.skipIf(!hasPrivateSaveFixtures)('item containers', () => {
  it('finds the in-world storage boxes the game shows', () => {
    const model = load('save.004');
    const boxes = model.containers.filter((container) => container.kind === 'storage');
    // Twelve 収納箱 stand in the world; six of them have been renamed.
    expect(boxes).toHaveLength(13);
    const named = boxes.filter((box) => box.customName).map((box) => box.customName);
    expect(named).toEqual(['材料', '采集物', '猎物', '作物畜产花', '矿石', '咒物&深夜', '诅咒作物', '料理']);

    const materials = boxes.find((box) => box.customName === '材料')!;
    expect(materials.slots).toHaveLength(30);
    expect(materials.used).toBe(18);
    // Matches the box on screen: 木材 203, 好加工的木材 72, 坚硬的木材 857.
    expect(materials.slots.slice(0, 3).map((slot) => [slot.item!.itemId, slot.item!.count])).toEqual([
      ['230000', '203'], ['230001', '72'], ['230002', '857'],
    ]);
  });

  it('fills an empty slot, clears an occupied one and stays readable', () => {
    const model = load('save.004');
    const backpack = model.containers.find((entry) => entry.id === 'inventoryItemList_')!;
    const box = model.containers.find((entry) => entry.customName === '材料')!;
    const empty = backpack.slots.find((slot) => slot.item === null)!;
    const boxEmpty = box.slots.find((slot) => slot.item === null)!;

    const changes = pendingChanges(model, { [backpack.slots[1].item!.countOffset]: '42' });
    const packed = exportSave(model, changes, {
      [empty.pointer]: { itemId: '230000', count: '99', rank: '0', quality: '0' },
      [boxEmpty.pointer]: { itemId: '100240', count: '7', rank: '1', quality: '2' },
      [backpack.slots[0].pointer]: null,
    });
    expect(packed.length).toBe(model.save.original.length);

    const reread = parseSaveModel(decodeSave(packed, 'edited'));
    const rebuilt = reread.containers.find((entry) => entry.id === 'inventoryItemList_')!;
    expect(rebuilt.slots[0].item).toBeNull();
    expect(rebuilt.slots[1].item!.count).toBe('42');
    expect(rebuilt.slots[empty.index].item).toMatchObject({ itemId: '230000', count: '99' });
    expect(rebuilt.used).toBe(backpack.used);

    const rebuiltBox = reread.containers.find((entry) => entry.customName === '材料')!;
    expect(rebuiltBox.used).toBe(box.used + 1);
    expect(rebuiltBox.slots[boxEmpty.index].item).toMatchObject({ itemId: '100240', count: '7', quality: '2' });

    // Fresh ids come from the generator, which moves on by exactly two.
    const seedBefore = model.doc.resolve('statusUniqueIDGenerator_/idSeed_')!;
    const seedAfter = reread.doc.resolve('statusUniqueIDGenerator_/idSeed_')!;
    expect(readSigned(reread.doc, seedAfter)).toBe(readSigned(model.doc, seedBefore) + 2n);
    const ids = [rebuilt.slots[empty.index], rebuiltBox.slots[boxEmpty.index]]
      .map((slot) => readSigned(reread.doc, reread.doc.node(slot.item!.uniqueIdOffset)));
    expect(new Set(ids).size).toBe(2);
    expect(Math.min(...ids.map(Number))).toBeGreaterThan(Number(readSigned(model.doc, seedBefore)));

    // The rest of the tree is intact: one item removed, two added.
    expect(reread.nodeCount).toBe(model.nodeCount + 34);
    expect(field(reread, '玩家名字').value).toBe('losty');
  }, 60_000);
});
