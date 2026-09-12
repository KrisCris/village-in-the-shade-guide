"""Read-only PE inspection; never load or execute the game's code. Requires pefile/capstone."""
import argparse,bisect,re
from pathlib import Path
import pefile,capstone
p=argparse.ArgumentParser();p.add_argument('mode',choices=['strings','xrefs','function']);p.add_argument('query');p.add_argument('--exe',type=Path,default=Path(r'E:\Games\SteamLibrary\steamapps\common\Village in the Shade\village.exe'));args=p.parse_args()
pe=pefile.PE(str(args.exe));base=pe.OPTIONAL_HEADER.ImageBase;raw=args.exe.read_bytes();md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64);md.skipdata=True
funcs=[(x.struct.BeginAddress,x.struct.EndAddress) for x in pe.DIRECTORY_ENTRY_EXCEPTION];starts=[a for a,b in funcs]
def dump(address):
 i=bisect.bisect_right(starts,address-base)-1;a,b=funcs[i]
 if address-base >= b:a=address-base;b=min(starts[i+1] if i+1<len(starts) else a+4096,a+4096)
 print(f'FUNCTION {base+a:x} {b-a} bytes')
 for ad,sz,mn,op in md.disasm_lite(pe.get_data(a,b-a),base+a):
  note=''
  if 'rip +' in op:
   try:
    target=ad+sz+int(op.split('rip + ')[1].split(']')[0],16);offset=pe.get_offset_from_rva(target-base);candidate=raw[offset:offset+120].split(b'\0')[0]
    if len(candidate)>3 and all(32<=b<127 for b in candidate):note=' ; '+candidate.decode()
   except:pass
  print(f'{ad:x} {mn} {op}{note}')
if args.mode=='function':dump(int(args.query,16))
else:
 targets={base+pe.get_rva_from_offset(m.start()):m.group().decode() for m in re.finditer(rb'[\x20-\x7e]{5,}',raw) if re.search(args.query,m.group().decode(),re.I)}
 for address,s in targets.items():print(hex(address),s)
 if args.mode=='xrefs':
  for sec in pe.sections:
   if not sec.Characteristics&0x20000000:continue
   for ad,sz,mn,op in md.disasm_lite(sec.get_data(),base+sec.VirtualAddress):
    if 'rip +' not in op:continue
    try:target=ad+sz+int(op.split('rip + ')[1].split(']')[0],16)
    except:continue
    if target in targets: print('XREF',hex(ad),targets[target]);dump(ad)
