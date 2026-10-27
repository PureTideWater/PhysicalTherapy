# build-e progress (slice E: end to end)

Worktree /home/user/ux-table-scroll, branch co-001/ux-table-scroll (HEAD 47b97c81 at start, tree clean). Do not commit.

## Steps
- [x] 0. Read design whole (s.12 wins), build-a..d notes, review JSON DRs.
- [x] 1. Read e2e code: a11y.ts, journeys.ts, layout-1280.spec.ts, helpers, personas, permissions, specs to touch.
- [x] 2. a11y.ts: atPhoneWidth { tables, soft }, rendered guard (4.2), DR-05 scrollersAtOdds poll (exported expectScrollersAgree), axeViolations shared.
- [x] 3. journeys.ts: tourPractice(page, {name, manager, supportFor}) (caller signs in + keeps worker). layout-1280: uses it; expectFitsItsCard at 1280 + 1263 (DR-04), fits/no role/no tabindex/no caption + agree poll (DR-05); DR-01 Tab to first claims link; exact at Rate record 1 + Receipts.
- [x] 4. synthetic-personas.ts: tables-manager, tables-specialist, tables-console-specialist, tables-admin, tables-support + 6th tables-ledger-specialist (reconciliation.spec's /abstraction/ledger; tour writes no ledger entry).
- [x] 5. journeys.ts helpers: registerKeyAndSignInAgain (clears key in dev store on retry: keys live in E2E_DEV_AUTH_DIR/store.json, NOT the DB), supportGrant.
- [x] 6. tables-phone.spec.ts written (test 1 manager routes + other-admin + tables-specialist; test 2 tables-admin/support/console-specialist). Not yet run.
- [x] 7. one-line calls: reconciliation, reports, packets, onboarding (+ rule-releases Affected runs in location test), models, unattested (Lines not on current pricing if present).
- [x] 8. DR-02 exact: true: layout 167/246 done; models 83,133,148,181,194; packets 98,132,144,282,431,501,507; pricing 238 (+ 'As PaidWhole recorded it' :141); reconciliation 105; unattested 62,171,172; uploads 53.
- [x] 9. tsc (apps/web) clean; eslint on my 13 files clean; lint:copy TODO.
- [ ] 10. build once (scratchpad/e/build.log; tree dirty so E2E_PREBUILT=1 refuses: run with scratchpad/e/pw.config.mts = repo config minus build step), e2e runs with E2E_DATABASE=tp_e2e_laneb E2E_PORT=3170 E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres (PG18 as CI).

## Findings (adapt per design)
- DR-02 full check script: scratchpad/e/substr.mjs (217 locators without exact, 40 substring hits; same-route hits = list in step 8; rest are other routes). getByLabel check: no same-route hits.
- e2e has no CONTENT_ROOT (production build) -> console rule-releases shows no Drafts table, no checker box, no prepared release notes. Not testable in e2e.
- /console/screening needs rate_record.approve (contract specialist), not platform admin -> tables-console-specialist.
- Hardware keys are in the local identity provider's store file (E2E_DEV_AUTH_DIR/store.json), not the DB.
- Tour practice: no ledger entries (no reconciling remittance) -> /abstraction/ledger to reconciliation.spec; no plan waiting on mapping -> upload MAP-03 (May, unmapped) in tables-phone; no version in progress -> models.ts draftContract; no grants -> insert a firm grant; cited page of the tour's schedule has no stored bytes -> box covered by draftContract's version + models.spec.
- Affected runs by practice needs a complete run: covered in onboarding location test (location-admin, after the chain priced).

## Handovers
- viewer-phi.spec.ts:152 reads 'As the engine recorded it' (now 'As PaidWhole recorded it'): vacuous toHaveCount(0); not my file.

## DR-02 result (after edits): 203 locators without exact; 20 remaining substring hits, all on other routes (see final report)

## e2e results (build: scratchpad/e/build.log, 1m27s; runs with scratchpad/e/pw.config.mts)
- tables-phone run 3 (14:xx): test 1 1.3 min (78 s, budget 480 s: no split), test 2 24.5 s. Every named table, every scroller-agreement poll and axe pass. Remaining soft failures, all page defects in files not mine (handovers):
  - /p/<id>/coverage: request-to-payer letter form selects (coverage/page.tsx:426,436) widen the page to 400 px with a long contract title (grid item min-width auto).
  - /p/<id>/uploads: uploader.tsx:324 'Kind of document' select widens the page to 393 px.
  - /console/rule-releases: console/rule-releases/page.tsx:107 manifest SHA-256 span (64 hex, unbreakable) widens the page to 502 px.
- Fixed in my files: React streaming leaves empty <table hidden><tbody> shells at the end of body -> rendered guard skips hidden tables with no row. models.ts draftContract needs models-specialist's grant -> local versionInProgress helper.
- Others run 1 (8.7 min): passed models, onboarding (3 of 4), packets x2, unattested, uploads x3, reports x2 of 3. Failed:
  - layout-1280: L1 'Fields of rate record 1' has min-w-[32rem] in a half-width card at 1280 (512 in 418 px): slice C regression (review.tsx:245) -> handover (drop min-w; then drop that name from tables-phone + models.spec tables lists). Also tabTo hung (date inputs: ':focus' matches nothing) -> fixed tabTo to read document.activeElement.
  - pricing :144: two ScrollBoxes in CLOSED <details> read stale sizes (Chromium content-visibility: hidden) -> agree check now uses checkVisibility(). Fixed.
  - SHA-256 mono spans overflow at 390 (handovers, not my files): console/rule-releases/page.tsx:107; reports/roi/[statementId]/page.tsx:74; reports/[reportId]/page.tsx:82,92; review/page.tsx:72; reports/documents/[documentId]/page.tsx:74 (once printed).
  - Next: temp soft run of layout/reports/reconciliation/onboarding/pricing to exercise later steps, then revert soft.
- TEMP: a11y.ts has a TEMPORARY-SOFT-RUN line (backup scratchpad/e/a11y.ts.keep); revert after the run
- TEMP soft line reverted (grep TEMPORARY a11y.ts = 0). Diagnostic soft run (3.3 min): pricing now passes; reconciliation's later steps (ROI Entries table, ROI statements, ledger specialist /abstraction/ledger 'Ledger entries') pass; reports' monthly + Generated reports pass; layout's only failure is L1 at 1280 (at 1263 the review grid is one column, xl = 1280). Every remaining failure is a page defect handed over.
- tsc clean, eslint clean on 13 files, lint:copy passed (516 files).
- Final run of all 10 specs started (scratchpad/e/run-final.log).
- FINAL run (scratchpad/e/run-final.log, 6.5 min, --workers=2): 14 passed, 6 failed. tables-phone test 1 1.4 min (budget 480 s), test 2 24.8 s. Every failure is a handed-over page defect: layout L1 (review.tsx min-w), onboarding location + tables-phone test 2 (rule-releases manifest hash), reconciliation (ROI SHA span), reports (report SHA spans), tables-phone test 1 (coverage letter selects, uploader kind select).
SLICE E DONE (not committed). Remaining: handovers only. e2e DB tp_e2e_laneb dropped.
