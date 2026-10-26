# Maintaining game data

[简体中文](data-extraction.md) | **English**

Only needed when the game updates or when checking data. Browsing and building the site does not require re-extracting anything.

## Where the data lives

| Path | Contents |
| --- | --- |
| `data/generated/build-25311578/` | current snapshot: base extraction plus supplemented, reviewed relationships |
| `data/generated/build-24969282/` | snapshot and schemas of the previous build, kept for comparison and no longer updated |
| `data/schemas/build-25311578/` | verified table field offsets |
| `data/sources/game-*.json` | targeted extractions: maps, game rules, fishing, the quarry, recipe lessons, exchanges, livestock, machine capacities, save editor catalogs and more |
| other files in `data/sources/` | reference data such as asset sources and official portrait sources |

Since build `25311578` the game ships official Simplified Chinese, and names and descriptions use it directly. Only when it is missing is the text converted from Traditional Chinese. Japanese, Traditional Chinese, Korean and the reserved language slots are kept in `translations` in table order. Internal IDs never change.

`npm run build:data` (`tools/build-site-data.ts`) turns the snapshot and targeted data into the JSON the site uses. `npm run dev`, `npm test` and `npm run build` all run it first.

## Extraction

You need Python 3.11+, uv and your own copy of the game. Every tool only reads game files and never modifies the game or saves.

`honogurashi-data` and the scripts in `tools/` take `--game-dir` for the game directory. Without it, they read the `HONOGURASHI_GAME_DIR` environment variable, then search the Steam libraries listed in `libraryfolders.vdf`. A Steam install is usually found automatically.

```powershell
uv sync --extra dev
uv run honogurashi-data verify-schemas --build-id 25311578
uv run honogurashi-data extract --build-id 25311578 --output data/raw/review-25311578
uv run honogurashi-data audit data/raw/review-25311578
uv run honogurashi-data extract-icons --snapshot data/raw/review-25311578 --output output/review-icons
```

`honogurashi-data` also has `diff` (compare two snapshots), `inspect-archive`, `inspect-table` and `probe` for studying table layouts.

Extract into an ignored review folder first. **Never overwrite the committed snapshot directly.** The base extraction does not rebuild all the targeted data, so compare the changes, check references and units, then update the committed files selectively.

## When a new build comes out

When the game adds a language slot or changes a table, the field offsets and nested list strides of most tables move. Confirm the layout with `verify-schemas` first, and add offset records for the new build under `data/schemas/` when needed. Never reuse old offsets.

## Targeted tools

Each `tools/extract-*.py` handles one kind of data and was written for a specific build. Check each one's inputs, outputs and assumptions; together they are not a one-click update pipeline. Most write straight into their file under `data/sources/`, so start from a clean working tree and review the result with `git diff`.

| Area | Tools |
| --- | --- |
| Maps and exploration | `extract-map-markers.py`, `extract-exploration-markers.py`, `extract-night-pickups.py`, `extract-farmland.py`, `extract-quarry.py`, `extract-fishing.py` |
| Rules and economy | `extract-game-rules.py`, `extract-machine-capacities.py`, `extract-livestock-products.py`, `extract-shrine-materials.py`, `extract-kappa-exchange.py`, `extract-night-exchanges.py`, `extract-construction.py`, `extract-sap-trees.py` |
| Recipes and appearance | `extract-recipe-documents.py`, `extract-recipe-lessons.py`, `extract-appearance-groups.py` |
| Save editor | `extract-save-editor-rules.py`, `extract-save-appearance.py`, `extract-save-unlocks.py`, `extract-save-v2-catalogs.py`, `extract-save-map.py`, `extract-save-editor-icons.py` |
| Images | `extract-map-art.py`, `extract-crop-growth.py`, `extract-scenery.py`, `extract-portrait-models.py`, `extract-portrait-options.py`; see [assets](assets.en.md) |
| Research | `inspect-lua54.py`, `save_format.py`, `save-probes/` |

## After an update

```sh
uv run pytest
npm run verify
```

Then spot-check the icons, shop conditions, recipes and reverse uses of affected items. A price field does not prove an item can be bought. Value added by processing is measured against selling the ingredients directly, which is different from the full return starting from seeds. Known limits are in [content coverage](content-coverage.en.md); the reference chain for fishing spot names is in [`data-evidence/fishing-locations.md`](data-evidence/fishing-locations.md) (Chinese).

Never commit raw archives or saves.
