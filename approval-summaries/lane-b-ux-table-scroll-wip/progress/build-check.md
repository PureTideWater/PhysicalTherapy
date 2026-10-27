# build-check progress (integrator and checker, co-001/ux-table-scroll)

Worktree /home/user/ux-table-scroll. Started fresh (no earlier file).

## Steps
- [x] 0. Read progress A..F, design whole (s.12 first), review JSON, E's and F's uncommitted diffs (18 modified + 3 new + 4 fixture dirs; none of #42's but the allowed test-matrix, matrix.ts, registry.ts).
- [x] 1. Handovers applied (H1 below; registry TBL-02 MAP-03 + TBL-03 assertedBy unattested, pricing; synth --all wrote TBL-02/03 only, 630 unchanged). Commits: af13cc06 page fixes (8 files), b81f365c E (14 files), 8d3ce4e9 F (12 paths). Tree clean. None of #42's files but the 3 allowed.
- [x] 2. Diff review vs design (99 files): every 1.4 site present with its label and min-w (54rem cap; script check/sites.py), deviations: remittance Claims/Provider adjustments role-dependent widths (B2), review.tsx Fields none (H1). DR-01..16 all present (tests: DR-01 regionProps row, DR-03 no outline-none, DR-07b repeatedIds, DR-08 brandOrderProblems, DR-13 classes). No #42 file but the 3 allowed (rows only, 0 deletions); nothing under packages/db|pricing|ledger|money; no migration; no style=, no hex, no model name in added lines. Caption "Scroll sideways for more columns.", box suffix ", scrolls", "As PaidWhole recorded it" (no 'engine recorded it' left in specs/tests/UI). DR-02 check (E's substr.mjs on head): 203 locators without exact, 20 substring hits, all on other routes. No fix needed from the review.
- [x] 3. Checks: typecheck, lint, lint:copy, lint:logs, pnpm test, synth --all, verify-content, watched.test (after F1) all pass
- [x] 4. e2e final run passed on 35b14cd5 (and the other 9 edited specs once)

## Findings and fixes
- H1 (applied, uncommitted) page-fix handovers: review.tsx Fields table min-w-[32rem] dropped (+JSDoc why); wrap-anywhere on SHA-256 spans: console/rule-releases:107, reports/roi/[statementId]:74, reports/[reportId]:82,92, reports/[reportId]/review:72 (x2), reports/documents/[documentId]:74 (wrap-anywhere, not break-all, so "SHA-256" never splits); coverage letter selects w-full min-w-0 + wrappers min-w-0 (pricing-runs idiom); uploader 'Kind of document' select + column max-w-full; viewer-phi.spec.ts:152 'As PaidWhole recorded it'. New ux-forms overlaps: uploader.tsx, reports/[reportId]/review/page.tsx.
- H1 TODO: after e2e, if 'Fields of rate record 1' fits at 390 drop it from tables-phone.spec.ts:168 and models.spec.ts:138 lists.
- F1 (finding, fixed): watched.test.ts failed: new components/scroll-state.ts joined the screening import closure (scroll-table.tsx is on it via screening/anomalies, coverage); watched-paths.txt is #42's. Fix: state functions moved into scroll-table.tsx (unchanged), scroll-state.ts deleted, test import, a11y.ts comment, ADR 0078 Decision 2. watched + scroll-table + tables tests 28/28. Commit below.
- Postgres: both clusters were up (pg_isready on the default socket dir misled; /tmp socket answers). Setup script not run.
- typecheck (before F1): passed, 22 projects, 59 s.
- F1 commit: 61ba77ef
- typecheck (head 61ba77ef): passed 22 projects; lint: passed, 1,616 files, 0 errors, 0 warnings
- lint:copy passed (515 files; 516 before F1 removed scroll-state.ts); lint:logs passed (1,055 files)
- pnpm test: 379 files, 6,294 passed + 4 skipped (6,298; e908c21 CI 6,265 + 1 skipped = 6,266: +32 = scroll-table +17, stacked-rows +11, tables +3, result.test +1), coverage thresholds held, 280 s
- synth --all: 0 written, 632 unchanged (no stale fixture; CI's git diff/status check clean); verify-content: every content set passes; packages/db|pricing|ledger|money: no change (golden not needed)
- e2e run 1 started (check/e2e-run1.log; DB tp_e2e_laneb_check, port 3170, PG18)
- e2e run 1 (head 61ba77ef, 148 s wall): layout-1280 passed (32.0 s), tables-phone test 2 passed (18.5 s), test 1 failed (1.2 min) on one soft check only: 'Fields of rate record 1' fits at 390 (H1's review.tsx change). Every other route passed (coverage selects, uploader, SHA spans fixed).
- F2 (fixed): dropped 'Fields of rate record 1' from tables-phone.spec.ts (route kept, no table named) and models.spec.ts. eslint clean. Commit 35b14cd5.
- NEXT: final e2e run (tables-phone + layout-1280, workers 2) on this head; then models.spec.ts alone to verify F2.
- FINAL e2e (head 35b14cd5, workers 2): 3 passed, 124 s wall (Playwright 2.0 min incl. prepare and build); tables-phone test 1 1.1 min (budget 480 s), test 2 20.2 s; layout-1280 29.0 s. Next: models.spec.ts alone (F2).
- models.spec.ts alone (head 35b14cd5): 1 passed (33.5 s), F2 verified. Next: reconciliation, reports, onboarding (E's failing specs, fixed by H1's hash spans) once.
- reconciliation + reports + onboarding (head 35b14cd5): 9 passed, 161 s wall (E's hash-span failures fixed).
- viewer-phi + uploads + pricing + packets + unattested (head 35b14cd5): 8 passed, 225 s wall.
- Final typecheck on 35b14cd5: passed. e2e DB tp_e2e_laneb_check dropped, its /tmp dirs removed. Tree clean, 11 commits ahead of origin/claude/build-platform, not pushed.
ALL DONE.
