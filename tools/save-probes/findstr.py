import struct
import sys
from ser2 import load, NODELIST

s = load(sys.argv[1] if len(sys.argv) > 1 else "save.004")
needle = sys.argv[2] if len(sys.argv) > 2 else "材料"

hits = []


def walk(n, path):
    if n.tag == 5:
        b = s.raw(n)
        ln = struct.unpack_from("<I", b, 0)[0]
        text = b[4:4 + ln].decode("utf-8", "replace")
        if needle in text:
            hits.append((path + "/" + n.name, text, hex(n.hdr)))
    if n.tag in NODELIST:
        for k in s.children(n):
            walk(k, path + "/" + n.name)


walk(s.root, "")
for h in hits:
    print(h)
print("total", len(hits))
