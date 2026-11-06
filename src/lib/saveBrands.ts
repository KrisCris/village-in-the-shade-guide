import { seeds } from '../../data/sources/game-crop-quality.json';
import { animals as production } from '../../data/sources/game-livestock-products.json';
import { ANIMALS } from './saveAnimals';
import { NAME_LIMIT } from './saveText';
import { captureBuilt, encodeSigned, encodeString, readSigned, readString, SerTag, type SerBuiltNode, type SerDocument, type SerNode } from './ser';
import { tr } from '../i18n/active';

/**
 * Brands (village.exe, the S result of a 评鉴会).
 *
 * brandCropsNameMap_ maps a crop's count item to its brand name. While the item is
 * in the map, every harvest of it is rank 4 (0x140177470) and shows the brand name.
 *
 * Livestock brands have two parts. Each animal's `feature_/flags_` bit 3
 * (LIVESTOCK_FEATURE_BRAND) makes its products rank 4 (0x140117570). The name comes
 * from brandLivestockNameMap_, keyed by the species' first production entry
 * (species data +0x128). Species that share a product share the name, and the map
 * size is LivestockGetBrandedCount, which the cashmere goat sale checks.
 *
 * Both maps hold `Nk` 8-byte item IDs and `Nv` strings; the map's ref is the pair count.
 */
export type BrandKind = 'crops' | 'livestock';
export const BRAND_MAPS: Record<BrandKind, string> = { crops: 'brandCropsNameMap_', livestock: 'brandLivestockNameMap_' };
export const LIVESTOCK_FEATURE_BRAND = 3;

export interface BrandEdits {
  /** Item ID → name for a new entry, or null to remove a stored one. Stored names are renamed through drafts. */
  crops?: Record<string, string | null>;
  livestock?: Record<string, string | null>;
  /** livestockList_ index → the animal's LIVESTOCK_FEATURE_BRAND bit, when it differs from the save. */
  features?: Record<string, boolean>;
}

/** Count items, the IDs the harvest-rank check looks up. */
export const CROP_BRAND_ITEMS: readonly number[] = [...new Set(seeds.map(seed => seed.count_item_numeric_id))];

/** Species ID → its main product. Young animals and roosters have none (item 0 is never branded). */
const productByCode = new Map(production.map(animal => [animal.livestock_id, animal.raw_candidates[0]?.item_numeric_id ?? 0]));
export const BRAND_PRODUCTS = new Map(ANIMALS.flatMap(animal => { const item = productByCode.get(animal.code) ?? 0; return item ? [[animal.id, item] as const] : []; }));
export const LIVESTOCK_BRAND_ITEMS: readonly number[] = [...new Set(BRAND_PRODUCTS.values())];
export const brandProduct = (species: number) => BRAND_PRODUCTS.get(species);

export interface StoredBrand { key: string; name: string; value: SerNode }
export function storedBrands(doc: SerDocument, kind: BrandKind): StoredBrand[] {
  const map = doc.resolve(BRAND_MAPS[kind]);
  const children = map ? doc.children(map) : [];
  const entries: StoredBrand[] = [];
  for (let index = 0; index + 1 < children.length; index += 2) entries.push({ key: readSigned(doc, children[index]).toString(), name: readString(doc, children[index + 1]), value: children[index + 1] });
  return entries;
}

/** The names after the pending edits, in map order with new entries last. Stored names take their draft. */
export function brandNames(doc: SerDocument, kind: BrandKind, edits: BrandEdits, drafts: Record<number, string> = {}): Map<string, string> {
  const result = new Map<string, string>();
  for (const entry of storedBrands(doc, kind)) if (edits[kind]?.[entry.key] !== null) result.set(entry.key, drafts[entry.value.offset] ?? entry.name);
  for (const [key, name] of Object.entries(edits[kind] ?? {})) if (name !== null && !result.has(key)) result.set(key, name);
  return result;
}

function featureNode(doc: SerDocument, index: number): SerNode | undefined {
  const list = doc.resolve('livestockList_');
  const pointer = list ? doc.children(list)[index] : undefined;
  return pointer && doc.resolve('p/feature_/flags_', pointer);
}
export function storedBrandFeature(doc: SerDocument, index: number): boolean {
  const node = featureNode(doc, index);
  return !!node && !!(doc.payload(node)[LIVESTOCK_FEATURE_BRAND >> 3] & 1 << (LIVESTOCK_FEATURE_BRAND & 7));
}
export function brandFeature(doc: SerDocument, index: number, edits: BrandEdits): boolean {
  return edits.features?.[index] ?? storedBrandFeature(doc, index);
}

export function brandEditCount(edits: BrandEdits): number {
  return Object.keys(edits.crops ?? {}).length + Object.keys(edits.livestock ?? {}).length + Object.keys(edits.features ?? {}).length;
}

/** Record one map edit; a name for a stored key or a removal of a new key cancels out. */
export function withBrandName(doc: SerDocument, edits: BrandEdits, kind: BrandKind, key: string, name: string | null): BrandEdits {
  const stored = storedBrands(doc, kind).some(entry => entry.key === key), entries = { ...edits[kind] };
  if (stored ? name !== null : name === null) delete entries[key]; else entries[key] = name;
  return { ...edits, [kind]: entries };
}
export function withBrandFeature(doc: SerDocument, edits: BrandEdits, index: number, on: boolean): BrandEdits {
  const features = { ...edits.features };
  if (storedBrandFeature(doc, index) === on) delete features[index]; else features[index] = on;
  return { ...edits, features };
}

function checkName(name: string) {
  if (!name.trim()) throw new Error(tr('品牌名不能为空。'));
  if (Array.from(name).length > NAME_LIMIT) throw new Error(tr('品牌名最多 {limit} 个字符。', { limit: NAME_LIMIT }));
}

/**
 * Rebuild each edited brand map like the encyclopedia: drop removed pairs, append new
 * ones, re-index the `Nk`/`Nv` names and set ref to the pair count. A rebuilt map
 * shadows field drafts inside it, so `leafPayload` supplies those renames. Feature
 * bits are leaf payloads under livestockList_.
 */
export function buildBrandEdits(doc: SerDocument, edits: BrandEdits, leafPayload: (node: SerNode) => Uint8Array | undefined = () => undefined) {
  const subtrees = new Map<number, SerBuiltNode>(), payloads = new Map<number, Uint8Array>();
  for (const kind of ['crops', 'livestock'] as const) {
    const entries = Object.entries(edits[kind] ?? {});
    if (!entries.length) continue;
    const map = doc.resolve(BRAND_MAPS[kind]);
    if (!map) throw new Error(tr('存档缺少品牌记录。'));
    const children = doc.children(map), pairs = new Map<string, SerBuiltNode[]>();
    for (let index = 0; index + 1 < children.length; index += 2) {
      const value = captureBuilt(doc, children[index + 1]), renamed = leafPayload(children[index + 1]);
      if (renamed) value.payload = renamed;
      pairs.set(readSigned(doc, children[index]).toString(), [captureBuilt(doc, children[index]), value]);
    }
    const allowed = kind === 'crops' ? CROP_BRAND_ITEMS : LIVESTOCK_BRAND_ITEMS;
    for (const [key, name] of entries) {
      if (name === null) {
        if (!pairs.delete(key)) throw new Error(tr('要删除的品牌名不存在。'));
        continue;
      }
      if (pairs.has(key)) throw new Error(tr('这个物品已经有品牌名。'));
      if (!/^\d+$/.test(key) || !allowed.includes(Number(key))) throw new Error(kind === 'crops' ? tr('作物品牌只能登记作物。') : tr('畜产品牌只能登记家畜的主要产物。'));
      checkName(name);
      pairs.set(key, [
        { tag: SerTag.Scalar, nameOffset: -1, name: '0k', payload: encodeSigned(BigInt(key), 8) },
        { tag: SerTag.String, nameOffset: -1, name: '0v', payload: encodeString(name) },
      ]);
    }
    const result = captureBuilt(doc, map);
    result.ref = pairs.size;
    result.children = [...pairs.values()].flatMap(([key, value], index) => [{ ...key, nameOffset: -1, name: `${index}k` }, { ...value, nameOffset: -1, name: `${index}v` }]);
    subtrees.set(map.offset, result);
  }
  for (const [index, on] of Object.entries(edits.features ?? {})) {
    const node = /^\d+$/.test(index) ? featureNode(doc, Number(index)) : undefined;
    if (!node) throw new Error(tr('要设为品牌种的动物不存在。'));
    const list = doc.resolve('livestockList_')!, pointer = doc.children(list)[Number(index)];
    const species = Number(readSigned(doc, doc.resolve('p/pData_/dataID', pointer)!));
    if (on && !brandProduct(species)) throw new Error(tr('这种动物没有可评鉴的产物，不能设为品牌种。'));
    const bytes = Uint8Array.from(doc.payload(node)), byte = LIVESTOCK_FEATURE_BRAND >> 3, bit = 1 << (LIVESTOCK_FEATURE_BRAND & 7);
    bytes[byte] = on ? bytes[byte] | bit : bytes[byte] & ~bit;
    payloads.set(node.offset, bytes);
  }
  return { subtrees, payloads };
}
