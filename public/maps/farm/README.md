# Native farm scene artwork

Game artwork © Nippon Ichi Software, Inc. These WebP images are extracted scene
assets for the unofficial Village in the Shade guide, not original artwork by
the guide's author, and the project's licenses do not cover them (see
`LICENSING.md`).

Source: Steam build 25311578, `map_1_00.dat`, `fairy_1_00.dat`,
`texture_1_00.dat`, and the crop/animation/texture/farmland/gimmick databases.

Reproduce with:

```
uv run python tools/extract-map-art.py --game-dir <installed-game-directory>
```

The extractor reads the archives without executing the game. Ground tiles are
composed at native resolution, then reduced to 50% for transfer. Static YMWR
decals (walls, fences, roofs, trees and rocks) go in separate `*-scenery.webp`
layers with the same bounds, so the editor can hide them in its ground-only view.
Each decal is drawn from its top-left position, scaled about its pivot, flipped
and faded as recorded, and ordered by its depth line. Sprite anchors,
first-frame transforms, texture substitutions, seasonal variations and crop
growth thresholds come from game records. `manifest.json` contains world bounds
and sprite metadata. Crops use their saved state and growth points, not an
assumption that `formID` is a growth-stage index.

Scene rendering omits animated weather, characters, dynamic lighting and event
sparkles. Original archives and player saves are not included.

Crop and seed pages reuse the crop sprites for their growth stages. After this
manifest changes, rebuild `data/sources/game-crop-growth.json` with:

```
uv run python tools/extract-crop-growth.py --game-dir <installed-game-directory>
```

It adds each stage's next form from `crops.dat` and the painted bounds of every
sprite, so all stages can be drawn at one scale on one ground line.

Indoor rooms use each native YMWR map and its static fixture records. Shared
multi-floor maps are split at their terrain gap without changing world positions.
Only the house upgrade and rooms enabled by the loaded save are offered in the UI.
Gimmick initial sequences, mirror pivots and per-furniture texture replacements
are preserved; direction variants follow the saved angle. Effect masks are not
drawn as ordinary opaque sprites or treated as furniture collision bounds.
