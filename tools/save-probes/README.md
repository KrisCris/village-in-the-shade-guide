# Save probe scripts

These read-only scripts inspect the save format and check the rules recorded
in `docs/save-editor.md`.

The save-reading scripts use the standard library and `ser2.py` in this folder.
They read `save.00N` from the current working directory. Copy a fixture next to
them, or pass a path. On a cp1252 console, set `PYTHONIOENCODING=utf-8` to print
Chinese text.

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
| `alias.py` | find pointer aliases whose node identity must be preserved |
| `progress.py` | inspect the `flags_` bitset, encyclopedia map, quests and skills, and cross-check outfit `unlock_flag` bits across saves |
| `tables.py` | list matching game-table records with `tables.py <table> [regex]`, locating the game through `HONOGURASHI_GAME_DIR` or the Steam library |
| `native.py` | find strings and cross-references or disassemble a function in `village.exe`, located as in `tables.py` or via `--exe`. Requires `pefile` and `capstone` |

Use `tools/save_format.py` for save-format parsing in tools and tests. It is the
maintained implementation and uses the standard library.
