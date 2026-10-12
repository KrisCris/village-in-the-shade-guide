# Repository Guidelines

## Project Structure & Module Organization

This is an Astro static wiki with React interactive components and Pagefind search; production needs no application server.

- `src/pages/`: routes; `src/components/`: UI; `src/layouts/` and `src/styles/`: shared presentation.
- `src/domain/`: calculations and relationships; `src/data/`: catalog access; `src/lib/`: shared utilities.
- `data/generated/build-25311578/`: current committed game snapshot (`build-24969282` is kept for comparison); `data/sources/`: supplementary references.
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

## UI, Large Lists & Loading Performance

- Every new page element must be usable, visually polished, and consistent with the existing UI. Reuse themed components, spacing, typography, and interaction patterns. Check desktop and mobile layouts, keyboard access, and visible focus states.
- Do not expose unstyled browser-default controls, such as white inputs with black text, native-looking dropdowns, or default buttons. Use the project's themed inputs, searchable dropdowns, and buttons. Keep semantic HTML and accessibility behavior underneath the custom appearance.
- Pages with many entries, such as the full game-item catalog, must use incremental scroll loading and lazy loading where appropriate. Add search and category filters when the data supports categorization; apply them to the full dataset, not only the rendered rows.
- Assess initial HTML size, transferred data, DOM size, and rendering cost. Do not render an entire large dataset into Astro's static HTML. Load list data, details, and heavy UI on demand; render entries in batches or virtualize them as needed. Validate loading and scrolling in a production preview, not only the dev server.

## Player-Facing Copy

When writing or revising page text, use the `no-ai-slop` skill and review its checklist. Write direct, natural language using established game terminology. Explain what players can do and the verified conditions. Remove generic introductions, inflated claims, repetitive sentence patterns, and AI-sounding filler. Keep labels and instructions concise without removing necessary caveats.

## Testing Guidelines

Use colocated `*.test.ts` / `*.test.tsx` Vitest tests and `tests/test_*.py` pytest tests. Cover changed behavior, edge cases, and reverse entity relationships. No numeric coverage threshold is configured. Run `verify` before merging; report unavailable game-dependent checks explicitly. CI (`.github/workflows/ci.yml`) runs `verify`, `check:build`, and pytest on every pull request, using the encrypted save fixtures when the secret is available. Check responsive UI changes in a browser.

## Commit & Pull Request Guidelines

Prefer focused commits such as `fix(save-editor): normalize search` or `feat(workflow): add navigation`. PRs should describe changes, validation, relevant issues, and screenshots for UI changes. Update lockfiles with dependencies; preserve unrelated work.

## Data & Agent Safety

Game data is authoritative; AppMedia is reference material only. Never commit saves, secrets, raw archives, or private plans; the only save copy in Git is the encrypted `tests/fixtures/gamesave.tar.gz.enc` (see `tests/gamesave/README.md`). Keep scratch output in ignored `output/` or `.local/`. Preserve verified snapshots and asset attribution. Main docs have English versions (`*.en.md`); update both languages together. Licensing is described in `LICENSING.md`: code is AGPL-3.0-only with section 7 terms, original content is CC BY-NC-SA 4.0, and game assets are not licensed by the project. Keep the footer author credit. Prefer available codebase graph tools for structural discovery, validate coverage, and inspect source when coverage is incomplete.
