# Native farm scene artwork

Game artwork © Nippon Ichi Software, Inc. These WebP scene images come from the
game files. See `LICENSING.md` for game asset licensing.

The source files are `map_1_00.dat`, `fairy_1_00.dat`, `texture_1_00.dat`, and
the crop/animation/texture/farmland/gimmick databases from Steam build 25640656.

Generate the images with the following command.

```
uv run python tools/extract-map-art.py --game-dir <installed-game-directory>
```

The extractor reads the game archives. Ground tiles are
composed at native resolution, then reduced to 50% for transfer. Static YMWR
decals (walls, fences, roofs, trees and rocks) go in separate `*-scenery.webp`
layers with the same bounds, so the editor can hide them in its ground-only view.
Each decal is drawn from its top-left position, scaled about its pivot, flipped
and faded as recorded, and ordered by its depth line. The village buildings
inside the farm window (Chawantei, Tagami General Store and the street vendor's
stall) are drawn into the same layers, part by part as in `public/maps/village/`.
The farm's own buildings, including My House, come from the save. Sprite anchors,
first-frame transforms, texture substitutions, seasonal variations and crop
growth thresholds come from game records. `manifest.json` contains world bounds
and sprite metadata. Use the saved state and growth points when interpreting
a crop's `formID`.

Crop and seed pages reuse the crop sprites for their growth stages. After this
manifest changes, rebuild `data/sources/game-crop-growth.json` with the following
command.

```
uv run python tools/extract-crop-growth.py --game-dir <installed-game-directory>
```

It adds each stage's next form from `crops.dat` and the painted bounds of every
sprite, so all stages can be drawn at one scale on one ground line.

Indoor rooms use each native YMWR map and its static fixture records. Shared
multi-floor maps are split at their terrain gap, preserving world positions.
The loaded save determines which house upgrade and rooms the UI offers.
Gimmick initial sequences, mirror pivots and per-furniture texture replacements
are preserved. Direction variants follow the saved angle.
