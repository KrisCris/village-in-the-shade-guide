import struct
import sys
from ser2 import load, NODELIST
s = load(sys.argv[1] if len(sys.argv) > 1 else "save.004")
owners = {}
aliases = []
def walk(n, path):
    if n.tag == 4:
        if n.count not in (0xFFFFFFFF, n.hdr):
            aliases.append((path + "/" + n.name, hex(n.hdr), hex(n.count)))
    owners[n.hdr] = path + "/" + n.name
    if n.tag in NODELIST:
        for k in s.children(n):
            walk(k, path + "/" + n.name)
walk(s.root, "")
for a in aliases:
    print("alias", a, "-> target:", owners.get(int(a[2],16)))
print("total aliases", len(aliases))
