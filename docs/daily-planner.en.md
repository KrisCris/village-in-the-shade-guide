# Daily planner

[简体中文](daily-planner.md) | **English**

Open "每日规划" (daily planner) from the top navigation or the profit planner page, at `/planner/today/`. Pick a slot save (`save.001`–`save.005`) and the page lists what to do today. The save is read in the browser only; it is not uploaded or changed.

The site's interface is in Chinese and Japanese. UI labels below are given in Chinese with an English gloss.

## What the page shows

At the top are the save's date, weather, money and a 28-cell season bar with today marked. A row of number cards below sums up each part: to-do items left, deliveries ready today, machines to build, empty farm-area cells and free animal places. Each card jumps to its part. While you scroll, a menu of the parts and a "地图" (map) button stay pinned to the top of the page.

The page has five parts, top to bottom:

- **今日待办** (today's to-do list): what to do today, in order. It runs from crops that wither tomorrow, deliveries you can hand in today, and deliveries that one fishing or foraging trip completes, through collecting finished products and filling idle machines, machines to build, and where to get their materials (which quarry floors, which trees to fell, which trees to tap with a sap extractor), to what to sow on empty land and which animals the houses have room for. Routine care (harvesting, watering, feeding) comes last. Jobs that have to wait for the 07:00 turnover (entering houses after midnight, or fish that bite in none of today's remaining periods) sit in a final group, 7:00 以后 (after 7:00). You can tick entries off as you do them; ticks last for the save's day only. Each entry links to its section below, and entries with a place can mark it on the map.
- **交付** (deliveries): the three lists (shrine repairs, fox shrine offerings and the village head's catalog), split into four tabs. 今天可以交 (ready today) holds the lists you can finish now. 物品交付 (item deliveries) holds the lists you can complete this season, with the expected wait and where each missing item comes from. 本季凑不齐 (not this season) holds the lists you cannot complete this season. 留给交付的物品 (set aside) lists the items reserved for deliveries; the processing plan never uses them.
- **加工设备** (processing machines): 设备数量 (machine count) shows how many days each kind of machine needs to process the produce in hand plus what ripens within the time limit, and how many machines to build or upgrade when that runs past the limit. In 作物加工 (crop processing) you can pick another recipe for any produce, or none. 加造设备的材料 (materials for new machines) lists what the new machines need, whether you have enough, and where to get what is missing.
- **空地和家畜** (empty land and livestock): 空地种植 (sowing) lists what to sow on the empty cells of your farm area. 家畜 (livestock) has one card per kind of house, showing how full it is and which animals you do not keep yet produce items the deliveries need; when their house is full, it names the renovation or new house to order from 树木建设 (the carpenter), with its materials and money.
- **农场概况** (farm overview): season and scarecrow warnings, crops ready to harvest, chores such as watering and feeding, crops ripening in the next 7 days, farm-area cell counts and each scarecrow's days left.

Each crop group, each scarecrow, and the trees to fell or tap have a "地图" (map) button that opens the map in a window and marks their cells; trees are counted one by one. The village minimap is drawn around the farm, so trees outside the farm show too. When you zoom out too far to see cells, marked places become red pins.

A save made after midnight (00:00–06:59) still belongs to the previous day. The page shows how many hours remain before the 07:00 turnover and orders the to-do list by the night rules; see "After midnight" below.

## How it plans

### Deliveries

- Only unfinished lists count. Shrine repairs go one at a time, so only the lowest-numbered unfinished repair is listed. The village head's catalog is left out until flag 12036 is on.
- Items in the backpack and storage chests are handed out in this order: shrine repairs, this season's fox shrine offerings, the catalog, then offerings for other seasons. Lists that can be finished completely get their items first; what is left goes to unfinished lists.
- Within the same order, lists with a quality requirement go first. Each list takes the lowest quality that qualifies, leaving better items for lists that ask for them.
- An expected wait is shown only when every missing item can be had this season. Growing crops count cell by cell, in the order they ripen, until there are enough. Fish that still bite in a period left today, wild plants in season and products of animals already on the farm count as available today. A fish of this season that bites in none of today's remaining periods counts as 1 day; on the last night of the season it counts as unavailable.

### Processing machines

- The time limit defaults to the end of the season, at least 7 days; 7, 14, 28 or 56 days can be picked instead.
- The produce to process is what is held after deliveries take theirs, plus what ripens within the limit (including regrowth picks). Only crops, fruit, flowers, wild plants and animal products count.
- Each kind of produce goes to one recipe. A recipe picked on the page wins. Otherwise produce is taken in order of how much processing adds over selling it raw, and placed on the most valuable recipe whose machines are on the farm and still have time free; when none has time, on the most valuable recipe among owned machines. A machine the farm does not have is suggested only when the recipe adds at least 20 per input item over selling raw.
- Days = (remaining time of running jobs + assigned processing time) ÷ slots. Past the limit, the plan first upgrades existing first-level machines to their "／改" version, then builds new first-level machines and upgrades them. If the upgrade recipe is not learned yet, it builds first-level machines only; if that recipe is not learned either, it names the shrine skill that unlocks it.
- Materials needed for deliveries are taken off first, then a share of each material is kept back (the 库存保留 setting, 20% by default). When a material made in a machine, such as iron bars, is short, its inputs (ore, coal) are planned too, one level deep.

### Where materials come from

- Quarry: expected drops per 100 rocks broken, from each floor's rock weights and each rock's drops. Floors with the same drops are merged into one band. The page picks the band with the most among floors already reached (flags 21801–21812 record reaching floors 10–120); if none has been reached, it lists the shallowest band and says so.
- Wood: by the item text, 木材 (wood) comes from chestnut, oak and pine trees, 好加工的木材 (easy-to-work wood) from cedar, and 坚硬的木材 (hard wood) from hinoki. The page lists grown trees in the village, saplings, and tree seeds held (trees grow in about 10 days).
- Sap: a sap extractor on a grown tree of the right kind collects it every 3 days.
- Other sources: crops in the field, crops that can be sown this season, fishing, wild plants, animals and machine recipes.

### After midnight

A save from 00:00 until the 07:00 turnover follows the night rules:

- You cannot enter other people's houses. The village head's catalog is handed in at the village head's house, so even a list ready today moves to 7:00 以后. Shrine repairs and fox shrines are outdoors and stay available.
- Fishing follows the four periods in fishing.dat: 7–12, 12–18, 18–24 and 0–7. From 0 to 7 only the six cursed fish and junk bite, and the cursed fish bite at no other time. When a delivery only lacks fish that bite in the daytime this season, its fishing trip moves to 7:00 以后.
- Wild plants can still be picked at night while they are there.

### What to sow

- Empty land is the tilled-and-unplanted and back-to-plain cells in the farm area.
- Only crops that grow this season on tilled soil or ridges, can ripen in the days left (crops that also grow next season may cross over), and have seeds held or on sale this season are listed.
- Crops the deliveries still need come first; the rest are ranked by the profit planner's profit per cell (seed cost taken off, regrowth and processing included). Processing counts only machines that are on the farm and have time free within the limit.

### Livestock

- Daily animal output is not verified, so the page estimates no income. It lists animal products the deliveries need that no animal on the farm makes, and the animal that makes each (the lowest-numbered breed when several do).
- When that animal's house has no room, the page suggests a carpenter's order: renovate the smallest house first (4 → 8 → 12 slots), and once all are at the largest size, build another within the limit. The stable can be ordered only after the first barn is built and Kisuke's letter arrives (flag 550). Prices, materials and limits come from construction.dat; slot counts come from the order descriptions.

### Settings

The time limit, the reserve share and the recipe picked for each produce are stored in the browser per player name from the save (`localStorage` key `village-daily:settings:v1`). Ticked to-do entries are stored per player name too (key `village-daily:done:v1`); a save from another day starts with nothing ticked.

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
- Whether fox shrine offerings for another season can be handed in outside it: the page lists them with this season's, after the other lists.
- How much wood one tree gives: the page lists the trees you can fell but not how many to fell. Trees outside the farm map (such as the forest to the northwest) have no data either.
- Daily animal output and quality.
- Quarry figures cover ordinary rocks only, not ore-vein rooms or bee nests.
- Whether shops sell seeds, the carpenter takes orders, or the quarry is open late at night: the page does not adjust those jobs for the hour.

## Code

- `src/lib/saveDaily.ts`: reads cells, machines, items, delivery progress, trees, animal houses, quarry progress and scarecrows from the save.
- `src/data/dailyPayload.ts`: builds `daily-data.json`: delivery lists, machine recipes, sell prices, fish and wild-plant seasons, quarry drops, animal products and house orders.
- `src/domain/dailyDigest.ts`: the daily field rules, independent of the save format and tested with synthetic data.
- `src/domain/dailyPlan.ts`: ties together deliveries (`dailyDeliveries`), processing (`dailyProcessing`), materials (`dailyMaterials`, `dailySources`), sowing (`dailyPlanting`), livestock (`dailyLivestock`) and today's list (`dailyActions`).
- `src/lib/dailyData.ts`: loads the page data and stores the settings; `src/lib/farmArea.ts`: merging and storing the farm area.
- `src/components/daily/`: the page and the farm map (reusing the save editor's `MapCanvas`, drawn over the village minimap from `public/maps/`; `src/data/collectionMap.ts` converts its coordinates).
- Tests that check against saves are in `src/lib/saveDaily.test.ts` and `src/domain/dailyPlan.test.ts`. They need the decrypted save fixtures (see `tests/gamesave/README.md`) and are skipped without them.
