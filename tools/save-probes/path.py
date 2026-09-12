"""Dump a node by slash-path, e.g. path.py save.003 inventoryItemList_/0/p 3"""
import sys
import struct
from ser2 import load, NODELIST

s = load(sys.argv[1])
target = sys.argv[2]
DEPTH = int(sys.argv[3]) if len(sys.argv) > 3 else 2
MAXKIDS = int(sys.argv[4]) if len(sys.argv) > 4 else 60


def scalar(n):
    b = s.raw(n)
    if n.tag == 5:
        ln = struct.unpack_from("<I", b, 0)[0]
        return repr(b[4:4 + ln].decode("utf-8", "replace"))
    if n.tag == 0:
        if len(b) == 1:
            return str(b[0])
        if len(b) == 2:
            return str(struct.unpack_from("<H", b, 0)[0])
        if len(b) == 4:
            return f"i32={struct.unpack_from('<i',b,0)[0]} f32={struct.unpack_from('<f',b,0)[0]:g}"
        if len(b) == 8:
            return f"i64={struct.unpack_from('<q',b,0)[0]} f64={struct.unpack_from('<d',b,0)[0]:g}"
    return b[:32].hex()


def walk(n, depth):
    pad = "  " * depth
    extra = "" if n.count is None else f" ref/count={n.count}"
    val = "" if n.tag in NODELIST else " = " + scalar(n)
    print(f"{pad}[{n.tag}] {n.name} @{n.hdr:#x} size={n.size}{extra}{val}")
    if depth >= DEPTH:
        return
    for i, k in enumerate(s.children(n)):
        if i >= MAXKIDS:
            print(pad + "  ...")
            break
        walk(k, depth + 1)


node = s.root
if target:
    for part in target.split("/"):
        kids = s.children(node)
        match = None
        for k in kids:
            if k.name == part:
                match = k
                break
        if match is None and part.isdigit():
            match = kids[int(part)]
        if match is None:
            raise SystemExit(f"no child {part!r} in {node.name}; have {[k.name for k in kids][:40]}")
        node = match
walk(node, 0)
