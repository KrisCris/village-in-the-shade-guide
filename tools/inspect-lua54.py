"""Read (never execute) game Lua 5.4 chunks for bounded control-flow inspection.

Format reference: https://www.lua.org/source/5.4/lundump.c.html
Instruction reference: https://www.lua.org/source/5.4/lopcodes.h.html
"""
import argparse
import struct
from pathlib import Path
from honogurashi_extractor.archive import FafullfsArchive

OPS = '''MOVE LOADI LOADF LOADK LOADKX LOADFALSE LFALSESKIP LOADTRUE LOADNIL GETUPVAL SETUPVAL GETTABUP GETTABLE GETI GETFIELD SETTABUP SETTABLE SETI SETFIELD NEWTABLE SELF ADDI ADDK SUBK MULK MODK POWK DIVK IDIVK BANDK BORK BXORK SHRI SHLI ADD SUB MUL MOD POW DIV IDIV BAND BOR BXOR SHL SHR MMBIN MMBINI MMBINK UNM BNOT NOT LEN CONCAT CLOSE TBC JMP EQ LT LE EQK EQI LTI LEI GTI GEI TEST TESTSET CALL TAILCALL RETURN RETURN0 RETURN1 FORLOOP FORPREP TFORPREP TFORCALL TFORLOOP SETLIST CLOSURE VARARG VARARGPREP EXTRAARG'''.split()


class Reader:
    def __init__(self, data):
        self.data, self.pos = data, 0

    def take(self, n):
        if n < 0 or self.pos+n > len(self.data):
            raise ValueError(f'truncated chunk at {self.pos}')
        result=self.data[self.pos:self.pos+n]
        self.pos+=n
        return result

    def byte(self):
        return self.take(1)[0]

    def size(self):
        value=0
        for _ in range(10):
            b=self.byte()
            value=(value<<7)|(b&127)
            if b&128: return value
        raise ValueError('oversized length')

    def string(self):
        n=self.size()
        return self.take(n-1).decode('utf-8',errors='replace') if n else None

    def function(self, parent=None):
        source=self.string() or parent
        start,end=self.size(),self.size()
        params,vararg,stack=self.take(3)
        code=[struct.unpack('<I',self.take(4))[0] for _ in range(self.size())]
        constants=[]
        for _ in range(self.size()):
            tag=self.byte()
            if tag in (4,20): value=self.string()
            elif tag==3: value=struct.unpack('<q',self.take(8))[0]
            elif tag==19: value=struct.unpack('<d',self.take(8))[0]
            elif tag in (0,1,17): value={0:None,1:False,17:True}[tag]
            else: raise ValueError(f'unknown constant tag {tag}')
            constants.append(value)
        upvalues=[tuple(self.take(3)) for _ in range(self.size())]
        children=[self.function(source) for _ in range(self.size())]
        self.take(self.size())
        for _ in range(self.size()): self.size(); self.size()
        locals_=[(self.string(),self.size(),self.size()) for _ in range(self.size())]
        upnames=[self.string() for _ in range(self.size())]
        return dict(source=source,start=start,end=end,params=params,stack=stack,code=code,constants=constants,children=children,locals=locals_,upvalues=upvalues,upnames=upnames)


def read_chunk(data):
    reader=Reader(data)
    if reader.take(15)!=bytes.fromhex('1b4c7561540019930d0a1a0a040808'):
        raise ValueError('not supported Lua 5.4 little-endian chunk')
    if struct.unpack('<q',reader.take(8))[0]!=0x5678 or struct.unpack('<d',reader.take(8))[0]!=370.5:
        raise ValueError('incompatible byte order')
    reader.byte()
    result=reader.function()
    if reader.pos!=len(data): raise ValueError('trailing bytes')
    return result


def listing(proto, path='main'):
    print(f"\n{path} lines {proto['start']}–{proto['end']} params={proto['params']}")
    print('constants:',dict(enumerate(proto['constants'])))
    for pc,word in enumerate(proto['code'],1):
        op=OPS[word&127]; a=(word>>7)&255; b=(word>>16)&255; c=word>>24; k=(word>>15)&1; bx=word>>15
        note=''
        if op in ('GETTABUP','GETFIELD'): note=repr(proto['constants'][c])
        elif op=='LOADK': note=repr(proto['constants'][bx])
        elif op in ('LOADI','LOADF'): note=str(bx-65535)
        elif op=='JMP': note=f'goto {pc+1+(word>>7)-16777215}'
        print(f'{pc:4} {op:12} A={a} B={b} C={c} k={k} {note}')
    for i,child in enumerate(proto['children']): listing(child,f'{path}/{i}')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('entry')
    parser.add_argument('--game',default='E:/Games/SteamLibrary/steamapps/common/Village in the Shade')
    args=parser.parse_args()
    archive=FafullfsArchive.open(Path(args.game)/'data.dat')
    listing(read_chunk(archive.read_entry(args.entry)))
