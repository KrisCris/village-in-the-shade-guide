# Daily planner

[简体中文](daily-planner.md) | **English**

Open "每日规划" (daily planner) from the top navigation or the profit planner page, at `/planner/today/`. Pick a slot save (`save.001`–`save.005`) and the page lists what to do today. The save is read in the browser only; it is not uploaded or changed.

The site's interface is in Chinese and Japanese. UI labels below are given in Chinese with an English gloss.

## What the page shows

At the top are the save's date, weather, money and a 28-cell season bar with today marked. A row of number cards below sums up each part: to-do items left, deliveries ready today, field guide entries you can fill today, machines to build, empty farm-area cells and free animal places. Each card jumps to its part. While you scroll, a menu of the parts and a "地图" (map) button stay pinned to the top of the page.

The page has seven parts, top to bottom:

- **今日待办** (today's to-do list): what to do today, in order. It runs from crops that wither tomorrow, deliveries you can hand in today, and deliveries that one fishing or foraging trip completes, through collecting finished products and filling idle machines, machines to build, and where to get their materials (which quarry floors, which trees to fell, which trees to tap with a sap extractor), to what to sow on empty land, which animals the houses have room for and the field guide entries within reach today. Routine care (harvesting, watering, feeding) comes last. Jobs that have to wait for the 07:00 turnover (entering houses after midnight, or fish that bite in none of today's remaining periods) sit in a final group, 7:00 以后 (after 7:00). You can tick entries off as you do them; ticks belong to that save, so a later save from the same day starts a fresh list. Each entry links to its section below, and entries with a place can mark it on the map.
- **交付** (deliveries): the three lists (shrine repairs, fox shrine offerings and the village head's catalog), split into four tabs. 今天可以交 (ready today) holds the lists you can finish now. 物品交付 (item deliveries) holds the lists you can complete this season, with where each missing item comes from and, when it can be dated, the expected wait. 本季凑不齐 (not this season) holds the lists missing something you cannot get this season. 留给交付的物品 (set aside) lists the items reserved for deliveries; the processing plan never uses them.
- **今日可收集** (collect today): things missing from your field guide, or still short for deliveries, that you can get today. Fishing has one card per spot with the fish to catch and their bite chance in each period left today. Everything else is grouped by source: wild plants and bugs that grow outdoors this season, sap from grown trees, drops on quarry floors you have reached, and products your machines can make from the ingredients in stock.
- **加工设备** (processing machines): what goes into each slot that is empty, finished, or finishes today. Three figures at the top give the items loaded today, what the products sell for and how much more that is than selling the items raw. One card per kind of machine shows when its slots open, what to load and how many, what the products sell for and what the same items fetch raw. Below, 各原料的加工设备 (machine per ingredient) has one row per ingredient; its dropdown picks another machine or no processing, and picking the recommended machine again restores the default.
- **加造设备** (machines to add): machines that, at their current number, need more than 7 days to work through the ingredients in storage. Each card lists the waiting ingredients, about how much each extra slot earns per day, what one more machine or one upgrade costs, how many the stock covers, and where to get missing materials.
- **空地和家畜** (empty land and livestock): 空地种植 (sowing) lists what to sow on the empty cells of your farm area. 家畜 (livestock) has one card per kind of house, showing how full it is and which animals you do not keep yet produce items the deliveries need; when their house is full, it names the renovation or new house to order from 树木建设 (the carpenter), with its materials and money.
- **农场概况** (farm overview): season and scarecrow warnings, crops ready to harvest, chores such as watering and feeding, crops ripening in the next 7 days, farm-area cell counts and each scarecrow's days left.

Each crop group, each scarecrow, and the trees to fell or tap have a "地图" (map) button that opens the map in a window and marks their cells; trees are counted one by one. The rest of the village is drawn around the farm, exported from the game's map files like the farm itself, so trees outside the farm show too. Zoomed out, the map shows one picture of the whole village; zooming in loads a sharp copy of the part in view. When you zoom out too far to see cells, marked places become red pins.

A save made after midnight (00:00–06:59) still belongs to the previous day. The page shows how many hours remain before the 07:00 turnover and orders the to-do list by the night rules; see "After midnight" below.

## How it plans

### Deliveries

- Only unfinished lists count. Shrine repairs go one at a time, so only the lowest-numbered unfinished repair is listed. The village head's catalog is left out until flag 12036 is on.
- Items in the backpack and storage chests are handed out in this order: shrine repairs, this season's fox shrine offerings, the catalog, then offerings for other seasons. Lists that can be finished completely get their items first; what is left goes to unfinished lists.
- Within the same order, lists with a quality requirement go first. Each list takes the lowest quality that qualifies, leaving better items for lists that ask for them.
- A list goes under 物品交付 when every missing item has a source this season: crops in the field, crops you can sow now, fish that bite, wild plants, animals, trees, machines or the quarry. It goes under 本季凑不齐 only when something is out of season or its source is unknown.
- An expected wait is shown only when every missing item has a dated source. Growing crops count cell by cell, in the order they ripen, until there are enough. Fish that still bite in a period left today, wild plants that grow outdoors this season and products of animals already on the farm count as available today. A fish of this season that bites in none of today's remaining periods counts as 1 day; on the last night of the season it counts as unavailable.

### Processing machines

- The ingredients are what is held after deliveries take theirs, plus today's harvest: crops ripe today (regrowth picks included), withered crops that can still be harvested and the fruit trees drop when shaken today, less what deliveries still lack. Animal products made today are not counted. Only crops, fruit, flowers, wild plants and animal products count, priced at normal quality.
- Slots loaded today are the empty ones, the ones holding finished products and the ones that finish before the day ends (midnight, or the 07:00 turnover for a save after midnight). Slots that finish within an hour of each other count as one round, shown at the time the last one finishes.
- Each slot takes one batch. Within these slots the plan finds the loading that adds the most money over selling raw (a min-cost flow), and one ingredient may go to several machines. Recipes worth no more than the raw item are not loaded.
- An ingredient with a machine picked in the table goes only into that machine; "不加工" (no processing) keeps it out. The recommended machine is the plan's choice without a pick. For ingredients that do not fit today, it is the most valuable recipe on a machine the farm has, or else one the farm can build that adds at least 20 per item.

### Machines to add

- Ingredients left after today's loading queue on their recommended machines. When a kind of machine's running jobs, today's batches and that queue take more than 7 days across its slots, it is listed under 加造设备.
- The plan first suggests upgrading first-level machines to their "／改" version, then building a new "／改" outright, then building new first-level machines. The game has no recipe that makes a "／改" from scratch: the upgrade recipe uses up a first-level machine. Building one outright therefore costs both recipes together: craft a first-level machine and upgrade it without placing it. The "／改" slot count then fits in the space of one machine. If the upgrade recipe is not learned yet, it builds first-level machines only; if that recipe is not learned either, it names the shrine skill that unlocks it.
- "Earns per extra slot per day" is the queued ingredient that adds the most money for one slot working a whole day.
- How many machines the stock covers counts what is left after deliveries. When a material made in a machine, such as iron bars, is short, its inputs (ore, coal) are planned too, one level deep.

### Collect today

- Whether an item is registered comes from the save's field guide record (`encyclopediaReleaseMap_`). Items the game's field guide never lists (`ITEM_FEATURE_NOT_PUBLISH_ENCYCLOPEDIA`) appear only when a delivery lacks them. Delivery shortfalls match 物品交付.
- Fishing: computed from fishing.dat per spot, for this season and the periods left today, the same way as the fishing spot guide (`/guides/fishing-spots/`): the chance that one bite without bait is that fish, junk left out. Periods follow the ranges fishing.dat gives, 7–12, 12–18, 18–24 and 0–6; neighbouring periods with the same chance are shown as one range. Spots are ordered by how many wanted fish they have; within a spot, fish the deliveries lack come first, then the rest by chance.
- Outdoors: the wild plant and bug spawn groups in `naturaloccurrence.dat` give the season each one grows in (buried coins appear all year, but only after the chapter 2 flag 12902), and `cropsharvest.dat` gives the item picked; `tools/extract-natural-occurrence.py` exports both. The groups do not say where on which map they spawn, so the page lists seasons only. Every wild plant in the fox shrine offerings has the same season in this table.
- Sap: a grown tree of the right kind stands in the village. Quarry: a floor you have reached drops it. Machines: the farm has that machine and the stock left after deliveries covers one batch.
- The to-do list sums these up in one "补图鉴" (field guide) entry, counting only unregistered items; delivery shortfalls already have their fishing, foraging and delivery entries.

### Where materials come from

- Quarry: expected drops per 100 rocks broken, from each floor's rock weights and each rock's drops. Floors with the same drops are merged into one band. The page picks the band with the most among floors already reached (flags 21801–21812 record reaching floors 10–120); if none has been reached, it lists the shallowest band and says so.
- Wood: by the item text, 木材 (wood) comes from chestnut, oak and pine trees, 好加工的木材 (easy-to-work wood) from cedar, and 坚硬的木材 (hard wood) from hinoki. By `cropsharvest.dat`, felling a grown tree with the axe gives 12–18 of its wood. The page lists grown trees in the village, saplings, and tree seeds held (trees grow in about 10 days). The 木材 sources also mention the stumps in 附身草丛 (the haunted thicket) north-west of the village.
- Sap: a sap extractor on a grown tree of the right kind collects it every 3 days.
- Wild plants and bugs: by the seasons in `naturaloccurrence.dat`; see "Collect today" above.
- Other sources: crops in the field, crops that can be sown this season, fishing, animals and machine recipes.

### After midnight

A save from 00:00 until the 07:00 turnover follows the night rules:

- You cannot enter other people's houses. The village head's catalog is handed in at the village head's house, so even a list ready today moves to 7:00 以后. Shrine repairs and fox shrines are outdoors and stay available.
- Fishing follows the four periods in fishing.dat: 7–12, 12–18, 18–24 and 0–7. From 0 to 7 only the six cursed fish and junk bite, and the cursed fish bite at no other time. When a delivery only lacks fish that bite in the daytime this season, its fishing trip moves to 7:00 以后.
- Wild plants can still be picked at night while they are there.

### What to sow

- Empty land is the tilled-and-unplanted and back-to-plain cells in the farm area.
- Only crops that grow this season on tilled soil or ridges, can ripen in the days left (crops that also grow next season may cross over), and have seeds held or on sale this season are listed.
- Crops the deliveries still need come first; the rest are ranked by the profit planner's profit per cell (seed cost taken off, regrowth and processing included). Processing counts only machines that are on the farm and need no more of their kind.

### Livestock

- Daily animal output is not verified, so the page estimates no income. It lists animal products the deliveries need that no animal on the farm makes, and the animal that makes each (the lowest-numbered breed when several do).
- When that animal's house has no room, the page suggests a carpenter's order: renovate the smallest house first (4 → 8 → 12 slots), and once all are at the largest size, build another within the limit. The stable can be ordered only after the first barn is built and Kisuke's letter arrives (flag 550). Prices, materials and limits come from construction.dat; slot counts come from the order descriptions.

### Settings

The machine picked for each ingredient is stored in the browser per player name from the save (`localStorage` key `village-daily:settings:v1`). Ticked to-do entries are stored per player name too (key `village-daily:done:v1`) and apply only to a save with the same date and time.

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
- The stumps in 附身草丛: players say there are many, but `cropsplacement.dat` places no stumps in that map, so how many there are and how much wood each gives is unknown. 附身草丛 is not on the village map, so it cannot be marked.
- Daily animal output and quality.
- Quarry figures cover ordinary rocks only, not ore-vein rooms or bee nests.
- Where wild plants and bugs grow: `naturaloccurrence.dat` has only spawn groups and seasons, and the group names do not appear in the map files.
- Whether shops sell seeds, the carpenter takes orders, or the quarry is open late at night: the page does not adjust those jobs for the hour.

## Code

- `src/lib/saveDaily.ts`: reads cells, machines, items, delivery progress, trees, animal houses, quarry progress, scarecrows and the field guide record from the save.
- `src/data/dailyPayload.ts`: builds `daily-data.json`: delivery lists, machine recipes, sell prices, fish seasons and bite chances per spot, wild plant and bug seasons, quarry drops, animal products and house orders.
- `src/domain/dailyDigest.ts`: the daily field rules, independent of the save format and tested with synthetic data.
- `src/domain/dailyPlan.ts`: ties together deliveries (`dailyDeliveries`), processing (`dailyProcessing`), materials (`dailyMaterials`, `dailySources`), sowing (`dailyPlanting`), livestock (`dailyLivestock`), collect today (`dailyCollect`) and today's list (`dailyActions`).
- `src/lib/dailyData.ts`: loads the page data and stores the settings; `src/lib/farmArea.ts`: merging and storing the farm area.
- `src/components/daily/`: the page and the farm map (reusing the save editor's `MapCanvas`; outside the farm it draws the village tiles in `public/maps/village/`, exported by `tools/extract-village-art.py`).
- Tests that check against saves are in `src/lib/saveDaily.test.ts` and `src/domain/dailyPlan.test.ts`. They need the decrypted save fixtures (see `tests/gamesave/README.md`) and are skipped without them.
