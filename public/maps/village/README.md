# Native village map artwork

Game artwork © Nippon Ichi Software, Inc. These WebP scene images come from the
game files. See `LICENSING.md` for game asset licensing.

The source is the open-world map in `map_1_00.dat` from Steam build 25640656
(`map_0000_ver120_{spr,sum,aut,win}.ymwr`), named by `map.dat`. Building art comes
from `fairy_1_00.dat` and `texture_1_00.dat` through the gimmick, anime,
animereplacetexture and texture databases.

Generate the images with the following command.

```
uv run python tools/extract-village-art.py --game-dir <installed-game-directory>
```

The extractor reads the game archives. It draws the same
YMWR ground tiles and static decals (walls, fences, roofs, trees and rocks) as
`public/maps/farm/`, merged into one layer, for every part of the open-world map
that has ground. `{season}/{column}_{row}.webp` covers world pixels
`column×2048` to `(column+1)×2048` and `row×2048` to `(row+1)×2048` at 50%, the
farm art's scale, so the two line up. The farm artwork supplies squares that
fall entirely within its bounds. `{season}.webp` is the whole map at 1/16 for
zoomed-out views. `manifest.json` lists the world bounds and the squares each
season has.

The YMWR places buildings as gimmick fixtures. The extractor draws fixtures
whose gimmick has an interior map (`mapID`) and is available independently of
story flags. These include the 17 village buildings from Kiki Manor to the
Clock Tower and the house in the secret area (`GIMMICK_ID_LOST_HOUSE`). The
game shows a building as separate parts (ground, walls, roof, doors). Each
visible part is drawn from its own FAD sequence with that season's texture
replacements and sorted among the decals by its `pri01` to `pri02` depth line.

The planner draws crops, timber trees, wild plants, My House, farm buildings
and player-placed objects from the save on top of these images.
