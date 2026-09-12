/**
 * Reader and writer for the `SER` container that holds the decompressed save.
 *
 * Container layout (little endian):
 *   0x00  "SER\0"
 *   0x04  u32 reserved (0 in every observed save)
 *   0x08  u32 used size — header + node tree + name table
 *   0x0c  u32 offset of the name table
 *   0x10  the root node
 *
 * A node is `[tag:u8][nameOffset:u32][size:u32]`, then — for the counted tags —
 * a u32 `ref`, then `size` payload bytes. `size` never covers the `ref` word, so
 * a node spans `9 + (counted ? 4 : 0) + size` bytes. `nameOffset` indexes the
 * NUL-terminated name table that follows the tree.
 *
 * Verified against `tests/gamesave/save.001`–`save.005` and `.systemsave`: each
 * one parses to the last byte and re-serializes byte for byte.
 */

export const SER_MAGIC = 'SER\0';

export const SerTag = {
  /** Fixed-width number or opaque bytes; width 1, 2, 4 or 8 in practice. */
  Scalar: 0,
  /** Counted array of fixed-width elements stored as one flat byte run. */
  Blob: 1,
  /** Object; the payload is a plain sequence of child nodes. */
  Object: 2,
  /** Array or map; `ref` counts elements (a map stores two children per entry). */
  List: 3,
  /**
   * Pointer. `ref` is the node's own offset when it owns the pointee, the
   * offset of the node that owns it when it aliases one, or 0xffffffff for
   * null. Children are the pointee — optionally preceded by a `className`
   * string when the pointer is polymorphic.
   */
  Pointer: 4,
  /** String: `[length:u32][utf-8 bytes][NUL]`. */
  String: 5,
} as const;

export const NULL_REF = 0xffffffff;

const COUNTED_TAGS = new Set<number>([SerTag.Blob, SerTag.List, SerTag.Pointer]);
const NODE_LIST_TAGS = new Set<number>([SerTag.Object, SerTag.List, SerTag.Pointer]);
const HEADER_SIZE = 9;

export interface SerNode {
  /** Offset of the node header; unique, and used as the node's identity. */
  readonly offset: number;
  readonly tag: number;
  readonly nameOffset: number;
  readonly name: string;
  /** Payload length in bytes, excluding the `ref` word. */
  readonly size: number;
  /** Offset of the first payload byte. */
  readonly body: number;
  /** Offset just past the node. */
  readonly end: number;
  /** The counted-tag word, or -1 when the tag carries none. */
  readonly ref: number;
}

export function isNodeList(tag: number): boolean {
  return NODE_LIST_TAGS.has(tag);
}

export function isCounted(tag: number): boolean {
  return COUNTED_TAGS.has(tag);
}

export class SerDocument {
  readonly data: Uint8Array;
  readonly view: DataView;
  readonly usedSize: number;
  readonly namesOffset: number;
  readonly root: SerNode;
  private readonly childCache = new Map<number, SerNode[]>();

  constructor(data: Uint8Array) {
    if (data.length < 0x19 || data[0] !== 0x53 || data[1] !== 0x45 || data[2] !== 0x52 || data[3] !== 0x00) {
      throw new Error('解压后的数据不是 SER 容器。');
    }
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.usedSize = this.view.getUint32(0x08, true);
    this.namesOffset = this.view.getUint32(0x0c, true);
    if (this.namesOffset < 0x19 || this.namesOffset > this.usedSize || this.usedSize > data.length) {
      throw new Error('SER 头部的长度或名称表偏移无效。');
    }
    this.root = this.node(0x10);
    if (this.root.end !== this.namesOffset) {
      throw new Error('SER 根节点的长度与名称表偏移不一致。');
    }
  }

  /** Read the NUL-terminated name at `offset` inside the name table. */
  name(offset: number): string {
    const start = this.namesOffset + offset;
    if (offset < 0 || start >= this.usedSize) throw new Error(`名称偏移 ${offset} 越界。`);
    let end = start;
    while (end < this.usedSize && this.data[end] !== 0) end++;
    return new TextDecoder('utf-8', { fatal: false }).decode(this.data.subarray(start, end));
  }

  node(offset: number): SerNode {
    if (offset + HEADER_SIZE > this.namesOffset) throw new Error(`SER 节点头 @${offset} 越界。`);
    const tag = this.data[offset];
    if (tag > SerTag.String) throw new Error(`未知的 SER 节点类型 ${tag} @${offset}。`);
    const nameOffset = this.view.getUint32(offset + 1, true);
    const size = this.view.getUint32(offset + 5, true);
    const counted = COUNTED_TAGS.has(tag);
    const ref = counted ? this.view.getUint32(offset + HEADER_SIZE, true) : -1;
    const body = offset + HEADER_SIZE + (counted ? 4 : 0);
    const end = body + size;
    if (end > this.namesOffset) throw new Error(`SER 节点 @${offset} 的长度 ${size} 越界。`);
    return { offset, tag, nameOffset, name: this.name(nameOffset), size, body, end, ref };
  }

  children(node: SerNode): SerNode[] {
    if (!NODE_LIST_TAGS.has(node.tag)) return [];
    const cached = this.childCache.get(node.offset);
    if (cached) return cached;
    const result: SerNode[] = [];
    let cursor = node.body;
    while (cursor < node.end) {
      const child = this.node(cursor);
      if (child.end > node.end) throw new Error(`SER 子节点 @${cursor} 超出父节点 @${node.offset}。`);
      result.push(child);
      cursor = child.end;
    }
    this.childCache.set(node.offset, result);
    return result;
  }

  payload(node: SerNode): Uint8Array {
    return this.data.subarray(node.body, node.end);
  }

  /** Find a child by name, or by index when `segment` is `#N`. */
  child(node: SerNode, segment: string): SerNode | undefined {
    const list = this.children(node);
    if (segment.startsWith('#')) return list[Number(segment.slice(1))];
    return list.find((candidate) => candidate.name === segment);
  }

  /** Resolve a `/`-separated path such as `livestockList_/#0/p/name_`. */
  resolve(path: string, from: SerNode = this.root): SerNode | undefined {
    let node: SerNode | undefined = from;
    for (const segment of path.split('/')) {
      if (!node || !segment) return undefined;
      node = this.child(node, segment);
    }
    return node;
  }
}

/* ---------------------------------------------------------------- values -- */

export function readSigned(doc: SerDocument, node: SerNode): bigint {
  switch (node.size) {
    case 1: return BigInt(doc.view.getInt8(node.body));
    case 2: return BigInt(doc.view.getInt16(node.body, true));
    case 4: return BigInt(doc.view.getInt32(node.body, true));
    case 8: return doc.view.getBigInt64(node.body, true);
    default: throw new Error(`${node.name} 不是 1/2/4/8 字节的整数字段。`);
  }
}

export function encodeSigned(value: bigint, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  const view = new DataView(out.buffer);
  switch (byteLength) {
    case 1: view.setInt8(0, Number(value)); break;
    case 2: view.setInt16(0, Number(value), true); break;
    case 4: view.setInt32(0, Number(value), true); break;
    case 8: view.setBigInt64(0, value, true); break;
    default: throw new Error(`不支持 ${byteLength} 字节的整数字段。`);
  }
  return out;
}

export function signedRange(byteLength: number): { min: bigint; max: bigint } {
  const bits = BigInt(byteLength * 8 - 1);
  return { min: -(1n << bits), max: (1n << bits) - 1n };
}

export function readFloat(doc: SerDocument, node: SerNode): number {
  if (node.size === 4) return doc.view.getFloat32(node.body, true);
  if (node.size === 8) return doc.view.getFloat64(node.body, true);
  throw new Error(`${node.name} 不是 4/8 字节的浮点字段。`);
}

export function encodeFloat(value: number, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  const view = new DataView(out.buffer);
  if (byteLength === 4) view.setFloat32(0, value, true);
  else if (byteLength === 8) view.setFloat64(0, value, true);
  else throw new Error(`不支持 ${byteLength} 字节的浮点字段。`);
  return out;
}

export function readString(doc: SerDocument, node: SerNode): string {
  if (node.tag !== SerTag.String) throw new Error(`${node.name} 不是字符串节点。`);
  if (node.size < 5) return '';
  const length = doc.view.getUint32(node.body, true);
  if (4 + length + 1 !== node.size) throw new Error(`${node.name} 的字符串长度前缀与节点长度不符。`);
  return new TextDecoder('utf-8', { fatal: false }).decode(doc.data.subarray(node.body + 4, node.body + 4 + length));
}

/** Build a string payload; the encoder handles the length change for us. */
export function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.includes(0)) throw new Error('字符串不能包含空字节。');
  const out = new Uint8Array(4 + bytes.length + 1);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

/* ----------------------------------------------------------- serializing -- */

/** Payload replacements keyed by node header offset in the source document. */
export type SerEdits = ReadonlyMap<number, Uint8Array>;

/**
 * A node built in memory instead of read from the document, used to fill an
 * empty inventory slot or to clear an occupied one. `pointer` only applies to
 * tag 4: `'self'` means the node owns the children that follow it, `'null'` is
 * an empty slot, and a number aliases a node by its offset in the source
 * document.
 */
export interface SerBuiltNode {
  tag: number;
  nameOffset: number;
  /** Carried along so `builtChild` can address fields by name. */
  name?: string;
  /** Element count for tags 1 and 3; defaults to the child count. */
  ref?: number;
  pointer?: 'self' | 'null' | number;
  payload?: Uint8Array;
  children?: SerBuiltNode[];
}

/**
 * Whole-node replacements keyed by the header offset of the node they stand in
 * for. The replacement keeps that node's place in its parent's child list.
 */
export type SerSubtrees = ReadonlyMap<number, SerBuiltNode>;

export interface SerEditSet {
  readonly payloads?: SerEdits;
  readonly subtrees?: SerSubtrees;
}

const EMPTY_MAP = new Map<number, never>();

function normalize(edits: SerEdits | SerEditSet): { payloads: SerEdits; subtrees: SerSubtrees } {
  const set = edits instanceof Map ? { payloads: edits as SerEdits } : (edits as SerEditSet);
  return { payloads: set.payloads ?? EMPTY_MAP, subtrees: set.subtrees ?? EMPTY_MAP };
}

/** Copy a subtree into the in-memory form so its fields can be patched. */
export function captureBuilt(doc: SerDocument, node: SerNode): SerBuiltNode {
  const base = { tag: node.tag, nameOffset: node.nameOffset, name: node.name };
  if (!NODE_LIST_TAGS.has(node.tag)) {
    return { ...base, payload: Uint8Array.from(doc.payload(node)) };
  }
  const children = doc.children(node).map((child) => captureBuilt(doc, child));
  if (node.tag === SerTag.Pointer) {
    const pointer = node.ref === NULL_REF ? 'null' : node.ref === node.offset ? 'self' : node.ref;
    return { ...base, pointer, children };
  }
  return { ...base, ref: node.ref >= 0 ? node.ref : undefined, children };
}

/** An empty slot: a null pointer carrying the same field name as the node it replaces. */
export function nullPointer(nameOffset: number, name?: string): SerBuiltNode {
  return { tag: SerTag.Pointer, nameOffset, name, pointer: 'null', children: [] };
}

/** Find a descendant of a built node by `/`-separated child names. */
export function builtChild(node: SerBuiltNode, path: string): SerBuiltNode | undefined {
  let current: SerBuiltNode | undefined = node;
  for (const segment of path.split('/')) {
    if (!current || !segment) return undefined;
    current = current.children?.find((child) => child.name === segment);
  }
  return current;
}

interface Plan {
  size: Map<number, number>;
  offset: Map<number, number>;
  builtSize: Map<SerBuiltNode, number>;
  builtOffset: Map<SerBuiltNode, number>;
  namesOffset: number;
}

function span(tag: number, size: number): number {
  return HEADER_SIZE + (COUNTED_TAGS.has(tag) ? 4 : 0) + size;
}

function measureBuilt(node: SerBuiltNode, into: Map<SerBuiltNode, number>): number {
  let value = 0;
  if (NODE_LIST_TAGS.has(node.tag)) {
    for (const child of node.children ?? []) value += span(child.tag, measureBuilt(child, into));
  } else {
    value = node.payload?.length ?? 0;
  }
  into.set(node, value);
  return value;
}

function planSizes(doc: SerDocument, payloads: SerEdits, subtrees: SerSubtrees) {
  const size = new Map<number, number>();
  const builtSize = new Map<SerBuiltNode, number>();
  const measure = (node: SerNode): number => {
    const built = subtrees.get(node.offset);
    if (built) {
      const replaced = measureBuilt(built, builtSize);
      size.set(node.offset, replaced);
      return replaced;
    }
    let value: number;
    if (NODE_LIST_TAGS.has(node.tag)) {
      value = 0;
      for (const child of doc.children(node)) {
        value += span(subtrees.get(child.offset)?.tag ?? child.tag, measure(child));
      }
    } else {
      value = payloads.get(node.offset)?.length ?? node.size;
    }
    size.set(node.offset, value);
    return value;
  };
  measure(doc.root);
  return { size, builtSize };
}

function planOffsets(
  doc: SerDocument,
  size: Map<number, number>,
  builtSize: Map<SerBuiltNode, number>,
  subtrees: SerSubtrees,
): Plan {
  const offset = new Map<number, number>();
  const builtOffset = new Map<SerBuiltNode, number>();

  const assignBuilt = (node: SerBuiltNode, position: number): number => {
    builtOffset.set(node, position);
    const body = position + HEADER_SIZE + (COUNTED_TAGS.has(node.tag) ? 4 : 0);
    if (NODE_LIST_TAGS.has(node.tag)) {
      let cursor = body;
      for (const child of node.children ?? []) cursor = assignBuilt(child, cursor);
    }
    return body + (builtSize.get(node) as number);
  };

  const assign = (node: SerNode, position: number): number => {
    offset.set(node.offset, position);
    const built = subtrees.get(node.offset);
    if (built) return assignBuilt(built, position);
    const body = position + HEADER_SIZE + (COUNTED_TAGS.has(node.tag) ? 4 : 0);
    if (NODE_LIST_TAGS.has(node.tag)) {
      let cursor = body;
      for (const child of doc.children(node)) cursor = assign(child, cursor);
    }
    return body + (size.get(node.offset) as number);
  };

  return { size, offset, builtSize, builtOffset, namesOffset: assign(doc.root, 0x10) };
}

/**
 * Re-serialize the document with `edits` applied. Payload lengths may change and
 * whole nodes may be swapped out, so every node offset is recomputed and every
 * pointer `ref` is rewritten to match. That is what lets a name be replaced by
 * one of a different byte length, and an empty slot be filled with a real item.
 */
export function serializeSer(doc: SerDocument, edits: SerEdits | SerEditSet): Uint8Array {
  const { payloads, subtrees } = normalize(edits);
  const { size, builtSize } = planSizes(doc, payloads, subtrees);
  const plan = planOffsets(doc, size, builtSize, subtrees);
  const oldNames = doc.data.subarray(doc.namesOffset, doc.usedSize);
  const extraNames: Uint8Array[] = [];
  const named = new Map<string, number>();
  for (let at = 0; at < oldNames.length;) {
    const terminator = oldNames.indexOf(0, at);
    const end = terminator < 0 ? oldNames.length : terminator;
    named.set(new TextDecoder().decode(oldNames.subarray(at, end)), at);
    at = end + 1;
  }
  let namesLength = oldNames.length;
  const builtNames = new Map<SerBuiltNode, number>();
  const registerNames = (node: SerBuiltNode): void => {
    if (node.nameOffset < 0) {
      if (!node.name || node.name.includes('\0')) throw new Error('新建节点名称无效。');
      let offset = named.get(node.name);
      if (offset === undefined) {
        // The last name in a real save may end at EOF, without a NUL.
        if (!extraNames.length && oldNames.length && oldNames.at(-1) !== 0) {
          extraNames.push(new Uint8Array([0])); namesLength++;
        }
        offset = namesLength;
        const bytes = new TextEncoder().encode(`${node.name}\0`);
        extraNames.push(bytes); namesLength += bytes.length; named.set(node.name, offset);
      }
      builtNames.set(node, offset);
    }
    node.children?.forEach(registerNames);
  };
  subtrees.forEach(registerNames);
  const nameTable = new Uint8Array(namesLength);
  nameTable.set(oldNames);
  let nameCursor = oldNames.length;
  for (const bytes of extraNames) { nameTable.set(bytes, nameCursor); nameCursor += bytes.length; }
  const total = plan.namesOffset + nameTable.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x53, 0x45, 0x52, 0x00], 0);
  view.setUint32(0x04, 0, true);
  view.setUint32(0x08, total, true);
  view.setUint32(0x0c, plan.namesOffset, true);

  /** A pointer `ref` names a node by its old offset; look up where it landed. */
  const remap = (ref: number, label: string): number => {
    if (ref === NULL_REF) return ref;
    const moved = plan.offset.get(ref);
    if (moved === undefined) throw new Error(`指针 ${label} 引用了未知偏移 ${ref}。`);
    return moved;
  };

  const emitBuilt = (node: SerBuiltNode): void => {
    const at = plan.builtOffset.get(node) as number;
    out[at] = node.tag;
    view.setUint32(at + 1, builtNames.get(node) ?? node.nameOffset, true);
    view.setUint32(at + 5, plan.builtSize.get(node) as number, true);
    let cursor = at + HEADER_SIZE;
    if (COUNTED_TAGS.has(node.tag)) {
      let ref: number;
      if (node.tag === SerTag.Pointer) {
        const pointer = node.pointer ?? 'null';
        ref = pointer === 'null' ? NULL_REF : pointer === 'self' ? at : remap(pointer, node.name ?? '新建节点');
      } else {
        ref = node.ref ?? (node.children?.length ?? 0);
      }
      view.setUint32(cursor, ref, true);
      cursor += 4;
    }
    if (NODE_LIST_TAGS.has(node.tag)) {
      for (const child of node.children ?? []) emitBuilt(child);
    } else if (node.payload) {
      out.set(node.payload, cursor);
    }
  };

  const emit = (node: SerNode): void => {
    const built = subtrees.get(node.offset);
    if (built) {
      emitBuilt(built);
      return;
    }
    const at = plan.offset.get(node.offset) as number;
    out[at] = node.tag;
    view.setUint32(at + 1, node.nameOffset, true);
    view.setUint32(at + 5, plan.size.get(node.offset) as number, true);
    let cursor = at + HEADER_SIZE;
    if (COUNTED_TAGS.has(node.tag)) {
      const ref = node.tag === SerTag.Pointer ? remap(node.ref, node.name) : node.ref;
      view.setUint32(cursor, ref, true);
      cursor += 4;
    }
    if (NODE_LIST_TAGS.has(node.tag)) {
      for (const child of doc.children(node)) emit(child);
    } else {
      out.set(payloads.get(node.offset) ?? doc.payload(node), cursor);
    }
  };

  emit(doc.root);
  out.set(nameTable, plan.namesOffset);
  return out;
}
