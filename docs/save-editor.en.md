# Save editor

[简体中文](save-editor.md) | **English**

Open it at `/save-editor/`. Saves are read and edited in the browser and exported as a new file; nothing is uploaded. The editor's interface is in Chinese and Japanese, so UI labels below are given in Chinese with an English gloss.

This document has three parts:

1. Using the editor, for players.
2. Save format, for maintainers: the verified structure.
3. Edit rules: which game rules each feature follows when it writes to the save.

## Using the editor

### Finding your saves

```
%APPDATA%\Nippon Ichi Software, Inc\Honogurashinoniwa\<SteamID>\
  save.001 … save.005   slot saves, 3 MiB each
  save.lst              summary cache for the load screen
  .systemsave           global settings and slot index
```

The game has 3 slots but 5 files, because each slot rotates between files. To see which file a slot uses right now, open "如何确认当前使用哪个存档文件？" (which file is my slot using?) in the editor and load `.systemsave` from the same folder; the page shows the file for each of the three slots. Picking the most recently modified file also works.

Browsers can't open the AppData folder directly. The page gives you the path to copy; paste it into the file dialog's address bar.

### Editing and exporting

1. **Back up.** Copy the whole save folder first.
2. **Load.** Choose the save file and edit by section: basics, player, items, livestock, NPCs, map, quests, collection and unlocks. The "完整字段树" (field tree) button in the top right finds any field by name or path. A field that also appears on another tab is shown and checked with the same type there, so a float isn't shown as raw integer bits.
3. **Review.** Before export, a preview lists every change grouped by section, and each can be undone. Map changes are merged by action and object, such as "放置 · 户外石砖地板 · 3 个" (place · outdoor stone floor · 3), and a whole group can be undone at once. Moving or swapping items shows as one line and is undone together. Watering a field that is already wet is not a change and is left out of the list. Out-of-range values are marked in the input and in the preview, and download stays disabled until they are fixed. Changing money, maxing friendship or adding brand-quality items may affect achievements, so the page asks you to confirm before export.
4. **Replace.** Download the edited copy and replace the original file while the game is closed.

Drafts are kept in the current browser session. If you leave the page and come back, the draft is restored as long as you choose the same file again (checked by SHA-256).

The player name, date and play time on the load screen come from `save.lst`. The editor doesn't change that file, so the load screen may show the old values until you enter the game.

### What you can change

| Section | Contents |
| --- | --- |
| Basics | player name, dog name, money, offering money, in-game date and time, real play time, weather |
| Player | health, stamina, appearance and colors, hair color |
| Items | backpack, toolbar, shipping box, storage chests, processing machines and special containers; add and remove items, change quantity and quality, drag to move; upgrade tools; fill materials needed for deliveries or skills |
| Livestock | grouped by barn, coop and stable; name, friendship, mood and feeding; add animals; move them between pens |
| NPCs | friendship |
| Map | crops, terrain, facilities, buildings and furniture on the farm and indoors; see "Map editing" below |
| Quests | visibility and checklist progress of existing quests |
| Collection and unlocks | encyclopedia, skill tree, recipes, appearance, the village chief's delivery catalog, brand names |

### Map editing

- **View**: zoom with the wheel; pan with the middle button, the pan tool, or by dragging while holding Space. The minimap jumps to a location. "季节与图层" (seasons and layers) toggles season preview, mature preview and the restricted-terrain overlay. Season and mature previews only change the picture, not the save.
- **Select**: click to select, drag to box-select. A box selection is grouped by kind. You can narrow it to one kind or to empty ground, then plant, lay floors, water, till or clear those cells in one go.
- **Brushes**: plant, clear, water, till, ridges and paddy. Hold and drag to paint; one stroke is one undo step.
- **Place**: pick a facility, building, floor or furniture from the catalog and press R to rotate. Floors can be laid continuously by dragging. A selected object can be moved, rotated, upgraded or deleted.
- **Touch**: one finger selects or paints, two fingers pan. A stroke is committed when you lift your finger; adding a second finger mid-stroke cancels it.
- **Layout files**: export your map edits as JSON and import them into another save. Positions are checked again against the target save on import.

### What it doesn't do

- It doesn't grant rewards, trigger story events or change achievement counters.
- It doesn't update `save.lst`.
- It can't jump the story to an arbitrary point; the quest page only changes existing quests.
- Dog houses only support editing animal stats, not adding animals or moving them between locations.
- Hair color is previewed by sampling the texture, not by rendering the whole character.
- The editor has only been verified offline at the structural level; not every kind of edit has been tested in the game. Always back up before replacing a save.

## Save format

The format was verified on the author's 6 test saves (`save.001`–`save.005` and `.systemsave`): all of them parse completely, and writing them back unchanged produces byte-identical files.

### YKCMP container

Little-endian:

| Offset | Type | Meaning |
| --- | --- | --- |
| `0x00` | char[8] | `YKCMP_V1` |
| `0x08` | u32 | compression type: `8` (raw LZ4 block) for slot saves and `.systemsave`; `4` (YKCMP's own LZ77, unsupported) for `save.lst` |
| `0x0c` | u32 | end offset of the compressed data |
| `0x10` | u32 | decompressed length, `0x1400000` (20 MiB) for slot saves |
| `0x14` | … | LZ4 block with no frame or length field |

The file length is fixed and the game ignores the bytes after the compressed data. Exports keep the original length.

### SER node tree

The decompressed data:

| Offset | Type | Meaning |
| --- | --- | --- |
| `0x00` | char[4] | `SER\0` |
| `0x04` | u32 | reserved; 0 in every sample |
| `0x08` | u32 | used length (header + node tree + name table) |
| `0x0c` | u32 | name table offset |
| `0x10` | … | root node `SAVEDATA` or `SYSTEMSAVEDATA` |

The name table is a run of `\0`-terminated strings. Field names are the game's C++ member names (`money_`, `loveRate_` and so on).

Each node is `[tag u8][nameOffset u32][size u32] (+ [ref u32]) [payload]`. Only tags 1, 3 and 4 carry `ref`, and `ref` is not counted in `size`.

| tag | Kind | Payload | ref |
| --- | --- | --- | --- |
| 0 | scalar | 1-, 2-, 4- or 8-byte value | — |
| 1 | blob | `ref` fixed-size elements | element count |
| 2 | object | child nodes | — |
| 3 | list | child nodes; a map's children are `0k`/`0v`/`1k`/`1v`…, `ref × 2` in total | element count |
| 4 | pointer | empty, or one child named `p`; polymorphic pointers add a `className` string first | file offset |
| 5 | string | `[length u32][UTF-8][\0]` | — |

A pointer's `ref` is a file offset. If `ref` equals the node's own offset, the pointer owns the object that follows; `0xFFFFFFFF` is a null pointer; any other value refers to a node serialized elsewhere. The samples contain exactly one such reference: `pConstructionStatus_/pStatus_` points at an entry in `gimmickList_`.

**Any change in length shifts the offset of every later node, so every pointer `ref` has to be rewritten.** `serializeSer` re-lays out the offsets and rewrites the pointers, which is why names can change length freely. When a list is rebuilt, retained nodes keep their original offset mapping so outside references still reach the same object; new clones have no offset identity. A blob's `ref` can't be derived from its children, so a rebuild must keep it as is. Written as 0, the game reads the array as empty. A processing device's `timeValue_` and `createTime_` are blobs, and losing their element counts resets every processing timer. New names are appended to the end of the name table.

### Main fields

```
SAVEDATA
├── playTime_                         date_/hour_/minute_/second_/frame_/wholeframe_
├── flags_/flags_                     blob, 1563 × 8-byte flag bits
├── gameValues_                       map; values are {min_, max_, this->value_}
├── gameTime_/second_                 i64, in-game seconds elapsed
├── money_ / offeringMoney_           i64
├── pWeatherData_/dataID              weather table ID
├── pPlayerStatus_/p                  name, dog name, hp_, st_, appearance IDs, colors, tool ranges
├── inventoryItemList_ / toolItemList_   item pointer lists; empty slots are null pointers
├── shippingBoxItemList_              shipping box
├── gimmickList_                      every object on the map; entries with itemList_ are containers
├── livestockList_                    animals
├── npcStatusList_                    NPC friendship and schedules
├── questMap_ / encyclopediaReleaseMap_ / skills_ / bundleList_
├── brandCropsNameMap_                map: harvested item ID → brand name
└── statusUniqueIDGenerator_/idSeed_  unique ID generator
```

Item objects have the same structure wherever they are (backpack, toolbar or container), with fields including `uniqueID_`, `pData_/dataID`, `stackCount_`, `rank_` and `qualityUpValue_`. Item objects contain no pointers, so a new item is made by cloning an existing one and changing its fields, with `uniqueID_` taken in sequence from `idSeed_`.

### Game constants

From `gamedefine.dat`:

| Item | Values |
| --- | --- |
| Health | starts at 12, max 40, 4 points per heart, up to 10 hearts |
| Stamina | starts at 190, max 950, 190 per bar, up to 5 bars |
| NPC friendship | level caps 100, 300, 600, 1000, 1500, 2100 |
| Item quality | 0 normal, 1 bronze, 2 silver, 3 gold, 4 brand |
| Quantity, money | up to 999 per slot; money up to 99,999,999 |

What `qualityUpValue_` means is unknown, so the editor keeps the original value.

## Edit rules

These rules come from the game's tables and native code. Research notes such as native function addresses can be re-checked with `tools/save-probes/`.

### Time

- `gameTime_/second_`: 86,400 seconds a day, 28 days a season, 4 seasons a year starting with spring. A day starts at 07:00, so 0:00–6:59 still belongs to the previous game day. Conversion uses BigInt.
- `playTime_` is the real play-time timer and is never converted to or from the game date. Editing it clears the sub-second part of `frame_` and keeps `wholeframe_`. Hours go up to 9999.

### Player and tools

- Lowering the health or stamina maximum lowers the current value with it, and export checks again.
- Tool levels follow `item.dat` (1–5). The save stores the range the player has selected, so the range is only synced when you change a tool's level within the same tool type.
- The hair color vector is an HSV adjustment of the texture (H added, S and V multiplied); `(0,1,1)` means the original color. The preview samples the actual hair texture the same way.
- When an appearance item (front hair, back hair, clothing, scarf, accessory, bag) would enter the backpack, the game unlocks the style instead, so the item picker doesn't offer those categories.

### Containers and processing

- Chest and machine slots are in the `itemList_` of each `gimmickList_` entry. The shipping box uses the root `shippingBoxItemList_`; an empty list still shows 30 slots, and the list only grows when an item is added.
- Recipe machines: `timeValue_` is the start time, `createTime_` the duration in seconds, and `itemID0..2` / `itemVal0..2` the products and quantities. Improved machines run up to 3 jobs. "立即完成" (finish now) only moves the start time. New jobs use valid recipes and don't consume ingredients from the backpack.
- A sap extractor belongs to the tree it is attached to and produces 1 item from its first item template; you can only advance its timer, not add arbitrary recipes. A livestock product collector only shows and edits what it has already collected.
- Display tables and the yokai shelf link their contents to placed objects, so the editor only shows them. Place and remove items in the game.
- Batch actions on a machine category only add jobs to empty slots that support the chosen recipe; existing jobs are left alone.

### Livestock

- A heart is 300 or 400 points (depending on species and a runtime feature), up to 5 hearts; dogs use 400. Mood is 0–255 and feeding is on or off.
- Available pens depend on the building. Barns and coops are numbered by their building slot (the last two digits of the map ID), so building barn 2 doesn't rename barn 1. Adding an animal needs at least one ordinary animal in the save to serve as a structural template. A new animal gets the texture and bounding box of its breed. An adult's growth is set to the days its young form needs to grow up, matching game saves (chicken 5, duck 7, sheep 10, cow 14); friendship, mood and temporary state start at zero. The three stable positions are the attachment points `posIN01`–`posIN03` on the stable model (`arc_1201`): the stable's position plus (−2, −33), (−102, −121) and (−192, −211), with x negated for the mirrored stable. Moving the stable on the map moves its horses with it.
- When a barn is upgraded, its animals stay in that building and keep their pen order where possible. If there isn't room, the editor reports an error instead of quietly moving animals to another building. Demolishing a barn requires free pens elsewhere for its animals, or export is refused. A stable can't be demolished while you have a horse.

### Quests, unlocks and deliveries

- Quests: a checklist step counts as done when `checkLevel_` is greater than its threshold. State 0 is hidden, 2 shown and 3 completed; game saves never use 1. When the checklist is full, ordinary quests become 3, while village rules (`CHAIN_VILLAGE_RULES_*`) and villager help quests (each villager's `*_01`) stay at 2, as they do in the game. Only the quest itself changes; story flags are left alone.
- Encyclopedia: `encyclopediaReleaseMap_` records item IDs, always with the value 1. The 76 items with `ITEM_FEATURE_NOT_PUBLISH_ENCYCLOPEDIA` (itemfeature 8), such as building rewards, recipe documents, tool bases and demo props, never appear in the game's encyclopedia, so the editor doesn't list them either. Existing entries for them in a save are kept as they are.
- Skill tree: unlocking a node also unlocks its prerequisites, and locking one locks its dependents, keeping `skills_` and the flag bits in sync. The shrine repair level is never changed automatically. The six learning materials are, in order, magatama, rain magatama, twin magatama, child magatama, bronze mirror and sword (items 650000, 650010, 650020, 650030, 650040, 650060); "补齐材料" (fill materials) puts them into the backpack in that order.
- Village chief deliveries: required materials are read as `itemId u32, rank u32, count u32`, and high quality means rank 4. The editor only changes the remaining count. When a whole book is delivered it sets the book's completion flag, but it doesn't fire the delivery event or grant rewards. "留最后一件" (leave the last one) lets you make the final delivery in the game. "开放村长家的交付目录" (open the delivery catalog) only sets `GAME_FLAG_STORY_02_022`.

### Map

- **Scenes**: 64 outdoor and indoor scenes. Terrain comes from YMWR on a 45-unit grid, and a cell ID is `round(y/45)*1000000 + round(x/45) + 1`. Only cells allowed by the ground mask can be edited, and farm expansions are checked separately against flags 147/148.
- **Crops**: allowed soils follow the crops table; rice and wasabi only grow in paddies. Growth is written to `growth_` and `formID_`. `formID_` is a state (normal, withered, regrowing, stump and so on), not an animation number. `growth_` is a `{min_, max_, this->value_}` range: the game keeps `min_` at 0 and `max_` at the last threshold of the current form, and clamps `value_` to `max_` on load. Changing the form or growth value therefore has to update `max_` too, or the stage shown in the game won't match. Days remaining are estimated at 100 growth points a day, ignoring season, fertilizer and watering.
- **Watering**: only tilled soil and ridges can be watered; paddies don't need it.
- **Facilities**: collisions use the FAD collision areas, and adjacent single-cell diamonds may share an edge. Traps, crab pots, wall hangings and other special facilities follow their own terrain categories. Ordinary facilities (rugs included) can't go in a paddy, except scarecrows.
- **Bounds**: a new object's `baseAABB_` is the union of the textured node quads in its FAD initial frame (or the frame for its facing, for directional objects), flipped horizontally for mirrored objects. `tools/extract-map-art.py` writes these to `aabb` in `game-map-rules.json`.
- **Floors**: can't be laid under crops, trees or facilities; clear those first. Stone floors (script `gimmick_cobblestones`) need `se = 1` in `statusValueMap_`; without it the placement sound plays again when the game loads. Floors can go on tilled soil, which turns back into plain ground.
- **Buildings**: placing one clears crops, floors and ordinary facilities in its footprint. Building numbers come from free slots, and upgrades keep the unique ID. Indoor items move to the new rooms by floor and relative position. Fixed scene objects and the house can't be deleted, and the house can only be upgraded in place. The shipping box is a fixed scene object: shown, but not movable. New building records follow the game's own: `angle_` is 0, and `statusValueMap_` gets the starting values (`openUpd = 1` for barns and coops; `build = 0` and `food01`–`food03 = 0` for the stable; `build = 0` for the dog house). `village.exe` tags only coop 1 (every level and mirror) `aviary`, and the anvil `anvil`. The building scripts keep these values up to date afterwards.
- **Interiors**: the house level (flags 140–142) chooses the floor plan, and flag 143 opens the basement. Lights and floor masks aren't drawn as ordinary furniture.
- **Layout files**: JSON version 1 with scene, cell, template IDs and edit operations only; no save contents. On import the target save's templates, bounds, footprints and unlocked areas are checked again, and a move whose source facility can't be found is rejected.

## Maintenance

### Code layout

| Location | Role |
| --- | --- |
| `src/lib/saveEditor.ts` | YKCMP and LZ4 encoding and decoding |
| `src/lib/ser.ts` | SER parsing and serialization (offset layout, pointer rewriting) |
| `src/lib/saveModel.ts` | field sections, change collection and export |
| `src/lib/saveItems.ts`, `saveInventory.ts`, `saveMachines.ts`, `saveTools.ts` | items, containers, processing machines and tools |
| `src/lib/saveAnimals.ts`, `saveQuests.ts`, `saveProgress.ts`, `saveShrine.ts`, `saveDeliveries.ts` | livestock, quests, unlocks, skill tree and deliveries |
| `src/lib/saveMap*.ts` | map scenes, geometry, rooms, placement rules and editing |
| `src/lib/saveSession.ts` | draft restore in the browser |
| `src/lib/saveValidation.ts` | checks before export |
| `src/components/save/` | editor UI |
| `tools/save_format.py` | dependency-free Python reference implementation for independent checks |
| `tools/save-probes/` | read-only scripts used to research the format |

The catalogs the editor uses are in `data/sources/game-save-*.json` and `game-map-*.json`, extracted from the game by `tools/extract-save-*.py` and `tools/extract-map-art.py` (see [maintaining game data](data-extraction.en.md)). The name and icon lookup `public/save-editor-names.json` is generated by `npm run build:data`.

### Tests

```sh
npx vitest run src/lib/ser.test.ts src/lib/saveEditor.test.ts src/lib/saveModel.test.ts
uv run python tools/save_format.py verify tests/gamesave/save.00* tests/gamesave/.systemsave
```

The regression tests use the author's test saves and cover byte-identical round trips, pointer consistency after length changes, field reads and writes, and the edit rules. The saves are committed encrypted and CI decrypts them; without them, those tests are skipped locally. See [tests/gamesave/README.md](../tests/gamesave/README.md).

After changing editing logic, at least:

1. Make a real edit in a production preview and export it.
2. Load the exported file in the editor again and confirm the changes are there.
3. Parse the exported file independently with `tools/save_format.py`.

The test saves are read-only; put edited copies under the ignored `output/` folder. Don't put an edited save into the game's save folder for testing unless you have a backup.
