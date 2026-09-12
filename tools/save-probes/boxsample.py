import pathlib
import struct
import sys, json, collections
from ser2 import load
s = load(sys.argv[1] if len(sys.argv) > 1 else "save.004")
names = json.load(open(str(pathlib.Path(__file__).resolve().parents[2] / "public" / "save-editor-names.json"), encoding="utf-8"))["names"]["items"]
def kid(n,name):
    for k in s.children(n):
        if k.name==name: return k
def i64(n): return struct.unpack_from("<q", s.raw(n),0)[0]
def i32(n): return struct.unpack_from("<i", s.raw(n),0)[0]
def txt(n):
    b=s.raw(n); ln=struct.unpack_from("<I",b,0)[0]; return b[4:4+ln].decode("utf-8","replace")
gl = kid(s.root,"gimmickList_")
seen = collections.OrderedDict()
for i,ptr in enumerate(s.children(gl)):
    ps=[k for k in s.children(ptr) if k.tag==2]
    if not ps: continue
    p=ps[0]
    il=kid(p,"itemList_")
    if il is None or il.count==0: continue
    did=i64(kid(kid(p,"pData_"),"dataID"))
    items=[]
    for c in s.children(il):
        cp=[k for k in s.children(c) if k.tag==2]
        if not cp: continue
        o=cp[0]
        iid=i64(kid(kid(o,"pData_"),"dataID"))
        cnt=i32(kid(kid(o,"stackCount_"),"this->value_"))
        items.append((names.get(str(iid), str(iid)), cnt))
    key=(did, il.count)
    if key not in seen:
        seen[key]=(i, txt(kid(p,"name_")) if kid(p,"name_") else None, items[:4])
for k,v in sorted(seen.items()):
    print(k, v)
