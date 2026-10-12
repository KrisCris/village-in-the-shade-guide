# Contributing

[简体中文](CONTRIBUTING.md) | **English**

Issues and pull requests are welcome. Contributions are licensed the same way as the part of the project they change: code under AGPL-3.0, text and translations under CC BY-NC-SA 4.0. You keep the copyright in your contribution. See [LICENSING.en.md](LICENSING.en.md).

## Setup

- Node.js 24 LTS; install with `npm ci`. Commit `package-lock.json` along with dependency changes.
- For the extractor or tools you also need Python 3.11+ and uv: `uv sync --extra dev`. Python dependencies are locked in `uv.lock`.
- Put scratch output in the ignored `output/` or `.local/` folders and keep it out of commits.

## Before you submit

- Run `npm run verify`, plus `uv run pytest` if you changed the extractor. CI runs the same checks on every pull request.
- Check UI changes in a production preview (`npm run build && npm run preview`): desktop and phone widths, light and dark themes, keyboard use and focus styles.
- Keep commits focused, with messages such as `fix(save-editor): …` or `feat(tables): …`. Say in the pull request what changed and how you checked it, and attach screenshots for UI changes.

## Data

- The game data is the only source of truth. Keep internal IDs and build numbers. External sites such as AppMedia can point you to something worth checking, but they never replace a game field.
- A price field does not mean a shop sells the item, and one random delivery request is not a fixed requirement. Mark unverified rules on the page.
- When you add a way to obtain or use something, check the reverse relationships too (item ↔ recipe ↔ machine ↔ shop).
- Keep the value added by processing separate from the full return starting from seeds, and state assumptions such as yield, season, quality, repeat harvests and machine time.
- Extract icons by following the game's table references. Don't guess from names or substitute a similar image.
- Don't overwrite the reviewed snapshot in `data/generated/` with raw extraction output.

## Code

- Two-space indentation for TypeScript and Astro, four spaces for Python. PascalCase component filenames, camelCase functions. TypeScript stays strict.
- Send internal links, asset paths and `fetch` calls through `withBase` from `src/lib/sitePath.ts`. Never write the deployment prefix into data.
- Use the project's themed controls (inputs, searchable dropdowns, buttons). Don't expose browser-default controls.
- Render large lists in batches and load data on demand. Filters apply to the full dataset. Don't put a whole dataset into static HTML.
- All Chinese and Japanese page text goes through `tr()` / `t()`, with translations added in `src/i18n/catalogs/`. `npm run i18n:check` catches anything missing.
- Tests sit next to their modules (`*.test.ts`); Python tests go in `tests/test_*.py`.

## Don't commit

Saves (except the encrypted `tests/fixtures/gamesave.tar.gz.enc`), secrets and `.env` files, raw game archives or full unpacked folders, scraping caches, screenshot logs, `node_modules` and private notes. The assets in `public/` and the snapshots in `data/` are build inputs and stay in the repository.
