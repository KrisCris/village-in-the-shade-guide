# Native farm scene artwork

Game artwork © Nippon Ichi Software, Inc. These WebP images are extracted scene
assets for the unofficial Village in the Shade guide, not original artwork by
the guide's authors.

Source: Steam build 24969282, `map_1_00.dat`, `fairy_1_00.dat`,
`texture_1_00.dat`, and the crop/animation/texture/farmland/gimmick databases.

Reproduce with:

```
uv run python tools/extract-map-art.py --game <installed-game-directory>
```

The extractor reads the archives without executing the game. Ground tiles are
composed at native resolution, then reduced to 50% for transfer. Sprite anchors,
first-frame transforms, texture substitutions, seasonal variations and crop
growth thresholds come from game records. `manifest.json` contains world bounds
and sprite metadata. Crops use their saved state and growth points, not an
assumption that `formID` is a growth-stage index.

Scene rendering omits animated weather, characters, dynamic lighting and event
sparkles. Original archives and player saves are not included.
