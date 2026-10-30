# Production workflow

[简体中文](workflow-planner.md) | **English**

Open it from the profit planner's "生产工作流" (production workflow) link, at `/planner/workflow/`. You lay out buying seeds, planting, processing, stockpiling and selling on a canvas, and the tool works out daily quantities, dates, land, machines and cash. Everything is calculated and saved in your browser; it does not read game saves.

The site's interface is in Chinese and Japanese. UI labels below are given in Chinese with an English gloss.

## Basics

1. **Buy.** Add a buy node and choose the seed, quantity and date. A shortcut can also create "buy seeds → plant → sell" in one go.
2. **Plant.** Connect the buy node to a plant node. If the seed grows only one crop, the crop is picked automatically and all the seeds are planted by default.
3. **Process, sell or stockpile.** Keep connecting downstream. When only one item or recipe fits, it is selected for you; when several recipes fit, choose the product you want.
4. **Dates.** By default a step happens as soon as its inputs are ready. For example, plant on day 1, grow for 5 days, harvest and start processing on day 6; with 1 day of processing, the product can be sold or processed further on day 7. Turn off automatic dates to set a "not before" date instead.
5. **Schedule.** The schedule at the bottom shows each day's purchases, plantings and harvests. Expand it for:
   - the shopping list;
   - income, spending and running balance;
   - inventory and work in progress;
   - stockpile targets and the next action.

A node's item, quantity and date follow its upstream nodes by default, and values you set by hand are never overwritten. When something conflicts, only the affected node explains why; the rest of the plan keeps calculating. You can connect empty nodes first and fill them in later.

## Adding downstream steps quickly

With a node selected, the side panel's "接下来做什么" (what next) lists what the current product can do: plant, process in a known machine, sell, or go to an existing stockpile target. Click one to add a connected node, with quantity and date filled in.

Processing options show each batch's input, output, days and the sale price difference at the current quality, with the highest value added per batch first. This ranking only looks at one batch. It ignores cash, buying machines, land, stockpiles and later processing, so it is not the best plan overall. Unknown prices are not treated as 0.

If the only downstream node is a sell node that hasn't been configured yet, a new plant or process step is inserted before it and marked "接在现有出售前" (before the existing sale). Existing stockpile connections stay as they are. Each quick action can be undone on its own.

### Filling missing ingredients

"补齐加工原料" (fill ingredients) tells apart two cases: the ingredient source isn't connected yet, or there isn't enough of it. The shortfall is counted in whole batches and includes stockpiles and ingredients already in machines. You can fill it by connecting an existing source, or by adding existing stock or a shop purchase with a set quantity and date.

An added purchase is a one-off. If the upstream plan changes later, no extra purchase is added silently; the shortfall is shown again instead. Items no shop sells, or whose price is unknown, never get a purchase suggestion.

### Names and automatic values

Node names follow the item by default. A name you change by hand is kept, and you can switch back to the automatic name. Switching a processing recipe resets incompatible machine models to automatic and keeps the machine count. "恢复自动数量与日期" (restore automatic quantity and date) only resets quantity and date; it leaves the recipe, machine count, replanting and custom name alone.

## Replanting and splitting

**Replanting** is off by default. With "收获清田后自动续种" (replant after harvest) checked, each round keeps the first round's size: seeds on hand are used first, then the rest is bought. You can turn off buying and only use seeds you have. Purchases and plantings appear separately in the schedule. If the next round can't be harvested within the replanting range or before the season ends, replanting stops and says why. Crops that naturally give several harvests don't use up more seeds.

**Splitting** goes in this order: stockpiles first, then fixed amounts, then whatever is left. If several outputs take "all remaining", give them different priorities or fixed amounts. A fixed amount reserved for a future day is locked in advance, so a "remaining" branch can't sell it first. The connection manager shows each batch's item, quantity and allocation date.

**Stockpile targets**: a new plan creates the current season's offerings and village chief deliveries from the stockpile catalog. Targets you delete don't come back on refresh or recalculation. A target with no source is marked "尚未安排来源" (no source yet). A target with a delivery date is delivered and deducted in one go once everything is ready. Items that miss the date stay in inventory until you change the date.

## Resources and cash

- **Land**: the largest area in use at the same time. Replanting reuses cleared land; overlapping plantings need more.
- **Machines**: each processing node uses its own machines. By default it gets enough to handle all incoming batches; you can pick a compatible model or use fewer. How many batches one machine runs at once comes from the game's machine data and is read-only. Capacity means recipe batches, which is not the same as output per batch.
- **Queues**: with fewer machines, batches queue automatically. The node shows:
  - how many days later the last batch finishes compared with a full set of machines;
  - how much less income arrives this period;
  - how much more or less you earn by processing instead of selling the ingredients.
- **Cash needed**: the largest shortfall over the plan, following each day's order of events. Payments that are due arrive first, then purchases are paid; new shipments pay out after the settlement delay. Future income, including income from the purchase itself, is never used to cover a purchase. The page doesn't show a made-up wallet balance.
- **Income and spending**: this period's result is money received minus money spent within the period. Processing, sales and payments after the period are simulated further and shown as a separate final result. Inventory, stockpiles, work in progress and pending payments are listed separately. Machine and land expansion costs are not included, so this is not a full return on investment.

## Canvas controls

| Action | How |
| --- | --- |
| Pan | drag empty space, or hold Space and drag |
| Zoom | mouse wheel |
| Box select | drag with the select tool, or hold Shift and drag |
| Switch tool | H for pan, V for select |
| Copy, paste, undo, redo | Ctrl/Cmd + C, V, Z, Shift + Z |

- Dragged nodes are saved when you release them, and dragging a group counts as one undo step. While panning, the gaps between selected nodes still count as canvas: dragging a gap moves the view.
- The minimap in the bottom right can be dragged and zoomed with the wheel. The properties panel can be moved, resized and closed; the expanded schedule can be resized. Focus mode is in the top right.
- Clicking an action in the schedule jumps to its node. Copies get new IDs and keep only the connections inside the selection.

## Plan files

The file menu creates, imports and exports plans. Older plans keep their hand-set dates, quantities, machine models and counts on import, and each can be switched back to automatic. Capacities typed into old nodes are dropped in favor of game data.

The first time an older plan stored in the browser is upgraded, a backup of the pre-upgrade version is kept where possible and can be exported from the file menu. If storage is full, the original plan can still be read.

## What the model covers

- **Calendar**: 28 days per month, 112 per year. Purchase and replanting ranges are 1–112 days. Processing time is rounded up to whole days; the earliest finish is the next day.
- **Payment**: arrives 1 day after sale by default, adjustable from 0 to 7 days.
- **Existing resources**: existing stock has no historical cost. Crops in the ground and work in progress take a remaining-days value.
- **Data**: shop supply, years and seasons come from the site's data. Check unlock conditions in your own game.
- **Not modeled**: unverified cross-season conversions, multi-stage growth, crops without a known growth time, weather, fertilizer, stamina and mixed quality. Growth across seasons is not simulated either.
- **Horizon**: events are simulated up to year 100. Beyond that, the page warns and keeps the unfinished state.
- **Limits**: up to 200 nodes and 500 connections per plan, and up to 10,000 machines per node.

## Maintenance

Machine capacities live in `data/sources/game-machine-capacities.json`, extracted by `tools/extract-machine-capacities.py --game-dir <game directory> --output <review file>`. They come from the first `settingArg` group in `gimmick.dat` and the slot branch in the native `GimmickProcessPushItem`, never from machine names. The file records SHA-256 hashes of the source table and the executable.

Build 25640656 has 29 recipe-processing machines: the 13 improved models have 3 slots, and the other 16 have 1 (including the beehive, sap extractor and silkworm box). A machine with unknown capacity is never assumed to have 1 slot; it gets no processing and shows "数据尚未核实" (data not verified). Workbenches, stoves, sprinklers and the like are outside this recipe-processing model.

Plan files are version 1, marked with `planningMode: intent` plus automatic and manual fields.

| Location | Role |
| --- | --- |
| `src/domain/workflow/intent.ts` | infers items and compatible options |
| `src/domain/workflow/intentSimulation.ts` | ingredient allocation, scheduling, resources and cash |
| `src/domain/workflowEditor.ts` | creating and migrating plans |
| `src/components/workflow/` | canvas, nodes and schedule |

There is no automatic recommender yet. A future one should produce plans in the same format and hand them to the simulator to check.

After changes, run `npm run verify` and `npm run check:build`, and try the canvas in a production preview.
