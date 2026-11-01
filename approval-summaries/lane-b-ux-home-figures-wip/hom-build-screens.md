# hom-build-screens progress (UX PR 9 screens; worktree /home/user/ux-home-figures)
Started 2026-11-01 fresh (no earlier file).
## Built (code, not yet checked)
- components/format.ts quarter() + format.test.ts (new)
- components/triage/display.tsx outOfFigureWords, actionableLinesWords (+ tests in display.test.tsx)
- components/reconciliation/display.tsx: recoveredCashWords; PAYER_APPROVED_NOTE, PAYER_APPROVED_HOME_NOTE, LEDGER_TOTALS_HELP maps by proof level; "stage five" gone (+ display.test.tsx)
- worker report/recovered-words.ts NOTHING_APPROVED_WAITING, ACTIONABLE_OPEN_LABEL/NOTE; report/public.ts exports; reconcile/statement-html.ts uses them
- ROI page reports/roi/[statementId]/page.tsx uses them
- components/dashboard/headline.tsx (new) HeadlineTiles, FirstUpload, uploadGate, actionableNote, recoveredPeriodWords + headline.test.tsx
- home page.tsx uses them; quarter row removed; agreements link for roles other than viewer-only
- Cases page header/cell/help; case page Actionable fact, Recovered words, Net expected value note; packet builder via actionableLinesWords
## Next
- run vitest/tsc/eslint; e2e edits (monitoring, packets, ledger-patient-share, reconciliation HOM-04, triage.spec:111); lint:copy
## Checks (17:30-)
- vitest 4 component files: 42 passed
- e2e edited: monitoring:104, packets:534, ledger-patient-share:62,63,91,92, triage:111, reconciliation:153 + HOM-04 step (caseId/statementPath captured); cases page header span data-figure="cases-actionable"
- tsc web 0 errors, worker 0; eslint 21 touched files 0; lint:copy pass (539 files); prettier not a repo standard (untouched files fail too)
- running: vitest --project unit apps/web apps/worker/src/report apps/worker/src/reconcile tools/brand-copy (bg)
- e2e running (bg): playwright reconciliation, ledger-patient-share, triage, monitoring, packets -> /tmp/hom-screens-e2e.log
- unit project apps/web + worker report/reconcile + tools/brand-copy: 95 files, 1297 tests passed
- e2e: 7 passed (6.2m), exit 0. DONE; brand.spec not run.
