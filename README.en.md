# Village in the Shade Wiki

[简体中文](README.md) | **English**

An unofficial database, profit planner and save editor for *Village in the Shade* (ほの暮しの庭).

Site: <https://kriscris.github.io/village-in-the-shade-guide/>
Available in Simplified Chinese, Traditional Chinese and Japanese.

All data is extracted from the game files (currently Steam build `25311578`), so names, descriptions and icons match the game. Sites such as AppMedia are only used to compare topic coverage, never as a data source.

## What's on the site

- **Database**: crops, machines, processing, cooking, fish, characters and every item. Search by name or pinyin, filter by season, time of day, fishing spot or quality, and sort by any column. The detail panel shows how to get an item, what it is used for, recipes, shops and deliveries, in both directions.
- **Profit planner**: compares the value added by processing and the full return from buying seeds to selling the product.
- **Production workflow**: lay out buying, planting, processing, stockpiling and selling on a canvas. The tool works out quantities, dates, land, machines and cash. See the [workflow guide](docs/workflow-planner.en.md).
- **Daily planner**: reads a save and lists today's harvest, the cells that need water, finished machine products and deliveries you can fill now, and remembers your farm area. Read-only; nothing is uploaded. See the [daily planner guide](docs/daily-planner.en.md).
- **Guides**: seasonal stockpiles, fishing spots by season, quarry drops, birthdays and gifts, book and shrine maps, getting started, story progression, exploration, appearance, hunting, livestock, cooking, night preparation, shrine skills and more.
- **Save editor**: reads and edits a save in the browser and exports a new file. Nothing is uploaded. It covers player stats, items and containers, processing machines, livestock, NPC friendship, quests, collections and unlocks, plus the farm and indoor maps. See the [save editor guide](docs/save-editor.en.md).

Numbers and conditions are backed by game data. Rules that have not been verified are marked as such on the page. Coverage and known gaps are listed in [content coverage](docs/content-coverage.en.md).

## Running locally

You need Node.js 24 LTS. Browsing and building the site does not require the game or Python.

```sh
npm ci
npm run dev        # generate data and start the dev server; the URL is printed in the terminal
```

```sh
npm run build      # build the static site and Pagefind search index into dist/
npm run preview    # serve the production build
```

The site is fully static. Astro renders the pages at build time, React handles interactive parts such as filters, the planners and the editor, and Pagefind provides search. No server or database is needed after deployment. Large lists and detail data load on demand and render in batches, so judge performance in the production preview, not the dev server.

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

The save editor's regression tests use the author's test saves. The saves are not stored in plain form: CI decrypts `tests/fixtures/gamesave.tar.gz.enc` with a repository secret. Without the saves, those tests are skipped. See [tests/gamesave/README.md](tests/gamesave/README.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `src/pages/`, `src/components/`, `src/layouts/`, `src/styles/` | pages, components and styles |
| `src/domain/` | profit calculations, workflow simulation and entity relationships |
| `src/data/`, `src/lib/` | data access, save reading and writing, shared utilities |
| `src/i18n/` | UI locales and translation catalogs |
| `data/generated/build-25311578/` | current game snapshot (the older build `24969282` is kept for comparison) |
| `data/sources/` | maps, rules, save editor catalogs and other targeted data |
| `docs/` | documentation and data evidence |
| `public/` | icons, maps, scenery, portraits and other assets |
| `src/honogurashi_extractor/`, `tools/` | read-only extractor and maintenance scripts |
| `tests/` | extractor tests and notes on the test saves |

## Updating game data

You need Python 3.11+, uv and your own copy of the game. The extractor only reads game files and never modifies the game or saves. See [maintaining game data](docs/data-extraction.en.md) for the process and [assets](docs/assets.en.md) for where images come from.

## Contributing

Bug reports and suggestions are welcome as issues; pick the template that fits. Read the [contributing guide](CONTRIBUTING.en.md) before sending code.

## License

Copyright (c) 2026 _connlost.

- **Code** is licensed under [AGPL-3.0](LICENSE) with additional terms: a public deployment of a modified version must publish its source, keep the author credit and a link to this repository, be marked as modified, and use its own site name.
- **Guide text, translations, documentation and data curation** are licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). You may repost and adapt them for non-commercial use if you credit "静谧田园 Wiki (by _connlost)", link the original page and share adaptations under the same license. Commercial use needs the author's written permission.

See [LICENSING.en.md](LICENSING.en.md) for details and the attribution format.

The game's names, text, images and data belong to Nippon Ichi Software, Inc. and other rights holders. This is an unofficial guide, not affiliated with the developer or publisher.
