"""Export visually verified scenery rectangles; reads game files without modifying them."""
from pathlib import Path
import argparse
import json
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.texture import decode_nltx_image
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--game-dir',required=True,type=Path)
parser.add_argument('--output',type=Path,default=Path('public/art'))
args=parser.parse_args()
archive=FafullfsArchive.open(args.game_dir/'data/texture_1_00.dat')
available={entry.name for entry in archive.entries()}
args.output.mkdir(parents=True,exist_ok=True)
records=[]

def export(name,source,width,crop=None):
    image=decode_nltx_image(archive.read_entry(source))
    original=image.size
    if crop:image=image.crop(crop)
    image.thumbnail((width,width),Image.Resampling.LANCZOS)
    image.save(args.output/name,format='WEBP',quality=86,method=6)
    records.append({'file':'/art/'+name,'archive':'data/texture_1_00.dat','entry':source,'source_size':original,'crop':crop,'size':image.size})

for season,tag in [('spring','spr'),('summer','sum'),('autumn','aut'),('winter','win')]:
    # Background set 8100 has no summer variant; keep its spring landscape, while
    # the foreground trees and shrubs use their actual summer textures.
    background_tag=tag if f'data/texture/fairy_bli_8100/bg_8100_07_{tag}.nltx' in available else 'spr'
    for label,layer in [('mountains','06'),('ridge','07')]:
        export(f'{label}-{season}.webp',f'data/texture/fairy_bli_8100/bg_8100_{layer}_{background_tag}.nltx',1600)
    export(f'tree-{season}.webp',f'data/texture/fairy_obj_0100/obj_010000_00_tex01_{tag}.nltx',512,(256,200,512,512))
    export(f'pine-{season}.webp',f'data/texture/fairy_obj_0100/obj_010040_00_tex01_{tag}.nltx',512,(256,200,512,512))
    export(f'shrub-{season}.webp',f'data/texture/fairy_bli_9017/bli_9017_tex_{tag}.nltx',600,(0,390,490,760))
export('clouds.webp','data/texture/fairy_bli_8100/bg_8100_09_spr.nltx',1200)
export('haze.webp','data/texture/fairy_bli_8100/bg_8100_10_spr.nltx',1200)
Path('data/sources/site-scenery.json').write_text(json.dumps({'build_id':'24969282','note':'Native game scenery, web-sized. Homepage composition is decorative, not a geographic reconstruction. Summer mountain background reuses spring because this background set has no summer variant.','assets':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Exported {len(records)} scenery assets, {sum(p.stat().st_size for p in args.output.glob("*.webp")):,} bytes')
