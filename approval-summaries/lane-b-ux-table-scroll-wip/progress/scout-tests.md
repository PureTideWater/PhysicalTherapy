# scout-tests progress (started 2026-10-27)
- [ ] Q1 e2e infra  - [ ] Q2 unit render  - [ ] Q3 matrix/synth  - [ ] Q4 consumers
## Q1 notes so far
- a11y.ts:53-66 atPhoneWidth(page, what, {axe}) sets 390x844, polls sidewaysScroll()=={scrollWidth:390, overflowing:[]} (73-93; elements inside an overflow-x auto/scroll/hidden/clip ancestor are excused), then expectAccessible (12, wcag2a/aa/21a/21aa -> includes scrollable-region-focusable), restores viewport.
- atPhoneWidth callers: unattested:94, packets:120,215,355,428, onboarding:502,524, pricing:144,193, screening:402(#42), contracts:167 (axe:false), viewer-phi:155.
- layout-1280.spec.ts: one test, own practice 'SYNTHETIC OTHER PRACTICE LAYOUT', CAS-08 + CAS-02, signed-off schedule, mapped no-agreement, March+April priced+triaged, packet first version. Visits version, packet, claims, remittances, remittance, coverage, runs, run, uploads, upload, contract, correspondence, by-reference, trace. 480s timeout.
- Seed (packages/db/src/seed.ts + apps/web/scripts/seed.ts): tenancy, personas, agreements, terms, correspondence; NO claims/cases data. Data comes from specs; fullyParallel, sharded by file -> north's rows are shard-dependent.
- CI at e908c21 push run 40401493722: e2e (1/2) 27 passed (5.0m), e2e (2/2) 27 passed (4.3m) = 54; jobs ~5.7 and 5.2 min; timeout-minutes 25; retries 1, failOnFlakyTests. 53 test( declarations + (one parametrised?).
- Route coverage gathered (see design file once written). Untouched by any spec: abstraction/ledger, settings/access-log, console/tickets, console/rule-releases, console/terms; console/specialist-queue reached (contracts.spec:109, hardware-key:59) with Practices table.
## Q2 done
- No vitest config in apps/web; root vitest.config.ts, unit project, node env (no jsdom/happy-dom/testing-library deps anywhere). 24 .test.tsx use react-dom/server renderToStaticMarkup. scroll-table.test.tsx exists (2 tests, :22 pins region markup with tabindex=0).
- ScrollTable at e908c21 already 'use client', ResizeObserver, tabIndex always 0, cue line above.
- ux-forms (17bbb70) adds Playwright-in-vitest harness: components/test-support/browser.ts (createViteServer + chromium), forms-harness.html/tsx, action-form.browser.test.tsx (forms-specific; shared-ness is a proposal).
## Q3 done
- matrix row: `| TBL-01 | title | assertion |` (fixtures.test.ts:36 regex ^\| ([A-Z]{2,3}-\d{2}) \| (.*) \| (.*) \|$, TEST_MATRIX must equal the md rows in order); section `## Tables (TBL)` + intro para + header.
- Needs: expected/types.ts:9 CASE_MODULES += 'TBL'; common.ts:18 MODULE_NUMBER TBL: 17 (ux-forms has FRM: 16); matrix.ts rows; registry.ts none(completesIn, reason, assertedBy) (registry.ts:27); fixtures/synthetic/TBL-0N/expected.json via pnpm synth. FRM uses completesIn 1.
## Q4 gathered
- screening anomalies.tsx: server comps; table :286 (10 cols, hand-rolled region, tfoot OtherGroups :229-268 summed row), top rows :359 (16 cols), coverage.tsx:61 bare (6 cols, StatusChip outcome, reason code+words). StatusChip whitespace-nowrap (status.tsx:25) -> long status overflows a stacked card at 390.
- screening.spec (#42) :488-491 uses page.locator('[data-group=..] [data-slot=status-chip]') -> stacked copy must NOT repeat data-group hooks (strict-mode 2 matches).
- Cases cases/page.tsx:242-287 (8 cols, link first), Claims claims/page.tsx:134-200 (conditional PHI cols, data-figure expected/paid/short), anomalies flagged lines :58 (observed, mode, short: not brand order), case page stacked lines precedent cases/[caseId]/page.tsx:173-190.
- Console: tickets:46 (ActionForm per row), prospects:50 (3 ActionForms), organizations/[id]:133 Members (Unlock, End membership), :191 Invitations (Send again).
- No aria-sort anywhere; one <caption> (reports/display.tsx:126). CardTitle is h2 -> stacked heading h3.
- Function props can't cross server->client: one-source must be server; ScrollTable stays the client leaf.
- NEXT: write design/tests-consumers.md
## DONE: design/tests-consumers.md written
