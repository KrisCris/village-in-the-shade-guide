# Daily farm tasks

[简体中文](daily-planner.md) | **English**

Open "今日农务" (daily farm tasks) from the top navigation or the profit planner page, at `/planner/today/`. Pick a slot save (`save.001`–`save.005`) and the page lists what to do today. The save is read in the browser only; it is not uploaded or changed.

The site's interface is in Chinese and Japanese. UI labels below are given in Chinese with an English gloss.

## What the page shows

- **换季提醒** (season change): crops that cannot ripen before the season ends or their scarecrow runs out, and ripe crops that wither at the next turnover unless harvested today.
- **现在可以收获** (ready to harvest): ripe crops, withered crops that can still be harvested (soybeans from edamame), and grown fruit trees in their bearing season.
- **今天的杂务** (today's chores): crops on tilled soil and ridges that still need water, spent scarecrows, animals not fed yet, items waiting in the shipping box, and withered crops to clear.
- **加工设备** (processing machines): finished products, idle machines, and products still processing with the earliest finish time.
- **交付委托** (deliveries): requests you can fill now from the backpack and storage chests, and the materials still missing. Higher-quality items count. Until the village head's catalog opens, only a notice is shown.
- **未来 7 天** (next 7 days): which crops ripen on each day, assuming you water every day.
- **农田** (farmland): how many cells in your farm area are planted, tilled and empty, back to plain ground, or covered by weeds or trees, plus how many days each scarecrow has left and how many crops of its season it covers.

Each crop group and each scarecrow has a "地图" (map) button that marks its cells on the farm map.

A save made after midnight (00:00–06:59) still belongs to the previous day. The page shows how many hours remain before the 07:00 turnover.

## Farm area

The save only records cells that are currently tilled, and about half of the empty tilled soil and ridges turn back into plain ground each night, so the save alone cannot tell how much land you farm. The page keeps the farm area in the browser:

- Every save you open adds all tilled soil, ridges, paddies and planted cells.
- Select cells on the map to add or remove them by hand. Only tillable ground can be selected; cells under buildings, facilities and floors are skipped.
- Cells you removed by hand are never added back automatically.
- Areas are stored per player name from the save (`localStorage` key `village-daily:farm-area:v1`). If the browser blocks storage, the area only lasts until the page closes.

## Evidence for the rules

These rules were checked against five consecutive saves of one slot: autumn 28 at 07:00 and 00:00, winter 1 at 07:00 and 00:00, and winter 2 at 07:00.

| Rule | Evidence in the saves |
| --- | --- |
| The day turns over at 07:00; watering and feeding reset then | The 381 crop cells watered and 8 animals fed on winter 1 are all dry and unfed again at 07:00 on winter 2. One mulberry bush waiting for its bearing season stays marked as watered |
| Crops on watered tilled soil and ridges gain 100 growth points each night | All 380 cells gained exactly 100 |
| Cultivation kits and trees need no water and gain 100 a night | All of them gained 100. The autumn kits still growing in winter all stood in an autumn scarecrow's range |
| Field crops that do not grow next season wither at the season change | The 50 taro and 2 sesame cells predicted on autumn 28 match the cells withered on winter 1 |
| A scarecrow keeps crops of its season growing in the 5×5 cells around it | The autumn scarecrow placed on autumn 28 covers 24 autumn kits, which gained 100 on winter 1 and winter 2 as usual |
| A scarecrow counts one day per turnover and is spent at 28 | Its `days` value goes from 0 to 1 to 2; on the morning of autumn 28 two summer scarecrows were at `days` 28 and marked `disable` |
| When a scarecrow is spent, out-of-season field crops in its range wither | That morning's 40 withered crops were all summer crops (cucumber, blueberry, corn, edamame), all inside those two summer scarecrows' ranges |
| About half of the empty tilled soil and ridges revert each night, unpredictably | 89 of 177 tilled cells and 92 of 188 ridges reverted; reverted and kept cells have identical data; planted cells never revert |

The rest comes from game data or existing site content:

- Ripe edamame withers into harvestable soybeans. It is the only crop with a withered harvest stage in `harvest_stages`, so it is not listed as withering overnight on the last day.
- Fruit trees bear only in their `perennial.bearing_seasons`; greenhouse-only trees list all four seasons.
- The scarecrow's range and duration come from its item text (5×5 cells from the center, 28 days); the map catalog tags it `PLACEMENT_EFFECT_RANGE_2`. A spent scarecrow stays until it is chopped down with an axe.
- The kit item text says it only grows in autumn. Outside autumn and outside an autumn scarecrow's range, the page treats a kit as stopped and leaves it out of the forecast and warnings.
- Deliveries accept the required quality or better and have no deadline. The catalog opens with flag 12036.
- Paddies do not need watering.

## Not verified yet

- Unwatered field crops: every growing field crop in the saves was watered, so there is nothing to compare. Forecasts assume daily watering.
- Whether rain waters crops, how fertilizer affects growth, and greenhouse cells: the saves have no such cases.
- Whether an out-of-season kit withers or waits for autumn: every kit in the saves was inside a scarecrow's range. The page never says a ripe kit withers at the season change.
- Whether crops grow once more at the turnover that spends a scarecrow before they wither: the page assumes not, so a scarecrow's days left count the same way as the season's.

## Code

- `src/lib/saveDaily.ts`: reads cells, machines, items, deliveries, animals and scarecrows from the save.
- `src/domain/dailyDigest.ts`: the daily rules, independent of the save format and tested with synthetic data.
- `src/lib/farmArea.ts`: merging and storing the farm area.
- `src/components/daily/`: the page and the farm map (reusing the save editor's `MapCanvas`).
- Tests that check the rules against saves are in `src/lib/saveDaily.test.ts`. They need the decrypted save fixtures (see `tests/gamesave/README.md`) and are skipped without them.
