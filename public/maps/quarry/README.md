# Quarry layout images

Game artwork © Nippon Ichi Software, Inc. These WebP map images come from the
game files. See `LICENSING.md` for game asset licensing.

The source files are `map_1_00.dat` and `map.dat` from Steam build 25640656.
The export contains layouts loaded by a `dungeon.dat` floor or special room.
`data/sources/game-quarry-maps.json` lists each layout's map id, label and
rock-cell count.

Generate the images with the following command.

```
uv run python tools/extract-quarry-maps.py --game-dir <installed-game-directory>
```

Each image shows the map's ground layer, drawn the same way as
`tools/extract-map-art.py`, trimmed to the painted area and reduced to 1/6 for
transfer. `large/` holds the same images at 1/3, which the floor explorer fetches
when a reader opens a thumbnail. Showing the ground layer keeps the floor
visible at thumbnail size.
The game places rocks, monsters and the hole down each time a floor loads.
