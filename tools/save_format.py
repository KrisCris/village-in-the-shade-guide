"""Reference implementation of the game's save format, independent of the web
editor, for verifying it against real files.

    python tools/save_format.py verify tests/gamesave/save.00*
    python tools/save_format.py dump tests/gamesave/save.003 --depth 2
    python tools/save_format.py dump tests/gamesave/save.003 --path livestockList_/0/p
    python tools/save_format.py get tests/gamesave/save.003 money_/this->value_

Container: `YKCMP_V1`, compression type 8 = one raw LZ4 block.
  0x00 magic, 0x08 u32 type, 0x0c u32 end of compressed data,
  0x10 u32 decompressed length, 0x14 the block.

Payload: `SER\\0`, then a node tree and a name table.
  0x00 magic, 0x04 u32 reserved, 0x08 u32 used size, 0x0c u32 name-table offset,
  0x10 the root node.
Node: [tag u8][nameOffset u32][size u32], then a u32 `ref` for tags 1/3/4, then
`size` payload bytes. `size` never covers `ref`.
  0 scalar   fixed-width number or opaque bytes
  1 blob     `ref` elements in one flat byte run
  2 object   payload is a sequence of child nodes
  3 list     `ref` elements; a map stores key and value as two children each
  4 pointer  `ref` is the node's own offset, the offset of the node it aliases,
             or 0xffffffff for null; children are the pointee, optionally
             preceded by a `className` string
  5 string   [length u32][utf-8][NUL]

No dependencies: the LZ4 block codec is implemented here.
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

MAGIC = b"YKCMP_V1"
HEADER_SIZE = 0x14
COUNTED = {1, 3, 4}
NODE_LIST = {2, 3, 4}
NULL_REF = 0xFFFFFFFF
TAG_NAMES = {0: "scalar", 1: "blob", 2: "object", 3: "list", 4: "pointer", 5: "string"}


# --------------------------------------------------------------------- lz4 --

def lz4_decompress(src: bytes, size: int) -> bytes:
    out = bytearray(size)
    i = o = 0
    while i < len(src):
        token = src[i]
        i += 1
        literals = token >> 4
        if literals == 15:
            extra = 255
            while extra == 255:
                extra = src[i]
                i += 1
                literals += extra
        out[o:o + literals] = src[i:i + literals]
        i += literals
        o += literals
        if i >= len(src):
            break
        offset = src[i] | (src[i + 1] << 8)
        i += 2
        match = token & 0x0F
        if match == 15:
            extra = 255
            while extra == 255:
                extra = src[i]
                i += 1
                match += extra
        match += 4
        start = o - offset
        for k in range(match):
            out[o + k] = out[start + k]
        o += match
    if o != size:
        raise ValueError(f"lz4 output {o} != {size}")
    return bytes(out)


def _write_length(out: bytearray, length: int) -> None:
    if length < 15:
        return
    length -= 15
    while length >= 255:
        out.append(255)
        length -= 255
    out.append(length)


def lz4_compress(src: bytes) -> bytes:
    """Single-pass hash-chain encoder. Reserves the tail the block format
    requires: the last five bytes are literals, no match starts in the last
    twelve."""
    out = bytearray()
    table: dict[bytes, int] = {}
    anchor = 0
    i = 0
    match_limit = len(src) - 5
    search_limit = len(src) - 12
    while i < search_limit:
        key = src[i:i + 4]
        candidate = table.get(key, -1)
        table[key] = i
        if candidate < 0 or i - candidate > 0xFFFF:
            i += 1
            continue
        length = 4
        while i + length < match_limit and src[candidate + length] == src[i + length]:
            length += 1
        literals = i - anchor
        token_at = len(out)
        out.append(min(literals, 15) << 4)
        _write_length(out, literals)
        out += src[anchor:i]
        distance = i - candidate
        out.append(distance & 0xFF)
        out.append((distance >> 8) & 0xFF)
        out[token_at] |= min(length - 4, 15)
        _write_length(out, length - 4)
        start = i + 1
        i += length
        for p in range(start, min(i - 4, search_limit)):
            table[src[p:p + 4]] = p
        anchor = i
    literals = len(src) - anchor
    token_at = len(out)
    out.append(min(literals, 15) << 4)
    _write_length(out, literals)
    out += src[anchor:]
    return bytes(out)


# ----------------------------------------------------------------- ykcmp ----

def decode_save(raw: bytes) -> bytes:
    if raw[:8] != MAGIC:
        raise ValueError("not a YKCMP_V1 file")
    ctype, end, size = struct.unpack_from("<III", raw, 8)
    if ctype != 8:
        raise ValueError(f"unsupported compression type {ctype}")
    return lz4_decompress(raw[HEADER_SIZE:end], size)


def encode_save(data: bytes, original: bytes) -> bytes:
    size = struct.unpack_from("<I", original, 0x10)[0]
    if len(data) != size:
        raise ValueError(f"buffer must stay {size} bytes")
    block = lz4_compress(data)
    end = HEADER_SIZE + len(block)
    if end > len(original):
        raise ValueError(f"compressed {end} bytes does not fit {len(original)}")
    out = bytearray(len(original))
    out[:8] = MAGIC
    struct.pack_into("<III", out, 8, 8, end, size)
    out[HEADER_SIZE:end] = block
    if decode_save(bytes(out)) != data:
        raise ValueError("repack verification failed")
    return bytes(out)


# ------------------------------------------------------------------- ser ----

class Node:
    __slots__ = ("offset", "tag", "name_offset", "name", "size", "body", "end", "ref", "_kids")

    def __init__(self, offset, tag, name_offset, name, size, body, end, ref):
        self.offset, self.tag, self.name_offset, self.name = offset, tag, name_offset, name
        self.size, self.body, self.end, self.ref = size, body, end, ref
        self._kids = None

    def __repr__(self):
        return f"<{self.name} {TAG_NAMES.get(self.tag, self.tag)} @{self.offset:#x} size={self.size}>"


class Ser:
    def __init__(self, data: bytes):
        if data[:4] != b"SER\0":
            raise ValueError("not a SER blob")
        self.data = data
        self.used_size = struct.unpack_from("<I", data, 8)[0]
        self.names_offset = struct.unpack_from("<I", data, 0x0C)[0]
        self.root = self.node(0x10)
        if self.root.end != self.names_offset:
            raise ValueError("root node does not end at the name table")

    def name(self, offset: int) -> str:
        start = self.names_offset + offset
        return self.data[start:self.data.index(b"\0", start)].decode("utf-8", "replace")

    def node(self, offset: int) -> Node:
        tag = self.data[offset]
        if tag > 5:
            raise ValueError(f"unknown tag {tag} at {offset:#x}")
        name_offset, size = struct.unpack_from("<II", self.data, offset + 1)
        counted = tag in COUNTED
        ref = struct.unpack_from("<I", self.data, offset + 9)[0] if counted else -1
        body = offset + 9 + (4 if counted else 0)
        return Node(offset, tag, name_offset, self.name(name_offset), size, body, body + size, ref)

    def children(self, node: Node) -> list[Node]:
        if node.tag not in NODE_LIST:
            return []
        if node._kids is None:
            kids, cursor = [], node.body
            while cursor < node.end:
                child = self.node(cursor)
                kids.append(child)
                cursor = child.end
            if cursor != node.end:
                raise ValueError(f"children overrun in {node!r}")
            node._kids = kids
        return node._kids

    def payload(self, node: Node) -> bytes:
        return self.data[node.body:node.end]

    def resolve(self, path: str, node: Node | None = None) -> Node:
        node = node or self.root
        for part in filter(None, path.split("/")):
            kids = self.children(node)
            match = next((k for k in kids if k.name == part), None)
            if match is None and part.lstrip("#").isdigit():
                match = kids[int(part.lstrip("#"))]
            if match is None:
                raise KeyError(f"{part!r} not in {node.name}: {[k.name for k in kids][:20]}")
            node = match
        return node

    def value(self, node: Node):
        raw = self.payload(node)
        if node.tag == 5:
            length = struct.unpack_from("<I", raw, 0)[0]
            return raw[4:4 + length].decode("utf-8", "replace")
        if node.tag == 0 and len(raw) in (1, 2, 4, 8):
            return struct.unpack_from({1: "<b", 2: "<h", 4: "<i", 8: "<q"}[len(raw)], raw, 0)[0]
        return raw

    def serialize(self, edits: dict[int, bytes] | None = None) -> bytes:
        """Rewrite the tree with `edits` (node offset -> new payload) applied,
        recomputing every offset and pointer ref."""
        edits = edits or {}
        sizes: dict[int, int] = {}

        def measure(node: Node) -> int:
            if node.tag in NODE_LIST:
                total = sum(9 + (4 if k.tag in COUNTED else 0) + measure(k) for k in self.children(node))
            else:
                total = len(edits[node.offset]) if node.offset in edits else node.size
            sizes[node.offset] = total
            return total

        measure(self.root)
        moved: dict[int, int] = {}

        def assign(node: Node, position: int) -> int:
            moved[node.offset] = position
            body = position + 9 + (4 if node.tag in COUNTED else 0)
            cursor = body
            for kid in self.children(node):
                cursor = assign(kid, cursor)
            return body + sizes[node.offset]

        names_offset = assign(self.root, 0x10)
        table = self.data[self.names_offset:self.used_size]
        out = bytearray(names_offset + len(table))
        out[:4] = b"SER\0"
        struct.pack_into("<III", out, 4, 0, len(out), names_offset)

        def emit(node: Node) -> None:
            at = moved[node.offset]
            out[at] = node.tag
            struct.pack_into("<II", out, at + 1, node.name_offset, sizes[node.offset])
            cursor = at + 9
            if node.tag in COUNTED:
                ref = node.ref
                if node.tag == 4 and ref != NULL_REF:
                    ref = moved[ref]
                struct.pack_into("<I", out, cursor, ref)
                cursor += 4
            if node.tag in NODE_LIST:
                for kid in self.children(node):
                    emit(kid)
            else:
                data = edits.get(node.offset, self.payload(node))
                out[cursor:cursor + len(data)] = data

        emit(self.root)
        out[names_offset:] = table
        return bytes(out)


def encode_string(text: str) -> bytes:
    raw = text.encode("utf-8")
    return struct.pack("<I", len(raw)) + raw + b"\0"


def open_save(path: str) -> Ser:
    return Ser(decode_save(Path(path).read_bytes()))


# ------------------------------------------------------------------- cli ----

def cmd_verify(args) -> int:
    failures = 0
    for name in args.files:
        raw = Path(name).read_bytes()
        try:
            data = decode_save(raw)
            ser = Ser(data)
            rebuilt = ser.serialize()
            same = rebuilt == data[:ser.used_size]
            nodes = 0
            stack = [ser.root]
            while stack:
                node = stack.pop()
                nodes += 1
                stack.extend(ser.children(node))
            repacked = encode_save(data, raw)
            fits = len(repacked) == len(raw)
            print(f"{name}: root={ser.root.name} used={ser.used_size} nodes={nodes} "
                  f"roundtrip={'ok' if same else 'MISMATCH'} repack={'ok' if fits else 'BAD'}")
            failures += 0 if (same and fits) else 1
        except Exception as error:  # noqa: BLE001 - report and keep going
            print(f"{name}: FAILED {error}")
            failures += 1
    return 1 if failures else 0


def cmd_dump(args) -> int:
    ser = open_save(args.file)
    root = ser.resolve(args.path) if args.path else ser.root

    def walk(node: Node, depth: int) -> None:
        pad = "  " * depth
        extra = f" ref={node.ref}" if node.ref >= 0 else ""
        value = "" if node.tag in NODE_LIST else f" = {ser.value(node)!r}"
        print(f"{pad}[{TAG_NAMES.get(node.tag, node.tag)}] {node.name} @{node.offset:#x} "
              f"size={node.size}{extra}{value}")
        if depth < args.depth:
            for index, kid in enumerate(ser.children(node)):
                if index >= args.limit:
                    print(f"{pad}  … {len(ser.children(node)) - args.limit} more")
                    break
                walk(kid, depth + 1)

    walk(root, 0)
    return 0


def cmd_get(args) -> int:
    ser = open_save(args.file)
    print(ser.value(ser.resolve(args.path)))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    verify = sub.add_parser("verify", help="decode, re-serialize and repack each file")
    verify.add_argument("files", nargs="+")
    verify.set_defaults(func=cmd_verify)

    dump = sub.add_parser("dump", help="print the node tree")
    dump.add_argument("file")
    dump.add_argument("--path", default="", help="start at this node, e.g. livestockList_/0/p")
    dump.add_argument("--depth", type=int, default=1)
    dump.add_argument("--limit", type=int, default=40, help="children to show per node")
    dump.set_defaults(func=cmd_dump)

    get = sub.add_parser("get", help="print one leaf value")
    get.add_argument("file")
    get.add_argument("path")
    get.set_defaults(func=cmd_get)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
