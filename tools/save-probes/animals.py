import pathlib
import struct
import sys, json
from ser2 import load
s = load(sys.argv[1] if len(sys.argv) > 1 else "save.004")
names = json.load(open(str(pathlib.Path(__file__).resolve().parents[2] / "public" / "save-editor-names.json"), encoding="utf-8"))
LN = names["names"]["livestock"]
W = {1:"<b",2:"<h",4:"<i",8:"<q"}
def kid(n,nm):
    for k in s.children(n):
        if k.name==nm: return k
def num(n):
    b=s.raw(n); return struct.unpack_from(W[len(b)],b,0)[0]
def txt(n):
    b=s.raw(n); ln=struct.unpack_from("<I",b,0)[0]; return b[4:4+ln].decode("utf-8","replace")
lst = kid(s.root,"livestockList_")
print("livestockList_ count", lst.count)
for i,ptr in enumerate(s.children(lst)):
    p=[k for k in s.children(ptr) if k.tag==2][0]
    d=num(kid(kid(p,"pData_"),"dataID"))
    pl=num(kid(kid(p,"pPlacementData_"),"dataID"))
    bp=kid(p,"basePos_")
    x=num(kid(bp,"x")); y=num(kid(bp,"y"))
    fx=struct.unpack("<f",struct.pack("<i",x))[0]; fy=struct.unpack("<f",struct.pack("<i",y))[0]
    print(f" #{i} {txt(kid(p,'name_')):8} kind={d:4} {LN.get(str(d),'?'):6} placement={pl:5} love={num(kid(kid(p,'loveRate_'),'this->value_')):5} mood={num(kid(kid(p,'moodRate_'),'this->value_')):4} grow={num(kid(p,'growStatus_'))} basePos=({fx:.0f},{fy:.0f})")
