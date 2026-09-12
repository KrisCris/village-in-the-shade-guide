"""Decode every statusValueMap_ / statusIDValueMap_ key in a save."""
import struct
import sys
import collections
from ser2 import load, NODELIST

s = load(sys.argv[1] if len(sys.argv) > 1 else "save.004")

WIDTH = {1: "<b", 2: "<h", 4: "<i", 8: "<q"}


def kid(n, name):
    for k in s.children(n):
        if k.name == name:
            return k


def num(n):
    b = s.raw(n)
    return struct.unpack_from(WIDTH[len(b)], b, 0)[0] if len(b) in WIDTH else None


def tag(n):
    """A status key is an object holding one i64 of packed ASCII."""
    idn = kid(n, "id_")
    if idn is None:
        return None
    raw = struct.pack("<Q", num(idn) & 0xFFFFFFFFFFFFFFFF)
    return raw.decode("ascii", "replace").rstrip("\x00")


# owner path -> map name -> {key: Counter(values)}
seen = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(collections.Counter)))


def owner_of(path):
    parts = [p for p in path.split("/") if p and not p.isdigit() and p != "p"]
    return "/".join(parts[1:3]) or "SAVEDATA"


def walk(n, path):
    if n.tag == 3 and n.name in ("statusValueMap_", "statusIDValueMap_", "statusTableValueMap_"):
        kids = s.children(n)
        for i in range(0, len(kids) - 1, 2):
            k, v = kids[i], kids[i + 1]
            name = tag(k)
            if name is None:
                continue
            seen[owner_of(path)][n.name][name][num(v)] += 1
        return
    if n.tag in NODELIST:
        for k in s.children(n):
            walk(k, path + "/" + n.name)


walk(s.root, "")
for owner in sorted(seen):
    print("==", owner)
    for mapname in sorted(seen[owner]):
        for key in sorted(seen[owner][mapname]):
            counts = seen[owner][mapname][key]
            vals = sorted(counts)
            span = f"{vals[0]}..{vals[-1]}" if len(vals) > 1 else str(vals[0])
            print(f"   {mapname:22} {key:12} n={sum(counts.values()):5} distinct={len(vals):4} {span}")
