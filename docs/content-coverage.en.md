# Content coverage and limits

[简体中文](content-coverage.md) | **English**

Game snapshot: Steam build `25311578`. Topic checklist: [AppMedia](https://appmedia.jp/honogurashi/), used only to compare which topics are covered.

## Covered

- **Structured data**: items, crops, machine processing, crafting and cooking, fish, residents, plus the shops, deliveries, unlocks and livestock relationships parsed so far. Every entry links both ways: an item shows its recipes, machines and shops, and those pages link back.
- **Planners**: value added by processing, full return starting from seeds, and the production workflow.
- **Original guides**: seasonal stockpiles, fishing spots, the quarry, birthdays and gifts, appearance unlocks, shrine skills, collection maps, fishing and cooking preparation, night preparation, special crops, hunting, livestock, help tickets and progression goals, and more.
- **Save editor**: see the [save editor guide](save-editor.en.md).

Key numbers and conditions come from `data/generated/` and `data/sources/game-*.json`. How fishing spot names were derived is recorded in [`data-evidence/fishing-locations.md`](data-evidence/fishing-locations.md) (Chinese).

## Not fully covered

- All 116 AppMedia topics are mapped to pages on the site. `npm run content:check` only checks that the mapping is complete and the links work. It does not mean every topic has a full write-up; some older topic pages are still outlines.
- The guides are not translations of the Japanese site, and they don't cover every story branch, random request or hidden condition.
- Maps only show locations that have been parsed. A marker does not mean the item is available at every stage of the game.
- Birthdays, gift preferences and some recipe lessons are backed by game data. The number of restaurant visits needed to learn a recipe has not been verified, so don't write it as "eat it 3 times".
- Building unlock years and event conditions, how requests are randomly picked, the night pickup pools and the mud seed conversion pools are not fully parsed. Don't infer a whole random pool from a few parsed locations, and a random delivery candidate is not a fixed request.
- Generated "uses" only cover the relationships parsed so far, not every use in the game.
- Amounts after quality multipliers have decimals and are estimates; how the game rounds them is not fully verified.
- Profit rankings rely on the growth times, processing times and seed supply listed on each page. They ignore weather, skills, machine queues and how the player spends their days, so they are not an optimal plan.

## Writing principles

- Keep the evidence and the uncertainty. A recorded price does not mean a shop sells the item; one random delivery is not a fixed requirement.
- Write "unverified" for rules that haven't been checked. Don't guess.
- Automated checks (`npm run verify`) only show that data and pages are consistent with each other. They don't replace checking in the game.
