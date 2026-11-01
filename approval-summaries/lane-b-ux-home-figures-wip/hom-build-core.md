# hom-build-core (data side, UX PR 9) progress
Started 2026-11-01 from base 83d71fd in /home/user/ux-home-figures (fresh; first run lost).
## Built (code)
- apps/worker/src/triage/actionable-now.ts (new): LATEST_STAGE, ACTIONABLE_NOW_LINE(x, stage?), ACTIONABLE_NOW, ACTIONABLE_NOW_LINES, ACTIONABLE_NOW_OF (cents, lines, open_lines, moved_on, stale; OFFSET 0 fence; practice_id matches); exported via triage/public.ts
- web lib/triage/queries.ts: old defs removed; CASES(where, order, window) pages cases first then lateral ACTIONABLE_NOW_OF; CaseSummary gains actionableNowMovedOn, actionableNowStale; net expected value from live figure (D6)
- web lib/dashboard/queries.ts: HOME_CASES one statement; Headline.actionable.outOfFigure {movedOn, stale}; Headline.recoveredSince; Dashboard.uploads.baaOnFile; recovered via practiceRecoveredPeriods (one ledger read)
- worker reconcile/statements.ts: recoveredPeriods, practiceRecoveredPeriods, RecoveredPeriods, OPEN_CASES_ACTIONABLE (D4); exported in reconcile/public.ts
- worker digest/figures.ts: deadlines sums ACTIONABLE_NOW (D5/F3 comment)
- web lib/uploads/gate.ts (new) baaOnFile/NO_BAA; routes/uploads.ts imports + re-exports
## Commands
- tsc --noEmit worker: 0; web: 0
## Next
- db tests (HOM-01 home-figures.db.test.ts), property test, update monitoring/report-documents/pricing-current db tests, EXPLAIN, CAS-41 timing, LED-11 run, eslint, hom-api.md
## Tests written
- apps/worker/src/reconcile/recovered-periods.test.ts (fast-check property, 500 runs + 2 examples): PASS
- apps/worker/src/triage/actionable-now.db.test.ts (statement in job scope + digest deadlines + recompute, priced-again): PASS
- apps/web/src/lib/dashboard/home-figures.db.test.ts (one statement via recording client; plan computes check at one node once; track_functions calls == lines at actionable; HOM-03 gate x4 vs uploadsPage): PASS
- pricing-current-routes.db.test.ts: figures() widened (header, rows w/ counts, tile, byState, ROI statement via route), moved-on test added, withdrawn test uses same figures: PASS
- reconciliation-routes.db.test.ts LED-06: recoveredSince 2026-06-09, practiceRecoveredPeriods == practiceLedgerTotals all/quarter, tile 3000/1 line, Cases, ROI statement: PASS
- monitoring-routes / report-documents-routes headline toEqual updated: PASS
## Measurement (scratch file apps/web/src/lib/dashboard/home-cost.measure.db.test.ts, DELETE before handoff; results /tmp/hom-measure/)
- 10k: old sum 863 ms (410+389+63), new 362 ms; check calls old 3780 new 1740; whole dashboard() ~1.28-1.39 s
- 100k: running (bg)
## Remaining: eslint/prettier, LED-11 run, full worker/web unit for touched, delete scratch file
