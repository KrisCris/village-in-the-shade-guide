from __future__ import annotations
import struct
import sys
from pathlib import Path

SP = Path(__file__).parent

# tags that carry a u32 element count immediately after the 9-byte header,
# NOT included in `size`.
COUNTED = {1, 3, 4, 6, 7}
# tags whose body is a list of child nodes
NODELIST = {2, 3, 4}


class Node:
    __slots__ = ("tag", "name", "name_off", "size", "hdr", "body", "count", "end", "kids")

    def __init__(self, tag, name, name_off, size, hdr, body, count, end):
        self.tag, self.name, self.name_off, self.size = tag, name, name_off, size
        self.hdr, self.body, self.count, self.end = hdr, body, count, end
        self.kids = None

    def __repr__(self):
        return f"<{self.name} tag={self.tag} @{self.hdr:#x} size={self.size} count={self.count}>"


class Ser:
    def __init__(self, data: bytes):
        assert data[:4] == b"SER\0"
        self.data = data
        self.total = struct.unpack_from("<I", data, 8)[0]
        self.names_off = struct.unpack_from("<I", data, 0x0c)[0]
        self.names_len = self.total - self.names_off
        self.tags = {}

    def name_at(self, off: int) -> str:
        if off >= self.names_len:
            raise ValueError(f"name offset {off:#x} out of range")
        base = self.names_off + off
        end = self.data.index(b"\0", base)
        return self.data[base:end].decode("utf-8", "replace")

    def node(self, off: int) -> Node:
        d = self.data
        tag = d[off]
        name_off, size = struct.unpack_from("<II", d, off + 1)
        name = self.name_at(name_off)
        counted = tag in COUNTED
        count = struct.unpack_from("<I", d, off + 9)[0] if counted else None
        body = off + 9 + (4 if counted else 0)
        self.tags[tag] = self.tags.get(tag, 0) + 1
        return Node(tag, name, name_off, size, off, body, count, body + size)

    def children(self, n: Node):
        if n.kids is None:
            if n.tag not in NODELIST:
                n.kids = []
            else:
                out, p = [], n.body
                while p < n.end:
                    c = self.node(p)
                    out.append(c)
                    p = c.end
                if p != n.end:
                    raise ValueError(f"child overrun in {n!r}: {p:#x} != {n.end:#x}")
                n.kids = out
        return n.kids

    def raw(self, n: Node) -> bytes:
        return self.data[n.body:n.end]

    @property
    def root(self):
        return self.node(0x10)


def load(name: str) -> Ser:
    """Accept a raw YKCMP save, a pre-decompressed `.bin`, or a bare fixture name.

    Decompression goes through `tools/save_format.py`, which needs no third-party
    package, so these probes run against a real save with a stock Python.
    """
    candidates = [Path(name), SP / name, Path(name + ".bin"), SP / (name + ".bin")]
    path = next((c for c in candidates if c.is_file()), None)
    if path is None:
        raise SystemExit(f"no save found for {name!r}; tried {[str(c) for c in candidates]}")
    raw = path.read_bytes()
    if raw[:8] == b"YKCMP_V1":
        sys.path.insert(0, str(SP.parent))
        from save_format import decode_save

        raw = decode_save(raw)
    return Ser(raw)
