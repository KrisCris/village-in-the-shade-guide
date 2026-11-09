# Quarry layout thumbnails

Game artwork © Nippon Ichi Software, Inc. These WebP images are extracted map
assets for the unofficial Village in the Shade guide, not original artwork by
the guide's author, and the project's licenses do not cover them (see
`LICENSING.md`).

Source: Steam build 25640656, `map_1_00.dat` and `map.dat`. Only the layouts that
a `dungeon.dat` floor or special room can load are exported; the list, with each
layout's map id, label and rock-cell count, is in
`data/sources/game-quarry-maps.json`.

Reproduce with:

```
uv run python tools/extract-quarry-maps.py --game-dir <installed-game-directory>
```

Each image is the map's ground layer, drawn the same way as
`tools/extract-map-art.py`, trimmed to the painted area and reduced to 1/6 for
transfer. Scenery decals are left out because the near-side walls cover most of
the floor at this size. Rocks, monsters and the hole down are placed by the game
each time a floor loads, so none of them are drawn.
