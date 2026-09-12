import struct
import sys
from ser2 import load
s = load(sys.argv[1] if len(sys.argv) > 1 else "save.004")
W={1:"<b",2:"<h",4:"<i",8:"<q"}
def kid(n,nm):
    for k in s.children(n):
        if k.name==nm: return k
def num(n):
    b=s.raw(n); return struct.unpack_from(W[len(b)],b,0)[0]
def tagname(n):
    idn=kid(n,"id_")
    if idn is None: return None
    return struct.pack("<Q",num(idn)&0xFFFFFFFFFFFFFFFF).decode("ascii","replace").rstrip("\x00")
gv=kid(s.root,"gameValues_")
print("gameValues_ count",gv.count)
kids=s.children(gv)
for i in range(0,len(kids)-1,2):
    k,v=kids[i],kids[i+1]
    name=tagname(k) or ("str:"+repr(s.raw(k)[:16]))
    parts=[]
    for c in s.children(v):
        parts.append(f"{c.name}={num(c)}")
    print(f"  {name:12} {' '.join(parts)}")
