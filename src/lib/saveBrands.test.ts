import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { animalHouses, animalResidents } from './saveAnimals';
import { BRAND_MAPS, CROP_BRAND_ITEMS, brandEditCount, brandNames, brandProduct, storedBrandFeature, storedBrands, withBrandFeature, withBrandName, type BrandEdits, type BrandKind } from './saveBrands';
import { decodeSave, type DecodedSave } from './saveEditor';
import { exportSave, parseSaveModel, pendingChanges, type SaveModel } from './saveModel';
import { readSession } from './saveSession';
import { encodeSigned, SerTag, SerDocument, type SerNode } from './ser';

/** Fixed keys, so the tests don't depend on which crops the fixture snapshot has branded. */
const WHEAT = '100240', BUCKWHEAT = '100270', EGG = '130040';
let save: DecodedSave;
beforeAll(() => { if (hasPrivateSaveFixtures) save = decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'save.004'); });

/** A copy of the save patched in place (same sizes, so offsets hold). */
function patched(edit: (doc: SerDocument) => void): DecodedSave {
  const data = save.data.slice();
  edit(new SerDocument(data));
  return { ...save, data };
}
/** Two crop brands keyed wheat and buckwheat, and a first adult with a product whose brand bit is off. */
const base = () => parseSaveModel(patched(doc => {
  const keys = doc.children(doc.resolve(BRAND_MAPS.crops)!).filter((_, index) => index % 2 === 0);
  if (keys.length < 2) throw new Error('fixture needs two crop brands');
  for (const [node, id] of [[keys[0], WHEAT], [keys[1], BUCKWHEAT]] as const) doc.payload(node).set(encodeSigned(BigInt(id), node.size));
  const resident = animalResidents(doc).find(entry => brandProduct(entry.species));
  if (!resident) throw new Error('fixture needs an adult animal with a product');
  doc.payload(doc.resolve('p/feature_/flags_', resident.pointer)!)[0] &= ~0x08;
}));
const firstAdult = (model: SaveModel) => animalResidents(model.doc).find(entry => brandProduct(entry.species))!;
const reload = (model: SaveModel, brands: BrandEdits, drafts: Record<number, string> = {}) => parseSaveModel(decodeSave(exportSave(model, pendingChanges(model, drafts), {}, {}, {}, {}, {}, brands), 'edited'));

/** Every leaf by path, skipping the given subtrees; pointer refs move with layout, so they are left out. */
function leaves(doc: SerDocument, skip: string[] = []): Map<string, string> {
  const result = new Map<string, string>(), skipped = new Set(skip.map(path => doc.resolve(path)!.offset));
  const walk = (node: SerNode, path: string) => {
    if (skipped.has(node.offset)) return;
    if (node.tag === SerTag.Object || node.tag === SerTag.List || node.tag === SerTag.Pointer) doc.children(node).forEach(child => walk(child, `${path}/${child.name}`));
    else result.set(path, `${node.tag}:${Buffer.from(doc.payload(node)).toString('hex')}`);
  };
  walk(doc.root, '');
  return result;
}
function mapShape(doc: SerDocument, kind: BrandKind) {
  const map = doc.resolve(BRAND_MAPS[kind])!;
  return { ref: map.ref, names: doc.children(map).map(child => child.name) };
}

describe.skipIf(!hasPrivateSaveFixtures)('brand edits', { timeout: 60_000 }, () => {
  it('adds a crop brand at the end and re-indexes the map', () => {
    const model = base(), crop = String(CROP_BRAND_ITEMS.find(id => ![WHEAT, BUCKWHEAT].includes(String(id))));
    const before = storedBrands(model.doc, 'crops').map(entry => [entry.key, entry.name]);
    const edits = withBrandName(model.doc, {}, 'crops', crop, '新品牌');
    expect(brandEditCount(edits)).toBe(1);
    const restored = reload(model, edits);
    expect(storedBrands(restored.doc, 'crops').map(entry => [entry.key, entry.name])).toEqual([...before, [crop, '新品牌']]);
    expect(mapShape(restored.doc, 'crops')).toEqual({ ref: 3, names: ['0k', '0v', '1k', '1v', '2k', '2v'] });
    expect(leaves(restored.doc, [BRAND_MAPS.crops])).toEqual(leaves(model.doc, [BRAND_MAPS.crops]));
  });

  it('deletes a crop brand and keeps the next one, renamed by its draft', () => {
    const model = base(), [wheat, buckwheat] = storedBrands(model.doc, 'crops');
    const edits = withBrandName(model.doc, {}, 'crops', WHEAT, null);
    expect(brandNames(model.doc, 'crops', edits, { [buckwheat.value.offset]: '荞麦屋' })).toEqual(new Map([[BUCKWHEAT, '荞麦屋']]));
    // The rebuilt map would shadow the draft; the rename must still land.
    const restored = reload(model, edits, { [buckwheat.value.offset]: '荞麦屋' });
    expect(storedBrands(restored.doc, 'crops').map(entry => [entry.key, entry.name])).toEqual([[BUCKWHEAT, '荞麦屋']]);
    expect(mapShape(restored.doc, 'crops')).toEqual({ ref: 1, names: ['0k', '0v'] });
    expect(leaves(restored.doc, [BRAND_MAPS.crops])).toEqual(leaves(model.doc, [BRAND_MAPS.crops]));
    // Restoring the name cancels the removal.
    expect(withBrandName(model.doc, edits, 'crops', WHEAT, wheat.name)).toEqual({ crops: {} });
  });

  it('renames a stored crop brand through its draft alone', () => {
    const model = base(), [wheat] = storedBrands(model.doc, 'crops');
    const restored = reload(model, {}, { [wheat.value.offset]: '麦田' });
    expect(storedBrands(restored.doc, 'crops')[0]).toMatchObject({ key: WHEAT, name: '麦田' });
    expect(mapShape(restored.doc, 'crops').ref).toBe(2);
  });

  it('adds, renames and deletes a livestock brand name', () => {
    const model = base();
    expect(storedBrands(model.doc, 'livestock')).toEqual([]);
    let edits = withBrandName(model.doc, {}, 'livestock', EGG, '蛋蛋');
    edits = withBrandName(model.doc, edits, 'livestock', EGG, '晨光蛋');
    expect(edits.livestock).toEqual({ [EGG]: '晨光蛋' });
    const added = reload(model, edits);
    expect(storedBrands(added.doc, 'livestock').map(entry => [entry.key, entry.name])).toEqual([[EGG, '晨光蛋']]);
    expect(mapShape(added.doc, 'livestock')).toEqual({ ref: 1, names: ['0k', '0v'] });
    expect(leaves(added.doc, [BRAND_MAPS.livestock])).toEqual(leaves(model.doc, [BRAND_MAPS.livestock]));

    const [egg] = storedBrands(added.doc, 'livestock');
    const renamed = reload(added, {}, { [egg.value.offset]: '山村蛋' });
    expect(storedBrands(renamed.doc, 'livestock')[0].name).toBe('山村蛋');
    const removed = reload(renamed, withBrandName(renamed.doc, {}, 'livestock', EGG, null));
    expect(mapShape(removed.doc, 'livestock')).toEqual({ ref: 0, names: [] });
    expect(leaves(removed.doc)).toEqual(leaves(model.doc));
  });

  it('sets and clears LIVESTOCK_FEATURE_BRAND without touching other bytes', () => {
    const model = base(), animal = firstAdult(model);
    expect(storedBrandFeature(model.doc, animal.index)).toBe(false);
    const on = withBrandFeature(model.doc, {}, animal.index, true);
    expect(on.features).toEqual({ [animal.index]: true });
    const branded = reload(model, on);
    expect(storedBrandFeature(branded.doc, animal.index)).toBe(true);
    const flags = (doc: SerDocument) => doc.payload(doc.resolve('p/feature_/flags_', doc.children(doc.resolve('livestockList_')!)[animal.index])!);
    expect(Array.from(flags(branded.doc))).toEqual(Array.from(flags(model.doc), (byte, index) => index === 0 ? byte | 0x08 : byte));
    // Same layout, so the whole SER buffer differs only in that bit.
    const used = (doc: SerDocument, model: SaveModel) => model.save.data.subarray(0, doc.usedSize);
    expect(branded.doc.usedSize).toBe(model.doc.usedSize);
    expect(Array.from(used(branded.doc, branded)).filter((byte, index) => byte !== model.save.data[index])).toHaveLength(1);
    expect(withBrandFeature(model.doc, on, animal.index, false)).toEqual({ features: {} });
    const cleared = reload(branded, withBrandFeature(branded.doc, {}, animal.index, false));
    expect(storedBrandFeature(cleared.doc, animal.index)).toBe(false);
    expect(Buffer.compare(used(cleared.doc, cleared), used(model.doc, model))).toBe(0);
  });

  it('keeps the brand bit when the animal list is rebuilt for a move', () => {
    const model = base(), animal = firstAdult(model);
    const house = animalHouses(model.doc).find(entry => entry.slots.some(slot => slot.id === animal.placement));
    const residents = animalResidents(model.doc);
    const free = house?.slots.find(slot => !residents.some(resident => resident.placement === slot.id));
    if (!free) return;
    const packed = exportSave(model, [], {}, {}, {}, { moves: { [animal.index]: free.id } }, {}, withBrandFeature(model.doc, {}, animal.index, true));
    const restored = parseSaveModel(decodeSave(packed, 'edited'));
    expect(storedBrandFeature(restored.doc, animal.index)).toBe(true);
    expect(animalResidents(restored.doc)[animal.index].placement).toBe(free.id);
  });

  it('rejects brands the game would not create', () => {
    const model = base();
    const fails = (edits: BrandEdits) => expect(() => exportSave(model, [], {}, {}, {}, {}, {}, edits)).toThrow();
    fails({ crops: { [WHEAT]: '重复' } });
    fails({ crops: { 130040: '鸡蛋' } });
    fails({ livestock: { 100240: '小麦' } });
    fails({ livestock: { 0: '公鸡' } });
    fails({ crops: { 100000: '一二三四五六七八九' } });
    fails({ crops: { 100000: ' ' } });
    fails({ livestock: { [EGG]: null } });
    fails({ features: { 9999: true } });
  });

  it('survives session restore', () => {
    const model = base(), animal = firstAdult(model);
    const brands = withBrandFeature(model.doc, withBrandName(model.doc, withBrandName(model.doc, {}, 'crops', WHEAT, null), 'livestock', EGG, '蛋'), animal.index, true);
    const session = { version: 2, identity: { name: 'save.004', size: 1, sha256: '0'.repeat(64) }, tab: 'progress', drafts: {}, slots: {}, brands };
    const restored = readSession({ getItem: () => JSON.stringify(session) } as unknown as Storage)!;
    expect(restored.brands).toEqual(brands);
    expect(Buffer.compare(exportSave(model, [], {}, {}, {}, {}, {}, restored.brands), exportSave(model, [], {}, {}, {}, {}, {}, brands))).toBe(0);
    for (const bad of [{ crops: { x: 'a' } }, { livestock: { 1: 3 } }, { features: { 1: 'yes' } }, { other: {} }]) {
      expect(() => readSession({ getItem: () => JSON.stringify({ ...session, brands: bad }) } as unknown as Storage)).toThrow('品牌');
    }
  });
});
