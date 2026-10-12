"""Export native BU portrait models and atlases from resident_2.fad (read-only).

Output feeds tools/package-portraits.mjs; it is not part of the site build.
"""
from pathlib import Path
import argparse,struct,re,json
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.texture import decode_nltx_image
parser=argparse.ArgumentParser(description=__doc__)
add_game_dir(parser)
parser.add_argument('--output',type=Path,default=Path('.local/fairy-review'))
args=parser.parse_args()
a=FafullfsArchive.open(args.game_dir/'data/fairy_1_00.dat')
b=a.read_entry('data/fairy/resident_2.fad')
out=args.output;out.mkdir(parents=True,exist_ok=True)
base=struct.unpack_from('<I',b,52)[0];texture_ids=set();result=[]
# Index: named models (kind 2), `skip` other entries, then textures (kind 0).
# Texture resource r lives at index entry r+skip (old build: 244 models, new: 245).
index_end=struct.unpack_from('<I',b,96)[0];skip=struct.unpack_from('<I',b,20)[0]
first_texture=next(i for i,o in enumerate(range(80,index_end,32)) if struct.unpack_from('<I',b,o+12)[0]==0)
model_count=first_texture-skip
refs={i:b[80+i*32:88+i*32].split(b'\0')[0].decode('ascii',errors='replace') for i in range(model_count)}
for m in re.finditer(rb'BU_\d{4}\x00',b[:80+first_texture*32]):
 q=m.start();name=b[q:q+7].decode();size,_,offset=struct.unpack_from('<IIQ',b,q+8)
 s=b[offset+32:offset+size+16];na,nb,nc,nd=struct.unpack_from('<HHII',s,8)
 aa,bb,cc,dd=[x-32 for x in struct.unpack_from('<4I',s,32)]
 ep=struct.unpack_from('<I',s,56)[0]-32;ne=struct.unpack_from('<I',s,24)[0]
 sourceoff=base+struct.unpack_from('<I',b,offset+16)[0]
 source=b[sourceoff:sourceoff+100].split(b'\0')[0].decode('cp932')
 animations=[list(struct.unpack_from('<8I',s,aa+i*32)) for i in range(na)]
 nodes=[list(struct.unpack_from('<8i',s,cc+i*32)) for i in range(nc)]
 keys=[]
 for i in range(nd):
  p=dd+i*160;ints=struct.unpack_from('<40i',s,p);f=struct.unpack_from('<40f',s,p)
  keys.append(dict(resource=ints[0],time=ints[1],rect=f[4:8],transform=f[8:15],mesh=ints[36],order=struct.unpack_from('<h',s,p+14)[0],colors=f[16:32],flags=list(s[p+128:p+144])))
  if ints[0]>=model_count:texture_ids.add(ints[0])
 meshes=[dict(size=struct.unpack_from('<2i',s,ep+i*1328+1312),vertices=[struct.unpack_from('<4f',s,ep+i*1328+j*32) for j in range(41)]) for i in range(ne)]
 record=dict(name=name,source=source,animations=animations,nodes=nodes,keys=keys,meshes=meshes,refs=refs)
 (out/f'{name}.json').write_text(json.dumps(record,ensure_ascii=False),encoding='utf8')
 result.append(dict(name=name,source=source))
for t in sorted(texture_ids):
 p=struct.unpack_from('<I',b,80+(t+skip)*32+16)[0]+64
 target=out/f'tex-{t}.webp'
 decode_nltx_image(b[p:]).save(target,lossless=True)  # always refresh changed atlases
(out/'index.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf8')
(out/'layout.json').write_text(json.dumps(dict(model_count=model_count,skip=skip,first_texture=first_texture)),encoding='utf8')
print(len(result),'models',len(texture_ids),'atlases',model_count,skip,first_texture)
