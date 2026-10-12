# Save probe scripts

Read-only scripts used to reverse-engineer the save format. They are kept for
re-checking the rules recorded in `docs/save-editor.md` and for future research.

They depend only on the standard library plus `ser2.py` in this folder, and they
read `save.00N` from the **current working directory** — copy a fixture next to
them, or pass a path. Set `PYTHONIOENCODING=utf-8` or Chinese output raises
`UnicodeEncodeError` on a cp1252 console.

```bash
cp ../../tests/gamesave/save.004 .
PYTHONIOENCODING=utf-8 python path.py save.004 "gimmickList_/585/p" 3
```

| Script | Purpose |
| --- | --- |
| `ser2.py` | minimal SER reader the rest import |
| `path.py` | dump a subtree by slash-path |
| `findstr.py` | find string nodes containing a needle |
| `status.py` | decode every `statusValueMap_` / `statusIDValueMap_` key (packed 8-byte ASCII) |
| `boxes.py` | enumerate every gimmick that owns an `itemList_` |
| `boxsample.py` | one sample container per gimmick type, with contents |
| `animals.py` | livestock placement / love / mood / growth survey |
| `gv.py` | dump `gameValues_` with the game's own min/max bounds |
| `alias.py` | find pointer aliases (nodes that must never be replaced) |
| `progress.py` | `flags_` bitset, encyclopedia map, quests, skills; cross-checks outfit `unlock_flag` bits across saves |
| `tables.py` | list records of a game table matching a pattern: `tables.py <table> [regex]`; the game path is written in the script |
| `native.py` | find strings, cross-references or disassemble a function in `village.exe` (`--exe` to point at it); needs `pefile` and `capstone` |

`tools/save_format.py` is the maintained, dependency-free implementation; prefer
it for anything that needs to be correct rather than exploratory.
