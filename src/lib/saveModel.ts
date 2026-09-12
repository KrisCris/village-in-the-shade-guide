/**
 * Typed view over a decoded save.
 *
 * Everything here is derived from the real `SER` tree — node paths, not byte
 * scanning — so a field is only exposed when the path that produced it exists.
 * Field identity is the header offset of the node that holds the value, which
 * is also the key the encoder uses when applying edits.
 */

import { buildProgressEdits, type ProgressEdits } from './saveProgress';
import { buildMachineEdits, type MachineEdits } from './saveMachines';
import { buildAnimalEdits, type AnimalEdits } from './saveAnimals';
import animals from '../../data/sources/game-save-animals.json';
import { linkedToolDrafts } from './saveTools';
import { SAVE_RULES } from './saveRules';
import { validateCuratedChanges } from './saveValidation';
import { decodeSave, encodeSave, type DecodedSave } from './saveEditor';
import { buildSlotEdits, collectContainers, type SaveContainer, type SlotEdits } from './saveItems';
import {
  encodeFloat,
  encodeSigned,
  encodeString,
  readFloat,
  readSigned,
  readString,
  serializeSer,
  SerDocument,
  SerTag,
  signedRange,
  NULL_REF,
  type SerNode,
} from './ser';

export type SaveSectionId = 'basic' | 'player' | 'items' | 'barn' | 'npc' | 'brand' | 'progress' | 'quests' | 'raw';
export type FieldType = 'int' | 'float' | 'bool' | 'string' | 'bytes';
/** Entity kind in `public/save-editor-names.json`, used to label an ID field. */
export type LookupKind = 'items' | 'characters' | 'livestock' | 'crops' | 'weather' | 'facilities';

export interface SaveField {
  control?: 'npc-friendship' | 'animal-friendship' | 'slider';
  /** Stable identity: the header offset of the node holding this value. */
  offset: number;
  label: string;
  type: FieldType;
  value: string;
  byteLength: number;
  min?: string;
  max?: string;
  note?: string;
  readOnly?: boolean;
  lookup?: LookupKind;
}

export interface SaveTableRow {
  key: string;
  label: string;
  cells: (SaveField | null)[];
}

export interface SaveTable {
  id: string;
  title: string;
  note?: string;
  columns: string[];
  rows: SaveTableRow[];
}

export interface SaveGroup {
  title: string;
  fields: SaveField[];
}

export interface SaveSection {
  id: SaveSectionId;
  label: string;
  description: string;
  groups: SaveGroup[];
  tables: SaveTable[];
}

export interface SaveModel {
  save: DecodedSave;
  doc: SerDocument;
  sections: SaveSection[];
  containers: SaveContainer[];
  summary: string[];
  nodeCount: number;
  /**
   * Offsets some other pointer aliases. Replacing one of these would leave
   * the aliasing pointer looking at the wrong object, so slot edits refuse
   * to touch them.
   */
  aliasTargets: ReadonlySet<number>;
}

/* ------------------------------------------------------------- field spec -- */

interface ScalarSpec {
  control?: SaveField['control'];
  path: string;
  label: string;
  type?: FieldType;
  readOnly?: boolean;
  note?: string;
  lookup?: LookupKind;
  min?: bigint;
  max?: bigint;
}

const BASIC_GROUPS: { title: string; specs: ScalarSpec[] }[] = [
  {
    title: '身份',
    specs: [
      { path: 'pPlayerStatus_/p/name_', label: '玩家名字', type: 'string' },
      { path: 'pPlayerStatus_/p/dogName_', label: '狗狗名字', type: 'string' },
      { path: 'revision_', label: '存档修订号', type: 'string', readOnly: true },
      { path: 'version_', label: '存档版本', readOnly: true },
    ],
  },
  {
    title: '金钱',
    specs: [
      { path: 'money_/this->value_', label: '持有金钱', min: 0n, max: BigInt(SAVE_RULES.moneyMax) },
      { path: 'offeringMoney_/this->value_', label: '供奉金钱', min: 0n, max: BigInt(SAVE_RULES.moneyMax) },
    ],
  },
  {
    title: '时间',
    specs: [
      { path: 'gameTime_/second_', label: '游戏内累计秒数', readOnly: true, min: 0n, note: '决定年份、季节、日期和时刻。' },
      { path: 'playTime_/date_', label: '游玩时长 · 天', readOnly: true, min: 0n },
      { path: 'playTime_/hour_', label: '游玩时长 · 小时', readOnly: true, min: 0n },
      { path: 'playTime_/minute_', label: '游玩时长 · 分', readOnly: true, min: 0n, max: 59n },
      { path: 'playTime_/second_', label: '游玩时长 · 秒', readOnly: true, min: 0n, max: 59n },
    ],
  },
  {
    title: '天气',
    specs: [
      { path: 'pOlddayWeatherData_/dataID', label: '昨天天气', lookup: 'weather' },
      { path: 'pWeatherData_/dataID', label: '今天天气', lookup: 'weather' },
      { path: 'pNextdayWeatherData_/dataID', label: '明天天气', lookup: 'weather' },
    ],
  },

];

const PLAYER_GROUPS: { title: string; specs: ScalarSpec[] }[] = [
  {
    title: '状态',
    specs: [
      { path: 'pPlayerStatus_/p/hp_/this->value_', label: '生命（当前）', min: 0n, note: '每颗心 4 点，最多 10 颗心。' },
      { path: 'pPlayerStatus_/p/hp_/max_', label: '生命（上限）', min: BigInt(SAVE_RULES.hp.initial), max: BigInt(SAVE_RULES.hp.max) },
      { path: 'pPlayerStatus_/p/st_/this->value_', label: '体力（当前）', min: 0n },
      { path: 'pPlayerStatus_/p/st_/max_', label: '体力（上限）', min: BigInt(SAVE_RULES.stamina.initial), max: BigInt(SAVE_RULES.stamina.max), note: '每段 190，最多 5 段。' },
    ],
  },
  {
    title: '工具范围等级',
    specs: [
      { path: 'pPlayerStatus_/p/mullberryRangeLevel_', label: 'mullberryRangeLevel_', min: 0n },
      { path: 'pPlayerStatus_/p/wateringCanRangeLevel_', label: '浇水壶范围等级', min: 0n },
      { path: 'pPlayerStatus_/p/sickleRangeLevel_', label: '镰刀范围等级', min: 0n },
      { path: 'pPlayerStatus_/p/plowRangeLevel_', label: '犁范围等级', min: 0n },
    ],
  },
  {
    title: '外观',
    specs: [
      { path: 'pPlayerStatus_/p/pBackHairStyle_/dataID', label: '后发型 ID' },
      { path: 'pPlayerStatus_/p/pFrontHairStyle_/dataID', label: '前发型 ID' },
      { path: 'pPlayerStatus_/p/hairColorHsv_/x', label: '发色 H', type: 'float' },
      { path: 'pPlayerStatus_/p/hairColorHsv_/y', label: '发色 S', type: 'float' },
      { path: 'pPlayerStatus_/p/hairColorHsv_/z', label: '发色 V', type: 'float' },
      { path: 'pPlayerStatus_/p/pCrothing_/dataID', label: '服装 ID' },
      { path: 'pPlayerStatus_/p/crothingColor_', label: '服装配色' },
      { path: 'pPlayerStatus_/p/pHeadAccessory_/dataID', label: '头部饰品 ID' },
      { path: 'pPlayerStatus_/p/headAccessoryColor_', label: '头部饰品配色' },
      { path: 'pPlayerStatus_/p/pNeckAccessory_/dataID', label: '颈部饰品 ID' },
      { path: 'pPlayerStatus_/p/neckAccessoryColor_', label: '颈部饰品配色' },
      { path: 'pPlayerStatus_/p/pBackAccessory_/dataID', label: '背部饰品 ID' },
      { path: 'pPlayerStatus_/p/backAccessoryColor_', label: '背部饰品配色' },
    ],
  },
];

/* ------------------------------------------------------------ field build -- */

function scalarField(doc: SerDocument, node: SerNode, spec: ScalarSpec): SaveField {
  const type = spec.type ?? (node.tag === SerTag.String ? 'string' : 'int');
  const base: SaveField = {
    offset: node.offset,
    label: spec.label,
    type,
    value: '',
    byteLength: node.size,
    note: spec.note,
    readOnly: spec.readOnly,
    lookup: spec.lookup,
    control: spec.control,
  };
  if (type === 'string') return { ...base, value: readString(doc, node) };
  if (type === 'float') return { ...base, value: String(readFloat(doc, node)), min: spec.path.includes('hairColorHsv_') ? '0' : undefined, max: spec.path.includes('hairColorHsv_') ? '1' : undefined };
  if (type === 'bool') return { ...base, value: readSigned(doc, node) === 0n ? '0' : '1' };
  const range = signedRange(node.size);
  return {
    ...base,
    value: readSigned(doc, node).toString(),
    min: (spec.min !== undefined && spec.min > range.min ? spec.min : range.min).toString(),
    max: (spec.max !== undefined && spec.max < range.max ? spec.max : range.max).toString(),
  };
}

function buildGroups(doc: SerDocument, groups: { title: string; specs: ScalarSpec[] }[]): SaveGroup[] {
  return groups
    .map((group) => ({
      title: group.title,
      fields: group.specs
        .map((spec) => {
          const node = doc.resolve(spec.path);
          if (!node) return null;
          const parentPath = spec.path.replace('/this->value_', '');
          const maxNode = spec.path.endsWith('/this->value_') ? doc.resolve(`${parentPath}/max_`) : undefined;
          return scalarField(doc, node, maxNode ? { ...spec, max: readSigned(doc, maxNode) } : spec);
        })
        .filter((field): field is SaveField => field !== null),
    }))
    .filter((group) => group.fields.length > 0);
}

/** The object a pointer element wraps, skipping an optional `className` node. */
function pointee(doc: SerDocument, pointer: SerNode): SerNode | undefined {
  return doc.children(pointer).find((child) => child.tag === SerTag.Object);
}

function cell(doc: SerDocument, from: SerNode | undefined, spec: ScalarSpec): SaveField | null {
  if (!from) return null;
  const node = doc.resolve(spec.path, from);
  if (!node) return null;
  const parentPath = spec.path.replace('/this->value_', '');
  const maxNode = spec.path.endsWith('/this->value_') ? doc.resolve(`${parentPath}/max_`, from) : undefined;
  return scalarField(doc, node, maxNode ? { ...spec, max: readSigned(doc, maxNode) } : spec);
}

function livestockTable(doc: SerDocument): SaveTable | null {
  const list = doc.resolve('livestockList_');
  if (!list) return null;
  const rows: SaveTableRow[] = doc.children(list).map((pointer, index) => {
    const animal = pointee(doc, pointer);
    const speciesNode = animal && doc.resolve('pData_/dataID', animal);
    const species = animals.animals.find(entry => entry.id === Number(speciesNode && readSigned(doc, speciesNode)));
    const feature = animal && doc.resolve('feature_/flags_', animal);
    const easy = species?.features.includes(11) || !!(feature && (doc.payload(feature)[1] & 8));
    const heartMax = easy ? 1500n : 2000n;
    return {
      key: `livestock-${index}`,
      label: `#${index + 1}`,
      cells: [
        cell(doc, animal, { path: 'name_', label: '名字', type: 'string' }),
        cell(doc, animal, { path: 'pData_/dataID', label: '种类', lookup: 'livestock', readOnly: true }),
        cell(doc, animal, { path: 'loveRate_/this->value_', label: '好感', min: 0n, max: heartMax, control: 'animal-friendship' }),
        cell(doc, animal, { path: 'moodRate_/this->value_', label: '心情', min: 0n, max: 255n, control: 'slider' }),
        cell(doc, animal, { path: 'foodNum_/this->value_', label: '已喂食', type: 'bool' }),
      ],
    };
  });
  return {
    id: 'livestockList_',
    title: `畜牧（${rows.length} 只）`,
    note: '种类只读：改动它会让存档里的贴图和产物数据对不上。',
    columns: ['#', '名字', '种类', '好感', '心情', '已喂食'],
    rows,
  };
}

function npcTable(doc: SerDocument): SaveTable | null {
  const list = doc.resolve('npcStatusList_');
  if (!list) return null;
  const rows: SaveTableRow[] = doc.children(list).map((pointer, index) => {
    const npc = pointee(doc, pointer);
    return {
      key: `npc-${index}`,
      label: `#${index + 1}`,
      cells: [
        cell(doc, npc, { path: 'pData_/dataID', label: '角色', lookup: 'characters', readOnly: true }),
        cell(doc, npc, { path: 'loveRate_/this->value_', label: '好感', min: 0n, max: BigInt(SAVE_RULES.npcHearts.at(-1)!), control: 'npc-friendship' }),
      ],
    };
  });
  return {
    id: 'npcStatusList_',
    title: `NPC（${rows.length} 位）`,
    columns: ['#', '角色', '好感'],
    rows,
  };
}

function brandTable(doc: SerDocument, path: string, title: string, lookup: LookupKind): SaveTable | null {
  const map = doc.resolve(path);
  if (!map) return null;
  const children = doc.children(map);
  const rows: SaveTableRow[] = [];
  for (let index = 0; index * 2 + 1 < children.length; index++) {
    const key = children[index * 2];
    const value = children[index * 2 + 1];
    rows.push({
      key: `${path}-${index}`,
      label: `#${index + 1}`,
      cells: [
        scalarField(doc, key, { path: '', label: '对象 ID', readOnly: true, lookup }),
        scalarField(doc, value, { path: '', label: '品牌名', type: 'string' }),
      ],
    });
  }
  return {
    id: path,
    title: `${title}（${rows.length} 条）`,
    note: rows.length === 0 ? '这个存档里还没有登记品牌名。' : undefined,
    columns: ['#', '对象 ID', '品牌名'],
    rows,
  };
}

/* ------------------------------------------------------------- game clock -- */

const SECONDS_PER_DAY = 86400;
const DAYS_PER_SEASON = 28;
const SEASONS = ['春', '夏', '秋', '冬'];
/** Day 1 begins at 07:00, so a whole-day remainder of 0 reads as 07:00. */
const DAY_START_SECONDS = 7 * 3600;

export function describeGameTime(totalSeconds: bigint): string {
  if (totalSeconds < 0n) return '—';
  const seconds = Number(totalSeconds);
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const rest = seconds - days * SECONDS_PER_DAY;
  const year = Math.floor(days / (DAYS_PER_SEASON * SEASONS.length)) + 1;
  const dayOfYear = days % (DAYS_PER_SEASON * SEASONS.length);
  const season = SEASONS[Math.floor(dayOfYear / DAYS_PER_SEASON)];
  const day = (dayOfYear % DAYS_PER_SEASON) + 1;
  const clock = (rest + DAY_START_SECONDS) % SECONDS_PER_DAY;
  const hh = String(Math.floor(clock / 3600)).padStart(2, '0');
  const mm = String(Math.floor((clock % 3600) / 60)).padStart(2, '0');
  return `第 ${year} 年 ${season} ${day} 日 ${hh}:${mm}`;
}

/* ------------------------------------------------------------------ model -- */

/** One walk of the whole tree: node count plus the aliased pointer targets. */
function surveyTree(doc: SerDocument): { nodeCount: number; aliasTargets: Set<number> } {
  let nodeCount = 0;
  const aliasTargets = new Set<number>();
  const walk = (node: SerNode): void => {
    nodeCount++;
    if (node.tag === SerTag.Pointer && node.ref !== NULL_REF && node.ref !== node.offset) {
      aliasTargets.add(node.ref);
    }
    for (const child of doc.children(node)) walk(child);
  };
  walk(doc.root);
  return { nodeCount, aliasTargets };
}

function readOptionalSigned(doc: SerDocument, path: string): bigint | null {
  const node = doc.resolve(path);
  return node ? readSigned(doc, node) : null;
}

export function parseSaveModel(save: DecodedSave): SaveModel {
  const doc = new SerDocument(save.data);
  const sections: SaveSection[] = [
    {
      id: 'basic',
      label: '基础信息',
      description: '修改名字、金钱、时间和天气。',
      groups: buildGroups(doc, BASIC_GROUPS),
      tables: [],
    },
    {
      id: 'player',
      label: '玩家',
      description: '调整生命、体力与外观。',
      groups: buildGroups(doc, PLAYER_GROUPS),
      tables: [],
    },
    {
      id: 'items',
      label: '物品',
      description: '上面是容器，下面是背包和工具栏，格子排布与游戏里一致。点格子可以换物品、改数量，空格子也能直接放入新物品。',
      groups: [],
      tables: [],
    },
    { id: 'barn', label: '畜牧', description: '牲畜的名字、好感、心情、饲料和成长。', groups: [], tables: [] },
    { id: 'npc', label: 'NPC', description: '村民好感度。', groups: [], tables: [] },
    { id: 'brand', label: '品牌名', description: '作物与畜产品的品牌名称。', groups: [], tables: [] },
  ];

  const barn = livestockTable(doc);
  if (barn) sections[3].tables.push(barn);
  const npc = npcTable(doc);
  if (npc) sections[4].tables.push(npc);
  // Both maps are keyed by the harvested/produced item ID, not by the crop or
  // animal ID — confirmed for the crop map, which lists 小麦 and 荞麦 item IDs.
  for (const table of [
    brandTable(doc, 'brandCropsNameMap_', '作物品牌', 'items'),
    brandTable(doc, 'brandLivestockNameMap_', '畜产品牌', 'items'),
  ]) {
    if (table) sections[5].tables.push(table);
  }

  const gameTime = readOptionalSigned(doc, 'gameTime_/second_');
  const money = readOptionalSigned(doc, 'money_/this->value_');
  const { nodeCount, aliasTargets } = surveyTree(doc);
  const containers = collectContainers(doc);
  const summary = [
    `SER 节点 ${nodeCount.toLocaleString('en-US')} 个，数据区 ${doc.usedSize.toLocaleString('en-US')} 字节。`,
    gameTime === null ? '未找到游戏时间字段。' : `游戏时间：${describeGameTime(gameTime)}。`,
    money === null ? '未找到金钱字段。' : `持有金钱：${money.toLocaleString('en-US')}。`,
  ];

  return { save, doc, sections, containers, summary, nodeCount, aliasTargets };
}

/* -------------------------------------------------------------- raw nodes -- */

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function fromHex(value: string, byteLength: number, label: string): Uint8Array {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.some((part) => !/^[0-9a-fA-F]{2}$/.test(part))) {
    throw new Error(`${label} 必须是以空格分隔的两位十六进制字节。`);
  }
  if (parts.length !== byteLength) throw new Error(`${label} 必须保持 ${byteLength} 字节。`);
  return Uint8Array.from(parts, (part) => Number.parseInt(part, 16));
}

/**
 * Build an editable field for any leaf node in the raw tree. Containers return
 * null — their bytes are the children, which are edited individually.
 */
export function rawFieldFor(doc: SerDocument, node: SerNode): SaveField | null {
  if (node.tag === SerTag.String) {
    return { offset: node.offset, label: node.name, type: 'string', value: readString(doc, node), byteLength: node.size };
  }
  if (node.tag === SerTag.Scalar && (node.size === 1 || node.size === 2 || node.size === 4 || node.size === 8)) {
    const range = signedRange(node.size);
    const asFloat = node.size === 4 || node.size === 8 ? readFloat(doc, node) : null;
    return {
      offset: node.offset,
      label: node.name,
      type: 'int',
      value: readSigned(doc, node).toString(),
      byteLength: node.size,
      min: range.min.toString(),
      max: range.max.toString(),
      note: asFloat === null ? undefined : `按浮点读取是 ${asFloat}`,
    };
  }
  if (node.tag === SerTag.Scalar || node.tag === SerTag.Blob) {
    return {
      offset: node.offset,
      label: node.name,
      type: 'bytes',
      value: toHex(doc.payload(node)),
      byteLength: node.size,
      note: '原始字节，只能等长度替换。',
    };
  }
  return null;
}

/* ------------------------------------------------------------------ edits -- */

export type SaveDrafts = Readonly<Record<number, string>>;

function payloadFor(doc: SerDocument, field: SaveField, raw: string): Uint8Array {
  const node = doc.node(field.offset);
  const value = raw.trim();
  if (field.type === 'string') return encodeString(raw);
  if (field.type === 'bytes') return fromHex(raw, node.size, field.label);
  if (field.type === 'float') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${field.label} 必须是一个数字。`);
    if ((field.min !== undefined && parsed < Number(field.min)) || (field.max !== undefined && parsed > Number(field.max))) throw new Error(`${field.label} 超出允许范围。`);
    return encodeFloat(parsed, node.size);
  }
  if (!/^-?\d+$/.test(value)) throw new Error(`${field.label} 必须是整数。`);
  const parsed = BigInt(value);
  const range = signedRange(node.size);
  const min = field.min !== undefined ? BigInt(field.min) : range.min;
  const max = field.max !== undefined ? BigInt(field.max) : range.max;
  if (parsed < min || parsed > max) throw new Error(`${field.label} 必须在 ${min} 到 ${max} 之间。`);
  return encodeSigned(parsed, node.size);
}

export function collectFields(model: SaveModel): Map<number, SaveField> {
  const out = new Map<number, SaveField>();
  for (const section of model.sections) {
    for (const group of section.groups) for (const field of group.fields) out.set(field.offset, field);
    for (const table of section.tables) {
      for (const row of table.rows) for (const field of row.cells) if (field) out.set(field.offset, field);
    }
  }
  for (const field of containerFields(model)) out.set(field.offset, field);
  return out;
}

/** Editable leaves of every occupied slot, labelled by container and slot. */
function containerFields(model: SaveModel): SaveField[] {
  const fields: SaveField[] = [];
  for (const container of model.containers) {
    if (container.nameOffset !== undefined) fields.push({ offset: container.nameOffset, label: `${container.title} · 名称`, type: 'string', value: container.customName, byteLength: model.doc.node(container.nameOffset).size });
    for (const slot of container.slots) {
      const item = slot.item;
      if (!item) continue;
      const where = `${container.title} 第 ${slot.index + 1} 格`;
      const push = (offset: number, label: string, value: string, lookup?: LookupKind): void => {
        fields.push({
          offset,
          label: `${where} · ${label}`,
          type: 'int',
          value,
          byteLength: model.doc.node(offset).size,
          min: '0',
          max: signedRange(model.doc.node(offset).size).max.toString(),
          lookup,
        });
      };
      push(item.itemIdOffset, '物品', item.itemId, 'items');
      push(item.countOffset, '数量', item.count);
      push(item.rankOffset, 'rank_', item.rank);
      push(item.qualityOffset, '品质加成', item.quality);
    }
  }
  return fields;
}

export interface SaveChange {
  field: SaveField;
  before: string;
  after: string;
}

/**
 * Turn the draft map into the list of real changes. Offsets the curated
 * sections do not cover come from the raw tree, so they are resolved straight
 * from the node they point at.
 */
export function pendingChanges(model: SaveModel, drafts: SaveDrafts): SaveChange[] {
  const curated = collectFields(model);
  const changes: SaveChange[] = [];
  for (const [offsetKey, draft] of Object.entries(linkedToolDrafts(model, drafts))) {
    const offset = Number(offsetKey);
    const field = curated.get(offset) ?? rawFieldFor(model.doc, model.doc.node(offset));
    if (!field || field.readOnly || draft === field.value) continue;
    changes.push({ field, before: field.value, after: draft });
  }
  return changes;
}

/**
 * Apply the drafts and the slot assignments, then repack. The uploaded file
 * itself is never touched.
 *
 * Value edits that land inside a slot being replaced or emptied are dropped:
 * the node they addressed will not be written out at all.
 */
export function exportSave(model: SaveModel, changes: SaveChange[], slots: SlotEdits = {}, progress: ProgressEdits = {}, machines: MachineEdits = {}, animalEdits: AnimalEdits = {}): Uint8Array {
  const processing = buildMachineEdits(model.doc, model.containers, machines);
  if (Object.keys(processing.slots).some(key => Object.hasOwn(slots, key))) throw new Error("加工栏位同时存在物品修改，请撤销物品修改。");
  slots = { ...slots, ...processing.slots };
  validateCuratedChanges(model, changes, slots);
  const { subtrees, idSeed } = buildSlotEdits(model.doc, model.containers, slots);
  const seedNode = model.doc.resolve('statusUniqueIDGenerator_/idSeed_');
  const seed = idSeed ? new DataView(idSeed.payload.buffer).getBigInt64(0, true) : seedNode ? readSigned(model.doc, seedNode) : 0n;
  const animalLeaves = new Map(changes.filter(change => { const list = model.doc.resolve('livestockList_'); return list && change.field.offset >= list.offset && change.field.offset < list.end; }).map(change => [change.field.offset, payloadFor(model.doc, change.field, change.after)]));
  const livestock = buildAnimalEdits(model.doc, animalEdits, animalLeaves, seed);
  livestock.subtrees.forEach((node, offset) => subtrees.set(offset, node));
  const progression = buildProgressEdits(model.doc, progress);
  processing.subtrees.forEach((node, offset) => subtrees.set(offset, node));
  progression.subtrees.forEach((node, offset) => subtrees.set(offset, node));
  for (const offset of subtrees.keys()) {
    const node = model.doc.node(offset);
    if ([...model.aliasTargets].some(target => target >= node.offset && target < node.end)) throw new Error(`格子 0x${offset.toString(16)} 被其他指针引用，不能替换。`);
  }
  const replaced = [...subtrees.keys()].map((offset) => model.doc.node(offset));
  const shadowed = (offset: number): boolean =>
    replaced.some((node) => offset >= node.offset && offset < node.end);

  const payloads = new Map<number, Uint8Array>([...progression.payloads, ...processing.payloads]);
  for (const change of changes) {
    if (shadowed(change.field.offset)) continue;
    if (payloads.has(change.field.offset)) throw new Error('同一解锁记录同时在完整字段树和解锁页面被修改，请先撤销其中一项。');
    // Cross-field validation above uses the pending maximum. Do not reject a
    // current value merely because it exceeds the original maximum.
    const isCurrentStatus = ['hp_', 'st_'].some(key => model.doc.resolve(`pPlayerStatus_/p/${key}/this->value_`)?.offset === change.field.offset);
    payloads.set(change.field.offset, payloadFor(model.doc, isCurrentStatus ? { ...change.field, max: undefined } : change.field, change.after));
  }
  if (idSeed) payloads.set(idSeed.offset, idSeed.payload);
  if (livestock.seed !== seed) { if (!seedNode) throw new Error('存档缺少唯一 ID 生成器。'); payloads.set(seedNode.offset, encodeSigned(livestock.seed, seedNode.size)); }
  const ser = serializeSer(model.doc, { payloads, subtrees });
  if (ser.length > model.save.data.length) {
    throw new Error(`改动后的数据 ${ser.length} 字节，超过了存档缓冲区的 ${model.save.data.length} 字节。`);
  }
  const buffer = new Uint8Array(model.save.data.length);
  buffer.set(ser);
  const packed = encodeSave(model.save, buffer);
  // Read the export back through the same parser before handing it to the user.
  const verified = new SerDocument(decodeSave(packed, model.save.fileName).data);
  if (verified.usedSize !== ser.length) throw new Error('导出校验失败：SER 数据长度不一致。');
  return packed;
}
