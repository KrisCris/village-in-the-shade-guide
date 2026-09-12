import struct
import sys, sys, collections
from ser2 import load, NODELIST

s = load(sys.argv[1] if len(sys.argv) > 1 else "save.004")

def kid(n, name):
    for k in s.children(n):
        if k.name == name:
            return k
    return None

def i64(n):
    return struct.unpack_from("<q", s.raw(n), 0)[0]

def txt(n):
    b = s.raw(n)
    ln = struct.unpack_from("<I", b, 0)[0]
    return b[4:4+ln].decode("utf-8", "replace")

gl = kid(s.root, "gimmickList_")
print("gimmickList_ count", gl.count, "children", len(s.children(gl)))
kinds = collections.Counter()
boxes = []
for i, ptr in enumerate(s.children(gl)):
    kids = s.children(ptr)
    p = None
    cls = None
    for k in kids:
        if k.name == "className":
            cls = txt(k)
        if k.tag == 2:
            p = k
    if p is None:
        kinds[("null", None)] += 1
        continue
    data = kid(p, "pData_")
    did = i64(kid(data, "dataID")) if data else None
    il = kid(p, "itemList_")
    kinds[(cls, did if il is not None else None)] += 1
    if il is not None:
        nm = kid(p, "name_")
        occupied = sum(1 for c in s.children(il) if s.children(c))
        boxes.append((i, cls, did, il.count, occupied, txt(nm) if nm else None))

print("\n-- gimmick kinds (className, dataID-if-has-itemList) --")
for k, v in kinds.most_common(40):
    print(" ", k, v)
print("\n-- gimmicks with itemList_ --")
for b in boxes:
    print(" idx=%d class=%s dataID=%s slots=%s used=%s name=%r" % b)
print("total boxes", len(boxes))
