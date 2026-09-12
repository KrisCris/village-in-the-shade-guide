"""Progression structures: flags_ bitset, encyclopedia, quests, skills.

Backs plan section 1.6 / 1.7. Run against several saves and compare -- the
whole argument for what flags_ is rests on the bits DIFFERING between saves in
the direction of player progress.

    python progress.py ../../tests/gamesave/save.001 ../../tests/gamesave/save.004
"""
import collections
import json
import pathlib
import struct
import sys

from ser2 import load, NODELIST

APPEARANCE = pathlib.Path(__file__).resolve().parents[2] / "data" / "sources" / "game-appearance-groups.json"
WIDTH = {1: "<b", 2: "<h", 4: "<i", 8: "<q"}


def num(s, n):
    b = s.raw(n)
    return struct.unpack_from(WIDTH[len(b)], b, 0)[0] if len(b) in WIDTH else None


def collect(s):
    """Find the progression nodes by name in one walk."""
    found = {}

    def walk(n, path):
        p = f"{path}/{n.name}"
        if n.name == "flags_" and n.tag == 1 and n.size > 100:
            found["flags_"] = n
        elif n.name in ("encyclopediaReleaseMap_", "questMap_", "skills_",
                        "equeip_", "letterStatus_", "villagerRequestBuffer_"):
            found[n.name] = n
        if n.tag in NODELIST:
            for k in s.children(n):
                walk(k, p)

    walk(s.root, "")
    return found


def bitset(s, node):
    b = s.raw(node)
    words = struct.unpack(f"<{len(b) // 8}Q", b)
    return words, lambda i: (words[i >> 6] >> (i & 63)) & 1


def report(name):
    s = load(name)
    f = collect(s)
    print("==", name)

    words, bit = bitset(s, f["flags_"])
    total = sum(bin(w).count("1") for w in words)
    hi = max((i for i in range(len(words) * 64) if bit(i)), default=None)
    print(f"   flags_        {len(words)} words = {len(words) * 64} bits, {total} set, highest {hi}")

    enc = s.children(f["encyclopediaReleaseMap_"])
    vals = collections.Counter(num(s, enc[i + 1]) for i in range(0, len(enc), 2))
    print(f"   encyclopedia  {len(enc) // 2} entries, values {dict(vals)}")

    qk = s.children(f["questMap_"])
    states, levels = collections.Counter(), collections.Counter()
    for i in range(0, len(qk), 2):
        kids = s.children(qk[i + 1])
        obj = kids[0] if kids else None
        d = {c.name: num(s, c) for c in s.children(obj)} if obj else {}
        states[d.get("state_")] += 1
        levels[d.get("checkLevel_")] += 1
    print(f"   questMap_     {len(qk) // 2} entries, state_ {dict(states)}")
    print(f"                 checkLevel_ {dict(sorted(levels.items()))}")

    skills = []
    for ptr in s.children(f["skills_"]):
        inner = s.children(ptr)[0]
        d = {}
        for c in s.children(inner):
            d[c.name] = {g.name: num(s, g) for g in s.children(c)} if c.tag in NODELIST else num(s, c)
        skills.append((d.get("pData_", {}).get("dataID"), d.get("value_")))
    print(f"   skills_       {len(skills)}: {skills}")

    equip = [p.count for p in s.children(f["equeip_"])]
    print(f"   equeip_       {len(equip)} slots, all null: {all(r == 0xFFFFFFFF for r in equip)}")

    return bit


def appearance_check(bits_by_save):
    """The load-bearing cross-check: outfit unlock_flag values vs the bitset."""
    if not APPEARANCE.exists():
        print("\n(no appearance source; skipping cross-check)")
        return
    groups = json.load(APPEARANCE.open(encoding="utf-8"))["groups"]
    flagged = sorted((g["unlock_flag"], g.get("name") or g.get("id"))
                     for g in groups if g.get("unlock_flag"))
    names = list(bits_by_save)
    print(f"\n== outfit unlock_flag cross-check ({len(flagged)} groups)")
    print("   flag   " + "".join(f"{pathlib.Path(n).name:>10}" for n in names) + "  group")
    for flag, label in flagged:
        row = [bits_by_save[n](flag) for n in names]
        if any(row):  # only the unlocked ones are interesting
            print(f"   {flag}  " + "".join(f"{v:>10}" for v in row) + f"  {label}")


if __name__ == "__main__":
    saves = sys.argv[1:] or ["save.004"]
    appearance_check({s: report(s) for s in saves})
