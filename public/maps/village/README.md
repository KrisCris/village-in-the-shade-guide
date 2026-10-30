# Native village map artwork

Game artwork © Nippon Ichi Software, Inc. These WebP images are extracted scene
assets for the unofficial Village in the Shade guide, not original artwork by
the guide's author, and the project's licenses do not cover them (see
`LICENSING.md`).

Source: Steam build 25640656, the open-world map in `map_1_00.dat`
(`map_0000_ver120_{spr,sum,aut,win}.ymwr`), named by `map.dat`; building art from
`fairy_1_00.dat` and `texture_1_00.dat` through the gimmick, anime,
animereplacetexture and texture databases.

Reproduce with:

```
uv run python tools/extract-village-art.py --game-dir <installed-game-directory>
```

The extractor reads the archives without executing the game. It draws the same
YMWR ground tiles and static decals (walls, fences, roofs, trees and rocks) as
`public/maps/farm/`, merged into one layer, for every part of the open-world map
that has ground. `{season}/{column}_{row}.webp` covers world pixels
`column×2048`–`(column+1)×2048` and `row×2048`–`(row+1)×2048` at 50%, the farm
art's scale, so the two line up. Squares that lie entirely under the farm art
are left out. `{season}.webp` is the whole map at 1/16 for zoomed-out views.
`manifest.json` lists the world bounds and the squares each season has.

Buildings are not decals. The YMWR places them as gimmick fixtures, and the
extractor draws every fixture whose gimmick has an interior map (`mapID`): the
17 village buildings from Kiki Manor to the Clock Tower and the house in the
secret area (`GIMMICK_ID_LOST_HOUSE`). The game shows a building as separate
parts (ground, walls, roof, doors). Each visible part is drawn from its own FAD
sequence with that season's texture replacements and sorted among the decals by
its `pri01`–`pri02` depth line. Night light masks are a separate layer and are
not drawn. Fixtures that wait for a story flag are left out.

Save-dependent things (crops, timber trees, wild plants, My House, farm
buildings and the objects players place) are not in these images; the planner
map draws them from the save on top.
Original archives and player saves are not included.
