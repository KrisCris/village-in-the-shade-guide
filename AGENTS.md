# Repository Guidelines

## Project Structure & Module Organization

This is an Astro static wiki with React interactive components and Pagefind search; production needs no application server.

- `src/pages/`: routes; `src/components/`: UI; `src/layouts/` and `src/styles/`: shared presentation.
- `src/domain/`: calculations and relationships; `src/data/`: catalog access; `src/lib/`: shared utilities.
- `data/generated/build-24969282/`: committed game snapshot; `data/sources/`: supplementary references.
- `public/`: shipped icons, maps, portraits, and other assets.
- `src/honogurashi_extractor/`, `tools/`, and `tests/`: Python extraction, maintenance scripts, and extractor tests. TypeScript tests live beside their modules.

## Build, Test, and Development Commands

Use Node.js 24 LTS and `npm ci`.

- `npm run dev`: regenerate site data and start Astro; use the printed URL.
- `npm test`: regenerate data and run Vitest.
- `npx vitest run src/data/guideContent.test.ts`: run a focused test without regenerating data.
- `npm run check`: check Astro and TypeScript.
- `npm run build`: generate data, static pages, and the Pagefind index in `dist/`.
- `npm run preview`: serve the production build.
- `npm run verify`: check content mappings, tests, types, and build.
- `npm run check:build`: validate built links after building.
- `uv sync --extra dev` / `uv run pytest`: install Python tooling and test extraction changes; Python 3.11+ is required.

## Coding Style & Naming Conventions

Follow nearby code: two-space indentation for TypeScript/Astro and four spaces for Python. Use PascalCase component filenames and camelCase functions. Keep TypeScript strict; preserve game IDs verbatim. Use `withBase` from `src/lib/sitePath.ts` for internal links, asset URLs, and fetches. No dedicated formatter or lint script is configured; avoid unrelated reformatting.

## Testing Guidelines

Use colocated `*.test.ts` / `*.test.tsx` Vitest tests and `tests/test_*.py` pytest tests. Cover changed behavior, edge cases, and reverse entity relationships. No numeric coverage threshold is configured. Run `verify` before merging; report unavailable game-dependent checks explicitly. Check responsive UI changes in a browser.

## Commit & Pull Request Guidelines

Prefer focused commits such as `fix(save-editor): normalize search` or `feat(workflow): add navigation`. PRs should describe changes, validation, relevant issues, and screenshots for UI changes. Update lockfiles with dependencies; preserve unrelated work.

## Data & Agent Safety

Game data is authoritative; AppMedia is reference material only. Never commit saves, secrets, raw archives, or private plans. Keep scratch output in ignored `output/` or `.local/`. Preserve verified snapshots and asset attribution. Prefer available codebase graph tools for structural discovery, validate coverage, and inspect source when coverage is incomplete.
