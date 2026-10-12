# Assets

[简体中文](assets.md) | **English**

Most images on the site are extracted from the game files and stored in the repository, so deployment does not need the game installed. Raw archives (`data.dat`, `texture*.dat` and so on) and fully unpacked folders are never committed or deployed.

## Sources

| Path | Contents | Source |
| --- | --- | --- |
| `public/icons/generated/items/` | item icons (fish and recipes reuse them by item ID) | build `25311578` item table → icon table → texture reference, cropped by coordinates |
| `public/icons/generated/livestock/` | livestock icons | the game's own livestock icons |
| `public/icons/generated/ui/` | UI icons such as quality stars, friendship hearts and stamina | `tools/extract-save-editor-icons.py`; crop coordinates in the folder's `sources.json` |
| `public/icons/fallback/` | placeholder shapes for missing icons | drawn by the author; not the item's real appearance |
| `public/maps/` | in-game minimaps | markers and projection in `data/sources/game-map-markers.json` and `game-exploration-markers.json` |
| `public/maps/farm/` | farm, room, crop and facility art for the save editor | `tools/extract-map-art.py`; see the folder's README |
| `public/art/` | home page mountains, mist, seasonal trees and shrubs | `tools/extract-scenery.py`; per-image sources in `data/sources/site-scenery.json` |
| `public/art/portraits/` | animated portraits | exported by `tools/extract-portrait-models.py` and `extract-portrait-options.py`, packed by `tools/package-portraits.mjs` |
| `public/art/logo-japanese.png` | Japanese game logo | public Steam store image |
| `public/portraits/official/` | character portraits | publisher's character pages; sources in `data/sources/official-character-portraits.json` |
| `public/game-icon.png` | site icon | game artwork |

The home page background is a decorative scene assembled from game assets, not a reproduction of a game map. Its season does not affect any data filters.

## Rights

Images from the game, the Steam store and the publisher's website belong to Nippon Ichi Software, Inc. and other rights holders. The site shows them as an unofficial guide. The author claims no rights in them, and this project's licenses grant nobody any right to use them. If a rights holder wants something changed or removed, please open an issue on GitHub.

The extraction tools are project code under AGPL-3.0. Shapes drawn by the author, such as `public/icons/fallback/`, are under CC BY-NC-SA 4.0. See [LICENSING.en.md](../LICENSING.en.md).

## Adding assets

- Extract by following the game's table references and record the source table and build. Don't guess from names or substitute a similar image.
- Commit only the cropped or compressed images the site uses, never whole texture archives.
- Extract into an ignored review folder first, and move files into `public/` after checking them.
