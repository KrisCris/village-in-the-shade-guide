# Content coverage and limits

[简体中文](content-coverage.md) | **English**

Game snapshot: Steam build `25311578`. Topic checklist: [AppMedia](https://appmedia.jp/honogurashi/), used only to compare which topics are covered.

## Covered

- **Structured data**: items, crops, machine processing, crafting and cooking, fish, residents, plus the shops, deliveries, unlocks and livestock relationships parsed so far. Every entry links both ways: an item shows its recipes, machines and shops, and those pages link back.
- **Planners**: value added by processing, full return starting from seeds, and the production workflow.
- **Original guides**: seasonal stockpiles, fishing spots, the quarry, birthdays and gifts, appearance unlocks, shrine skills, collection maps, fishing and cooking preparation, night preparation, anomaly conditions and counters, special crops, hunting, livestock, buildings and the greenhouse, help tickets and progression goals, cursed items and the heart and stamina caps, and more.
- **Save editor**: see the [save editor guide](save-editor.en.md).

Key numbers and conditions come from `data/generated/` and `data/sources/game-*.json`. How fishing spot names were derived is recorded in [`data-evidence/fishing-locations.md`](data-evidence/fishing-locations.md) (Chinese).

## Not fully covered

- All 116 AppMedia topics are mapped to pages on the site. `npm run content:check` only checks that the mapping is complete and the links work. It does not mean every topic has a full write-up.
- Topics one of our guides already covers (livestock unlocks, the fair, fishing, mining, the story chapters and so on) redirect to that guide and are no longer listed again on the guide index. Topics that are too basic or unrelated to a guide (saving, multiplayer, the gaze button, whistle types, game modes, the forum) redirect back to the guide index. The rules are `guideTarget` and `retiredGuideTitles` in `src/data/guideContent.ts`.
- "Topics still to write" on the guide index are pages that are still only outlines, such as the festivals.
- The guides are not translations of the Japanese site, and they don't cover every story branch, random request or hidden condition.
- Maps only show locations that have been parsed. A marker does not mean the item is available at every stage of the game.
- Birthdays, gift preferences and some recipe lessons are backed by game data. The number of restaurant visits needed to learn a recipe has not been verified, so don't write it as "eat it 3 times".
- Building order prerequisites, build times and land expansion conditions are parsed from `construction.dat` and the related scripts (`tools/extract-construction.py`). Aviaries, livestock houses, the stable and the anvil also carry a level value from 1 to 4 whose meaning is unknown; it may be an extra condition. How to get the brand quality the greenhouse deliveries ask for is not verified either.
- How requests are randomly picked is not fully parsed. The night sparkle item pools in the village and the additional farmland are parsed from `placementitem.dat` (`data/sources/game-curse-items.json`). How a mud seed picks its crop and when that crop turns cursed or giant lives in game code; it was traced in the `village.exe` planting and growth code and is exported to the same file. Don't infer a whole random pool from a few parsed locations, and a random delivery candidate is not a fixed request.
- The anomaly page's conditions, counters, rewards and map positions come from `data/sources/game-anomalies.json` (`tools/extract-anomalies.py`): scripts, `gimmick.dat`, and anchors and placed gimmicks in the village map. The page also covers night events outside the late-night rotation: Peto-peto-san, the giant rabbit, the crimson phone, the Japanese doll, Dorotabō, the anomaly crops and fish, the lord of the Okami pool, and the ox ghost. Illustrations are rendered from the game's animation models by `tools/extract-anomaly-art.py` and `tools/render-anomaly-art.mjs`. Rules that live in the game executable (the weighting when several anomalies qualify on the same night, and how mizuchi and daruma stone spots are picked) are not given as numbers. Ordinary night monsters in the pass, mountain and ranch areas (`placementhorror.dat`) are not covered yet.
- Generated "uses" only cover the relationships parsed so far, not every use in the game.
- Amounts after quality multipliers have decimals and are estimates; how the game rounds them is not fully verified.
- Profit rankings rely on the growth times, processing times and seed supply listed on each page. They ignore weather, skills, machine queues and how the player spends their days, so they are not an optimal plan.

## Writing principles

- Keep the evidence and the uncertainty. A recorded price does not mean a shop sells the item; one random delivery is not a fixed requirement.
- Write "unverified" for rules that haven't been checked. Don't guess.
- Automated checks (`npm run verify`) only show that data and pages are consistent with each other. They don't replace checking in the game.
