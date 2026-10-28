# p4 build B (table-parts.tsx new, anomalies.tsx, coverage.tsx, result-summary.tsx, result-tables.test.tsx new): progress

Slice: design sections 2, 3, 4.1 with section 12 (P4-DR-03 to -08, -10 (b)).

- [x] #42 not merged (gh api .merged = false, 2026-10-28): build as designed
- [x] read design (whole, incl. 12), review json, scouts' notes, slice A's progress (StackedRow.description exists)
- [x] read anomalies.tsx, coverage.tsx, result-summary.tsx, stacked-rows.tsx, status.tsx, result.test.tsx (pins), tables/type-scale guards
- [x] tests first: result-tables.test.tsx written (18 cases). Ran `vitest run --project unit .../result-tables.test.tsx`
      under the lock at a6e754fc+slice A: 17 failed / 1 passed. Failures: no `<ul data-stacked-copy="rows">` in any card
      (copies() finds no list), ANOMALY_COLUMNS/TOP_ROW_COLUMNS/COVERAGE_COLUMNS/anomalyItems/topRowItems/coverageItems/
      groupedCount undefined (typecheck TS2305 for each), the top rows' description is the old text ("The priced row,
      each by…", "the engine’s", "the claim count"). Passed only: repeatedIds [] (trivially, no stacked copy).
- [x] table-parts.tsx (Copy, ScreeningColumn, fieldColumns, headClass, cellClass, ColumnHeads, ColumnCells<K>, fieldsFrom<K>, StatusCell)
- [x] result-summary.tsx (CLAIM_LINES, ALLOWED_IN_FILE, groupedCount, None, 3.8 sentence, comment :72; counted import dropped)
- [x] anomalies.tsx (columns, cells by copy, items, sign key, 3.3 words, DR-03/-04/-05/-06)
- [x] coverage.tsx (columns, cells, items, reason in words, None, comment :11)
- [x] first run after the change: result-tables.test.tsx + result.test.tsx 44/44; apps/web tsc clean
- [x] checks under lock: components/screening + lib/screening unit + stacked-rows + app/tables + type-scale: 12 files / 132 tests pass;
      eslint on the five files clean; pnpm lint:copy clean (517 files); pnpm typecheck: apps/web fails ONLY in
      e2e/screening-phone.spec.ts (slice C's, lines 271 and 290: string | undefined), every other project passes;
      watched.test.ts fails as expected until slice D runs the generator (+table-parts.tsx, +stacked-rows.tsx,
      -lib/copy/words.ts)
- [x] worst-shape page (vitest --project db result-page.large.db.test.ts, 3/3 pass): page 1 387 KB (was 144 KB),
      +19.3 MiB after render (was +15.9); page 206 375 KB +16.1 MiB; page 411 205 KB +12.3 MiB. Under 460 KB (90% of the
      512 KiB cap), so no lean classes needed in stacked-rows.tsx. Log: scratchpad/p4b/large.log
- [x] final re-run after the last test tidy: 12 files / 132 tests; eslint clean; apps/web tsc clean (slice C's spec fixed)
STATUS: slice B DONE, not committed (orchestrator commits).
Notes:
- dropping counted() from result-summary.tsx likely drops apps/web/src/lib/copy/words.ts from the screening closure (slice D's generator)
