# Native village map artwork

Game artwork © Nippon Ichi Software, Inc. These WebP images are extracted scene
assets for the unofficial Village in the Shade guide, not original artwork by
the guide's author, and the project's licenses do not cover them (see
`LICENSING.md`).

Source: Steam build 25311578, the open-world map in `map_1_00.dat`
(`map_0000_ver120_{spr,sum,aut,win}.ymwr`), named by `map.dat`.

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

Save-dependent things (crops, timber trees, wild plants and the objects players
place) are not in these images; the planner map draws them from the save on top.
Original archives and player saves are not included.
