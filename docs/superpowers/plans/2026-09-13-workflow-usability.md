# Workflow usability implementation plan

**Goal:** Implement the user's workflow editing, delivery, picker and farmland requirements.
**Architecture:** Pure graph/progress helpers feed shared editor components; game extraction remains reproducible and separate from the planner. All edits stay in the production-workflow worktree.
**Tech Stack:** React, React Flow, TypeScript, Vitest, Python archive extractor, Playwright.
**Spec:** `docs/superpowers/specs/2026-09-13-workflow-usability-design.md`

## Global constraints
- Preserve explicit manual choices, undo/redo and saved plan compatibility.
- Day granularity; independent preview port 4335; no main-checkout changes.
- Use verified game data, never guess farm shapes or shop availability.

## Tasks
- [x] Correct plant quantity (`WorkflowEditor.tsx`, `NodeInspector.tsx`), edge contrast and daily cash copy (`WorkflowTimeline.tsx`); remove duplicate notices (`PlanResults.tsx`). Verify repeated 100 seeds still displays 100 land.
- [x] Add pure editing helpers in `src/domain/workflow/editing.ts` and tests. `addConnectedNode(plan, entities, kind, position, anchor)` returns one immutable graph edit. Validate cycles, terminal/root placement, insertion downstream inference and undo grouping.
- [x] Add card connector buttons and custom edge midpoint menu (`WorkflowCard.tsx`, `WorkflowCanvas.tsx`, `WorkflowEdge.tsx`, `WorkflowEditor.tsx`); current viewport placement with no frameSelection after insertion.
- [x] Add safe auto-reset check using a trial `resolveIntent` with the explicit field removed; disable reset unless the trial resolves the same selected item. Verify inventory feeding multi-input recipes preserves selection.
- [x] Add picker filters and incremental batches (`fields.tsx`, catalog helper), including keyboard navigation loading the next page. Verify category selection, all-season crop list and >80 matches.
- [x] Add delivery progress helper and upstream generation (`editing.ts`, `DemandDetails.tsx`). Tests: partial holdings, future arrivals, existing sources, repeated action idempotence, missing unknown sources. Render icons, quantities and dates.
- [x] Inspect local archive map metadata; implement `tools/extract-farmland.py`, provenance snapshot and `FarmlandPicker.tsx`. Validate every included shape and selected-cell count, apply to plant quantity.
- [x] Run focused/domain tests, Astro check, browser regressions, production build/link check. Commit verified work and update `docs/reports/2026-09-13-workflow-assistance.md`.


Validation: 37 files / 231 tests; Astro 187 files with zero diagnostics; 5180 built pages / 6243 paths; browser workflow, delivery, drag and farmland orientation checks passed on the independent preview. See docs/reports/2026-09-13-workflow-usability.md.
