import { beforeAll } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeSave } from './saveEditor';
import { exportSave, parseSaveModel } from './saveModel';
import { buildDeliveryEdits, readDeliveries, UNLOCKS } from './saveDeliveries';
import { changeShrine, shrineEnabled, shrineRelated } from './saveShrine';
import { flagEnabled, PROGRESSION, readSkills } from './saveProgress';
import { readSigned } from './ser';

let model: ReturnType<typeof parseSaveModel>;
beforeAll(() => {
  const bytes = new Uint8Array(readFileSync('tests/gamesave/save.004'));
  model = parseSaveModel(decodeSave(bytes, 'save.004'));
});
const roundtrip = (edits: Parameters<typeof exportSave>[3]) => parseSaveModel(decodeSave(exportSave(model, [], {}, edits), 'edited'));

describe.skipIf(!hasPrivateSaveFixtures)('native shrine tree', () => {
  it('includes the recipe nodes, original coordinates and complete dependency graph', () => {
    expect(UNLOCKS.nodes).toHaveLength(80);
    expect(UNLOCKS.nodes.filter(n => n.skill)).toHaveLength(31);
    expect(UNLOCKS.nodes.find(n => n.id === 5)).toMatchObject({ name: '户外砖头地板', x: 0, y: 2, parents: [1], flag: 80019 });
    expect(UNLOCKS.nodes.find(n => n.id === 21)?.parents).toEqual([17, 11]);
    for (const n of UNLOCKS.nodes) {
      expect(PROGRESSION.flags.some(f => f.id === n.flag)).toBe(true);
      for (const id of n.parents) expect(UNLOCKS.nodes.some(p => p.id === id)).toBe(true);
    }
  });
  it('unlocks all prerequisite branches and synchronizes actual effects and recipe flags on export', () => {
    const edits = changeShrine(model.doc, {}, 21, true), restored = roundtrip(edits);
    for (const id of shrineRelated(21, true)) {
      const n = UNLOCKS.nodes.find(n => n.id === id)!;
      expect(flagEnabled(restored.doc, n.flag)).toBe(true);
      if (n.skill) expect(readSkills(restored.doc).has(String(n.skill))).toBe(true);
    }
    const recipe = roundtrip(changeShrine(model.doc, {}, 5, true));
    expect(flagEnabled(recipe.doc, 80019)).toBe(true);
    expect(shrineEnabled(recipe.doc, 5, {})).toBe(true);
  });
  it('locking a predecessor locks descendants and removes their native skills', () => {
    const edits = changeShrine(model.doc, {}, 1, false), restored = roundtrip(edits);
    for (const id of shrineRelated(1, false)) {
      const n = UNLOCKS.nodes.find(n => n.id === id)!;
      expect(flagEnabled(restored.doc, n.flag)).toBe(false);
      if (n.skill) expect(readSkills(restored.doc).has(String(n.skill))).toBe(false);
    }
  });
  it('can learn a skill from an empty skill list with owned pointers and exact native field widths', () => {
    const empty = roundtrip({ skills: Object.fromEntries(PROGRESSION.skills.map(s => [s.id, false])) });
    expect(readSkills(empty.doc).size).toBe(0);
    const restored = parseSaveModel(decodeSave(exportSave(empty, [], {}, changeShrine(empty.doc, {}, 2, true)), 'learned'));
    expect(readSkills(restored.doc)).toEqual(new Set(['301']));
    const pointer = restored.doc.children(restored.doc.resolve('pPlayerStatus_/p/skills_')!)[0];
    expect(pointer.ref).toBe(pointer.offset);
    expect(readSigned(restored.doc, restored.doc.resolve('p/value_', pointer)!)).toBe(0n);
  });
});

describe.skipIf(!hasPrivateSaveFixtures)('mayor delivery catalogs', () => {
  let rows: ReturnType<typeof readDeliveries>;
  beforeAll(() => { rows = readDeliveries(model.doc); });
  it('resolves all 9 catalogs and 35 sets to the exact saved item records', () => {
    expect(UNLOCKS.groups).toHaveLength(9); expect(UNLOCKS.bundles).toHaveLength(35);
    expect(rows.size).toBe(UNLOCKS.bundles.reduce((n, b) => n + b.items.length, 0));
    for (const row of rows.values()) {
      expect(row.remain).toBeGreaterThanOrEqual(0); expect(row.remain).toBeLessThanOrEqual(row.count);
      expect(readSigned(model.doc, model.doc.node(row.offset))).toBe(BigInt(row.remain));
    }
  });
  it('edits delivered counts, preserves quality and other records, and sets the group completion flag', () => {
    const group = UNLOCKS.groups.find(g => g.id === 13)!;
    const target = [...rows.values()].filter(r => group.bundles.includes(r.bundleId));
    const deliveries = Object.fromEntries(target.map(r => [r.key, r.count]));
    const restored = roundtrip({ deliveries });
    const after = readDeliveries(restored.doc);
    expect(flagEnabled(restored.doc, group.flag)).toBe(true);
    for (const before of rows.values()) expect(after.get(before.key)).toMatchObject({ itemId: before.itemId, rank: before.rank, remain: deliveries[before.key] === undefined ? before.remain : 0 });
    expect(restored.doc.payload(restored.doc.resolve('bundleRewardBoxItemList_')!)).toEqual(model.doc.payload(model.doc.resolve('bundleRewardBoxItemList_')!));
    expect(restored.nodeCount).toBe(model.nodeCount);
    const last = target.at(-1)!;
    const pending = roundtrip({ deliveries: { ...deliveries, [last.key]: last.count - 1 } });
    expect(flagEnabled(pending.doc, group.flag)).toBe(false);
    expect(readDeliveries(pending.doc).get(last.key)?.remain).toBe(1);
  });
  it('rejects unknown slots, over-delivery, fractional and negative counts', () => {
    const row = [...rows.values()][0];
    for (const value of [-1, .5, row.count + 1, NaN]) expect(() => buildDeliveryEdits(model.doc, { [row.key]: value })).toThrow();
    expect(() => buildDeliveryEdits(model.doc, { '999:0': 0 })).toThrow();
  });
  it('opens the catalog using its exact shelf visibility flag without changing unrelated story bits', () => {
    expect(PROGRESSION.flags.find(f => f.id === UNLOCKS.catalogFlag)?.code).toBe('GAME_FLAG_STORY_02_022');
    const before = model.doc.payload(model.doc.resolve('flags_/flags_')!).slice();
    const restored = roundtrip({ flags: { [UNLOCKS.catalogFlag]: true } });
    before[UNLOCKS.catalogFlag >> 3] |= 1 << (UNLOCKS.catalogFlag & 7);
    expect(restored.doc.payload(restored.doc.resolve('flags_/flags_')!)).toEqual(before);
  });
});
