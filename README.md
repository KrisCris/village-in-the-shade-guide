# Village in the Shade Wiki

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md)

An unofficial wiki and strategy guide for *Village in the Shade* (ほの暮しの庭), with a searchable game database, interactive maps, farming planners and a browser-based save editor.

The site is available in Simplified Chinese, Traditional Chinese, Japanese and English. [Visit the site](https://kriscris.github.io/village-in-the-shade-guide/en/)

Data comes directly from the game files, with names, descriptions and icons matching the game. The project's guides, interactive maps and planning tools are built around these game records. The current snapshot is Steam build `25640656`, patch 1.30.

## What's on the site

- Wiki database: Browse crops, machines, processing, crafting and cooking recipes, fish, residents and the full item catalog. Check prices, sources, uses, shops, deliveries and unlock conditions through linked entries. Category pages, filters and sortable tables help narrow the list.
- Gameplay guides: Plan seasonal stockpiles, sowing and cross-season crops, crop quality and brands, cooking, livestock, buildings, land expansion and the greenhouse. Look up birthdays, gifts, recipe lessons, clothing, Hokora skills, hunting, Errand Coupons and story progression, plus the birthday, Seeder and plumbing additions in 1.30.
- Fishing and quarry tables: Compare fish by season, time and fishing spot, including bite chances and fish to keep for deliveries. Inspect quarry drops by floor, expected yields, map layouts, special rooms and first-arrival rewards.
- Night exploration guides: Check anomaly conditions, encounters, exchanges and rewards, late-night monster locations and damage, and how Curse items raise maximum Health and Stamina.
- Interactive collection map: Find Lost Books, Gears, Ghost Rats, Tamatebako, Fox Shrines and exchange locations. Search and filter markers, open collection instructions, and tick off finds with progress saved in your browser.
- Profit planner: Compare daily profit, profit per seed and monthly income from crops and processing. Adjust the season, year, seed source and quality, then inspect planting, harvest and processing timelines.
- Production workflow: Connect purchases, planting, replanting, multi-stage processing, stockpiles, deliveries and sales on a canvas. Track daily land use, machine queues, inventory and cash, with shopping lists and plan import/export. [Workflow guide](docs/workflow-planner.en.md)
- Daily planner: Read a save locally to build a checklist for deliveries, harvesting, processing, new machines, material gathering, planting, livestock and field guide completion. Check crop forecasts and season-change warnings, locate tasks on the farm and village map, and save your farm area. [Daily planner guide](docs/daily-planner.en.md)
- Save editor: Edit names, money, date, weather, player stats and appearance, inventories, machines, livestock, friendship, quest progress, collections, skills, recipes and brands. Review and undo changes in the browser before exporting a new save. [Save editor guide](docs/save-editor.en.md)
- Farm and interior layout editor: Paint crops and terrain, water or till groups of cells, and place, move or rotate buildings, facilities and furniture. Use seasonal and mature-crop previews, touch controls and undo, and transfer layouts between saves with JSON import/export.
- Search: Find game entries by name, pinyin or initials, and search the full text of guides.
- Offline app: Install the site on your desktop or home screen and download the current language's pages, images and maps for offline use. Downloads can be paused and resumed from page settings.
- Page settings: Choose day or night mode and a seasonal theme, toggle falling effects, set item quality, and play background music.

## Running locally

Install Node.js 24 LTS, then run these commands from the repository directory.

```sh
npm ci
npm run dev        # generate data and start the dev server; the URL is printed in the terminal
```

```sh
npm run build      # build the static site and Pagefind search index into dist/
npm run preview    # serve the production build
```

The site uses static hosting. Astro renders pages at build time, React handles filters, planners and the editor, and Pagefind provides search. Large lists and detail data load on demand and render in batches. Use the production preview for performance testing.

## Checks and tests

```sh
npm test               # Vitest
npm run check          # Astro and TypeScript
npm run content:check  # topic mapping
npm run i18n:check     # translation completeness
npm run verify         # all of the above plus a production build
npm run check:build    # check internal links after building
uv run pytest          # extractor tests (needs Python 3.11+ and uv)
```

GitHub Actions runs `npm run verify`, the link check and pytest on every pull request. After a merge to `main`, the checks run again and the site is deployed to GitHub Pages.

The save editor's regression tests use the author's test saves. CI decrypts `tests/fixtures/gamesave.tar.gz.enc` with a repository secret before running them. Setup and update instructions are in [tests/gamesave/README.md](tests/gamesave/README.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `src/pages/`, `src/components/`, `src/layouts/`, `src/styles/` | pages, components and styles |
| `src/domain/` | profit calculations, workflow simulation and entity relationships |
| `src/data/`, `src/lib/` | data access, save reading and writing, shared utilities |
| `src/i18n/` | UI locales and translation catalogs |
| `data/generated/build-25640656/` | current game snapshot (patch 1.30), with older builds `25311578` and `24969282` kept for comparison |
| `data/sources/` | maps, rules, save editor catalogs and other targeted data |
| `docs/` | documentation and data evidence |
| `public/` | icons, maps, scenery, portraits and other assets |
| `src/honogurashi_extractor/`, `tools/` | read-only extractor and maintenance scripts |
| `tests/` | extractor tests and notes on the test saves |

## Updating game data

Reading game data with the extractor requires Python 3.11+, uv and your own copy of the game. The extraction process and image sources are documented in [maintaining game data](docs/data-extraction.en.md) and [assets](docs/assets.en.md).

## Contributing

Use the issue templates to report bugs or suggest changes. Read the [contributing guide](CONTRIBUTING.en.md) before sending code.

## License

Copyright (c) 2026 _connlost.

Code is licensed under AGPL-3.0 with additional terms. Public deployments of modified versions must publish their source, keep the author credit and a link to this repository, be marked as modified, and use their own site name. [Code license](LICENSE)

Guide text, translations, documentation and data curation are licensed under CC BY-NC-SA 4.0. You may repost and adapt them for non-commercial use if you credit "静谧田园 Wiki (by _connlost)", link the original page and share adaptations under the same license. Commercial use needs the author's written permission. [Content license](https://creativecommons.org/licenses/by-nc-sa/4.0/)

See [LICENSING.en.md](LICENSING.en.md) for details and the attribution format.

The game's names, text, images and data belong to Nippon Ichi Software, Inc. and other rights holders.
