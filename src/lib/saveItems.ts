/**
 * Item containers: the backpack, the tool bar, and every in-world box or
 * machine that holds items.
 *
 * All three share one object layout — verified by comparing the child list of
 * an `inventoryItemList_` entry, a `toolItemList_` entry and a storage-box
 * entry in `save.004`: identical tags, names and sizes. So one grid renders
 * them all.
 *
 * The in-world boxes are not the root-level `shippingBoxItemList_` family (those
 * are empty in every save). They are entries of `gimmickList_` that carry an
 * `itemList_`; a 収納箱 is `pData_/dataID == 241000000` with 30 slots and a
 * player-assigned `name_`. Machines (beehives, tapped trees, drying racks) are
 * the same shape with fewer slots.
 */

import {
  captureBuilt,
  encodeSigned,
  NULL_REF,
  nullPointer,
  readSigned,
  readString,
  SerTag,
  type SerBuiltNode,
  type SerDocument,
  type SerNode,
} from './ser';

/** Storage boxes the player can rename and sort; everything else is a machine. */
const STORAGE_BOX_IDS = new Set([241000000, 241000400]);

/** The game draws ten slots per row; keep the grid the same shape. */
export const GRID_COLUMNS = 10;

export type ContainerKind = 'backpack' | 'tool' | 'storage' | 'machine' | 'system';

export interface SaveSlotItem {
  /** Header offsets of the leaves, so ordinary value edits use the draft map. */
  itemIdOffset: number;
  countOffset: number;
  rankOffset: number;
  qualityOffset: number;
  uniqueIdOffset: number;
  itemId: string;
  count: string;
  rank: string;
  quality: string;
}

export interface SaveSlot {
  index: number;
  /** Header offset of the pointer node that owns the slot; the slot's identity. */
  pointer: number;
  item: SaveSlotItem | null;
}

export interface SaveContainer {
  id: string;
  kind: ContainerKind;
  title: string;
  /** Player-assigned box name, empty when the box was never renamed. */
  customName: string;
  nameOffset?: number;
  /** Gimmick data ID, or null for the root-level lists. */
  dataId: number | null;
  slots: SaveSlot[];
  used: number;
  /** Item ID of the first occupied slot, used to label unnamed containers. */
  previewItemId: string | null;
}

/* ------------------------------------------------------------------ read -- */

/** The object a pointer element wraps, skipping an optional `className` node. */
function pointee(doc: SerDocument, pointer: SerNode): SerNode | undefined {
  return doc.children(pointer).find((child) => child.tag === SerTag.Object);
}

function readSlot(doc: SerDocument, pointer: SerNode, index: number): SaveSlot {
  const item = pointee(doc, pointer);
  const itemId = item && doc.resolve('pData_/dataID', item);
  const count = item && doc.resolve('stackCount_/this->value_', item);
  const rank = item && doc.resolve('rank_', item);
  const quality = item && doc.resolve('qualityUpValue_', item);
  const uniqueId = item && doc.resolve('uniqueID_', item);
  if (!itemId || !count || !rank || !quality || !uniqueId) return { index, pointer: pointer.offset, item: null };
  return {
    index,
    pointer: pointer.offset,
    item: {
      itemIdOffset: itemId.offset,
      countOffset: count.offset,
      rankOffset: rank.offset,
      qualityOffset: quality.offset,
      uniqueIdOffset: uniqueId.offset,
      itemId: readSigned(doc, itemId).toString(),
      count: readSigned(doc, count).toString(),
      rank: readSigned(doc, rank).toString(),
      quality: readSigned(doc, quality).toString(),
    },
  };
}

function buildContainer(
  doc: SerDocument,
  list: SerNode,
  id: string,
  kind: ContainerKind,
  title: string,
  customName = '',
  dataId: number | null = null,
): SaveContainer {
  const slots = doc.children(list).map((pointer, index) => readSlot(doc, pointer, index));
  const occupied = slots.filter((slot) => slot.item !== null);
  return {
    id,
    kind,
    title,
    customName,
    dataId,
    slots,
    used: occupied.length,
    previewItemId: occupied[0]?.item?.itemId ?? null,
  };
}

const ROOT_LISTS: { path: string; title: string }[] = [
  { path: 'shippingBoxItemList_', title: '出货箱' },
  { path: 'huntRewardBoxItemList_', title: '狩猎奖励箱' },
  { path: 'constructionBoxItemList_', title: '建造材料箱' },
  { path: 'bundleRewardBoxItemList_', title: '供奉奖励箱' },
  { path: 'dropItemList_', title: '掉落物' },
];

/**
 * The backpack and tool bar, then every world container that has at least one
 * slot. Storage boxes come before machines so the switcher opens on something
 * worth editing.
 */
export function collectContainers(doc: SerDocument): SaveContainer[] {
  const primary: SaveContainer[] = [];
  const backpack = doc.resolve('inventoryItemList_');
  if (backpack) primary.push(buildContainer(doc, backpack, 'inventoryItemList_', 'backpack', '背包'));
  const tools = doc.resolve('toolItemList_');
  if (tools) primary.push(buildContainer(doc, tools, 'toolItemList_', 'tool', '工具栏'));

  const storage: SaveContainer[] = [];
  const machines: SaveContainer[] = [];
  const gimmicks = doc.resolve('gimmickList_');
  if (gimmicks) {
    let boxNumber = 0;
    let machineNumber = 0;
    for (const [index, pointer] of doc.children(gimmicks).entries()) {
      const gimmick = pointee(doc, pointer);
      if (!gimmick) continue;
      const list = doc.resolve('itemList_', gimmick);
      if (!list || doc.children(list).length === 0) continue;
      const dataNode = doc.resolve('pData_/dataID', gimmick);
      const dataId = dataNode ? Number(readSigned(doc, dataNode)) : 0;
      const nameNode = doc.resolve('name_', gimmick);
      const customName = nameNode ? readString(doc, nameNode) : '';
      const isBox = STORAGE_BOX_IDS.has(dataId);
      const number = isBox ? ++boxNumber : ++machineNumber;
      const title = customName || (isBox ? `收纳箱 ${number}` : `设备 ${number}`);
      const container = buildContainer(
        doc,
        list,
        `gimmick-${index}`,
        isBox ? 'storage' : 'machine',
        title,
        customName,
        dataId,
      );
      if (isBox && nameNode) container.nameOffset = nameNode.offset;
      (isBox ? storage : machines).push(container);
    }
  }

  const system: SaveContainer[] = [];
  for (const entry of ROOT_LISTS) {
    const list = doc.resolve(entry.path);
    if (list && doc.children(list).length > 0) {
      system.push(buildContainer(doc, list, entry.path, 'system', entry.title));
    }
  }

  // Most machines are empty buffers; float the ones with something in them.
  machines.sort((a, b) => b.used - a.used || b.slots.length - a.slots.length);
  return [...primary, ...storage, ...machines, ...system];
}

/* ----------------------------------------------------------- slot editing -- */

export interface SlotAssignment {
  itemId: string;
  count: string;
  rank: string;
  quality: string;
}

/** Pointer-node offset → the item to put there, or null to empty the slot. */
export type SlotEdits = Readonly<Record<number, SlotAssignment | null>>;

function findDonor(doc: SerDocument, containers: SaveContainer[], listPointer: number): SerNode | undefined {
  const owner = containers.find((container) => container.slots.some((slot) => slot.pointer === listPointer));
  const search = owner ? [owner, ...containers] : containers;
  for (const container of search) {
    const filled = container.slots.find((slot) => slot.item !== null);
    if (filled) return doc.node(filled.pointer);
  }
  return undefined;
}

function setScalar(node: SerBuiltNode | undefined, value: string, label: string): void {
  if (!node?.payload) throw new Error(`新建物品时找不到 ${label} 字段。`);
  if (!/^-?\d+$/.test(value.trim())) throw new Error(`${label} 必须是整数。`);
  node.payload = encodeSigned(BigInt(value.trim()), node.payload.length);
}

function child(node: SerBuiltNode, path: string): SerBuiltNode | undefined {
  let current: SerBuiltNode | undefined = node;
  for (const segment of path.split('/')) {
    if (!current) return undefined;
    current = current.children?.find((entry) => entry.name === segment);
  }
  return current;
}

export interface SlotBuildResult {
  subtrees: Map<number, SerBuiltNode>;
  /** New payload for `statusUniqueIDGenerator_/idSeed_`, when items were added. */
  idSeed: { offset: number; payload: Uint8Array } | null;
}

/**
 * Turn slot assignments into whole-node replacements.
 *
 * Filling a slot clones an existing item — every field of an item object is a
 * scalar, an object of scalars or an empty list, so a clone carries no pointer
 * of its own and can be dropped anywhere in the tree. Only the identity fields
 * are then overwritten: a fresh `uniqueID_` handed out by
 * `statusUniqueIDGenerator_/idSeed_`, plus the item ID, count, rank and quality.
 */
export function buildSlotEdits(
  doc: SerDocument,
  containers: SaveContainer[],
  edits: SlotEdits,
): SlotBuildResult {
  const subtrees = new Map<number, SerBuiltNode>();
  const entries = Object.entries(edits);
  if (entries.length === 0) return { subtrees, idSeed: null };

  const seedNode = doc.resolve('statusUniqueIDGenerator_/idSeed_');
  let seed = seedNode ? readSigned(doc, seedNode) : 0n;
  let handedOut = 0;

  for (const [key, assignment] of entries) {
    const offset = Number(key);
    const pointer = doc.node(offset);
    if (pointer.tag !== SerTag.Pointer) throw new Error(`格子 ${offset} 不是一个物品指针。`);

    if (assignment === null) {
      if (pointer.ref === NULL_REF) continue;
      subtrees.set(offset, nullPointer(pointer.nameOffset, pointer.name));
      continue;
    }

    const donor = findDonor(doc, containers, offset);
    if (!donor) throw new Error('这个存档里没有任何已占用的格子可以作为新物品的模板。');
    const built = captureBuilt(doc, donor);
    // Keep the slot's own name ("0", "1", …) rather than the donor's.
    built.nameOffset = pointer.nameOffset;
    built.name = pointer.name;
    built.pointer = 'self';
    const item = built.children?.find((entry) => entry.tag === SerTag.Object);
    if (!item) throw new Error('模板格子里没有物品对象。');
    seed += 1n;
    handedOut += 1;
    setScalar(child(item, 'uniqueID_'), seed.toString(), 'uniqueID_');
    setScalar(child(item, 'pData_/dataID'), assignment.itemId, '物品 ID');
    setScalar(child(item, 'stackCount_/this->value_'), assignment.count, '数量');
    setScalar(child(item, 'rank_'), assignment.rank, 'rank_');
    setScalar(child(item, 'qualityUpValue_'), assignment.quality, '品质加成');
    subtrees.set(offset, built);
  }

  const idSeed = handedOut > 0 && seedNode
    ? { offset: seedNode.offset, payload: encodeSigned(seed, seedNode.size) }
    : null;
  return { subtrees, idSeed };
}
