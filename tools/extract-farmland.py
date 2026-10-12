"""Extract playable farming cells from build 25311578 YMWR heads, read-only.

Native verification: 0x1401CF660 scales terrain tile coordinates by 90 and adds
45. Callback 0x1401D2860 reads four u64 ground masks at +0x30, taking the
north/west/east/south edge centres, then divides coordinates by 45 and inserts
unique cell IDs (0x1401D28A2-0x1401D2987). Adjacent tile masks must agree.
GROUND_ELEMENT_ABLE_FARMING is bit 0 in mapgroundelement.dat.
"""
import argparse, hashlib, json, struct, zlib
from pathlib import Path
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

def farming_cells(blob):
    if blob.startswith(b'YKCMP_V1'): blob=zlib.decompress(blob[20:])
    header=struct.unpack_from('<19I',blob)
    assert header[4:6]==(0,0), 'Unreviewed preceding arrays'
    start=76+header[3]*72
    assert start+header[12]*112<=len(blob), 'Terrain array outside header'
    masks={}
    for i in range(header[12]):
        offset=start+i*112
        x,y=struct.unpack_from('<ii',blob,offset)
        for index,(dx,dy) in enumerate(((1,0),(0,1),(2,1),(1,2))):
            mask=struct.unpack_from('<Q',blob,offset+48+index*8)[0]
            # Orthogonal farming axes, rotated from the map's drawing axes.
            X,Y=2*x+dx,2*y+dy
            cell=((X+Y-1)//2,(Y-X-1)//2)
            farm=bool(mask&1)
            assert cell not in masks or masks[cell]==farm, 'Adjacent farming flags disagree'
            masks[cell]=farm
    return {cell for cell,farm in masks.items() if farm}

def components(cells):
    todo=set(cells);parts=[]
    while todo:
        part=[min(todo)];todo.remove(part[0])
        for x,y in part:
            for q in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if q in todo:todo.remove(q);part.append(q)
        parts.append(sorted(part))
    return sorted(parts,key=lambda p:(min(y for x,y in p),min(x for x,y in p)))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    add_game_dir(parser)
    parser.add_argument('--output',type=Path,default=Path('data/sources/game-farmland.json'))
    args=parser.parse_args();exe_hash=hashlib.sha256((args.game_dir/'village.exe').read_bytes()).hexdigest()
    assert exe_hash=='ac7d955baa915929b185df85cfa13f7e81ad57a9c68f308da769739775869a05', 'Unreviewed executable build'
    # Compatibility evidence comes from the previously committed catalog. These
    # cells are never counted as current terrain; saved plans use their origins.
    previous=json.loads(args.output.read_text(encoding='utf8')) if args.output.exists() else {}
    if previous.get('build_id')=='24969282':
        legacy_shapes=[dict(build_id='24969282', **{key:shape[key] for key in ('id','origin','map_ids','map','cells','sha256')}) for shape in previous['shapes']]
    else:
        legacy_shapes=previous.get('legacy_shapes',[])
    if not legacy_shapes:
        raise ValueError('Missing legacy farmland geometry; use the committed catalog as the output baseline')
    data=FafullfsArchive.open(args.game_dir/'data.dat');archive=FafullfsArchive.open(args.game_dir/'data/map_1_00.dat')
    rules=list(_string_groups(read_table(data.read_entry('data/database/mapgroundelement.dat'))))
    assert int(next(g[3] for g in rules if g[0]=='GROUND_ELEMENT_ABLE_FARMING'),2)==1
    references={}
    for group in _string_groups(read_table(data.read_entry('data/database/map.dat'))):
        for name in group[2:]:
            if name.endswith('.ymwr'): references.setdefault(name+'.head',[]).append(group[0])
    scanned=[];excluded=[];variants={};shapes=[]
    for entry in archive.entries():
        if not entry.name.endswith('.head'):continue
        raw=archive.read_entry(entry.name);cells=farming_cells(raw);scanned.append(entry.name)
        if not cells:continue
        if 'test' in entry.name.lower() or entry.name not in references:
            excluded.append(entry.name);continue
        canonical=entry.name.replace('_spr.','._season.').replace('_sum.','._season.').replace('_aut.','._season.').replace('_win.','._season.')
        if canonical in variants:
            assert variants[canonical]==cells, 'Seasonal farming geometry changed';continue
        variants[canonical]=cells
        for i,part in enumerate(components(cells)):
            min_x=min(x for x,y in part);min_y=min(y for x,y in part)
            max_x=max(x for x,y in part);max_y=max(y for x,y in part)
            greenhouse='1140' in entry.name
            label=('温室（镜像）' if 'mirror' in entry.name else '温室') if greenhouse else f'室外田块 {i+1}'
            shapes.append(dict(id=f'{Path(entry.name).name}-{i}',label=label,map=entry.name,map_ids=sorted(set(references[entry.name])),
                width=max_x-min_x+1,height=max_y-min_y+1,count=len(part),origin=[min_x,min_y],cells=[[x-min_x,y-min_y] for x,y in part],
                sha256=hashlib.sha256(raw).hexdigest()))
    result=dict(build_id='25311578',executable_sha256=exe_hash,source='map_1_00.dat YMWR terrain + mapgroundelement.dat + map.dat',
        native_rule='0x1401CF660 and 0x1401D2860: 90px terrain tile, four edge centres, unique 45px cell IDs; rotate to farming axes',
        scanned_map_heads=len(scanned),excluded_nonplayable=excluded,scope='All referenced non-test map heads in the build; seasonal duplicates verified equal. Terrain capacity before buildings, objects, ownership and unlocks.',
        shapes=sorted(shapes,key=lambda s:s['label']),legacy_shapes=legacy_shapes)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Scanned',len(scanned),'map heads; excluded',len(excluded),'test/unreferenced maps')
    print([(s['label'],s['count'],s['width'],s['height']) for s in result['shapes']])

if __name__=='__main__':main()
