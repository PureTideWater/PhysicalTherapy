# UX PR 3 (co-001/ux-table-scroll): tests and consumers (scout 3 of 3)

Base: /home/user/ux-table-scroll at e908c21. Read-only. Every line number below is at e908c21 unless marked. Synthetic
data only. Sources: the UX review (scratchpad uxreview.md) §3 UX PR 3 (:204-218), UX PR 4 (:220-231), UX PR 34
(:572-580), ### UX-011 (:1781), ### UX-079 (:2997), ### UX-005 (:1648), UX-040 (:2256), UX-042 (:2294), UX-043 (:2313),
UX-078 (:2978), UX-132 (:4004), UX-206 (:5410); prs.json orders 3, 4, 34, 85.

**Re-check against the review (4d99df8 to e908c21).** The review's "the 390 px guard runs in five specs" is stale: it
now runs in eight files (list in 1.1). `ScrollTable` is no longer the bare 4d99df8 scroller: it is already `'use
client'`, `relative`, with a ResizeObserver and a cue line, and has a unit test (2.1). screening.spec.ts:728's own
`noSidewaysScroll` is not re-checked (a #42 file).

---

## 1. The e2e infrastructure

### 1.1 apps/web/e2e/a11y.ts (not a #42 file; in PR 3's file list)
- `expectAccessible(page, what)` :11-15: axe-core via `@axe-core/playwright` 4.13.0, tags `wcag2a, wcag2aa, wcag21a,
  wcag21aa`, expects `violations` to equal `[]` (rule, impact, first 5 targets). `scrollable-region-focusable` is in
  `wcag2a`, so every axe call already catches a scroller without a tab stop **when it overflows** (axe only flags a
  region whose content scrolls).
- `tabTo(page, {role, name})` :22-46: Tabs from `body` (max 120), asserts the focus is visible (outline or box-shadow).
  Only links and buttons: it cannot target a `region`. A keyboard check of a scroller needs a new helper (proposal in
  section 6: `tabToRegion`, or widen `tabTo`'s role union to `'region'` and read `aria-label`).
- `atPhoneWidth(page, what, { axe? })` :53-66: sets 390 x 844; `expect.poll(sidewaysScroll)` toEqual
  `{ scrollWidth: 390, overflowing: [] }`; then `expectAccessible` (unless `axe: false`); restores the viewport in
  `finally`. **What it asserts: no page wider than the viewport**, and the offenders by name.
- `sidewaysScroll()` :73-93: an element counts as overflowing when its right edge passes the window and no ancestor up
  to `body` has `overflow-x` auto, scroll, hidden or clip; only the innermost offenders, first five, named by tag,
  `data-*`/`id` hooks and six classes. Consequence for PR 3: a table inside **any** scroller (bare `overflow-x-auto`
  included) passes the width check; only axe's `scrollable-region-focusable` catches a bare scroller, and only while it
  overflows, so the pass must run on routes **with rows wide enough to overflow at 390**.
- Callers of `atPhoneWidth` now (8 files, 12 calls): unattested.spec.ts:94 (packet review), packets.spec.ts:120 (packet
  builder, first version), :215 (Settings, Correspondence), :355 (packet review), :428 (packet by reference),
  onboarding.spec.ts:502 (coverage with a waiting month), :524 (settings/pricing with a waiting month), pricing.spec.ts
  :144 (line trace), :193 (re-run's page), contracts.spec.ts:167 (`axe: false`: the version page), viewer-phi.spec.ts:155
  (viewer's line trace), screening.spec.ts:402 (#42).

### 1.2 apps/web/e2e/layout-1280.spec.ts (not #42; not ux-forms)
One test (:106), `test.setTimeout(480_000)`, viewport 1280 x 900 (`test.use` :39). Its own practice, `SYNTHETIC OTHER
PRACTICE LAYOUT` (:28), via `journeyPractice` (BAA and engagement letter on file, support grants), signed in as
`pricing-manager` (:30, `signInWithTotp`). Setup (:114-147): uploads SYNTHETIC CAS-08 (payer Q, three 97110 lines, March,
each 30.00 short) and CAS-02 (payer N, 32 lines, April); `signedOffSchedule` for CE:SYNPLAN-FIX-ONE; maps
CE:SYNPLAN-OON-CAS as no agreement on /mapping; `pricedAndTriaged` March and April with `startLocalWorker()`. Every
setup step is retry-safe (`uploadedEarlier`, `untilLoaded`, idempotent journey helpers). Then reads IDs from the
database (:149-163) and visits: contract version (:166), packet builder (:180, writes the first version), claims (:199),
remittances (:210), a remittance (:213), coverage (:216, :254), March run (:219, :271), April run (:226), pricing runs
(:233), uploads (:245), an upload (:248), a contract (:251), the coverage report document (:255-256,
`/reports/documents/[id]`), settings/correspondence (:262), cases/by-reference (:265), a line trace (:272). Helpers in
the file: `pageWidths`, `placement` (does the table fit its scroller, which headers pass), `expectFitsItsCard`,
`headerGaps`/`expectHeadersApart` (HEADER_GAP 6 px), `expectNoSidewaysScroll`; all checks soft.
- Note for the 1280 half: `placement()` (:51-64) takes `table.parentElement` as the scroller. A wrapper change that
  puts a new element between the scroller and the table (e.g. an inner `min-w-[…]` div, or a fade layer) breaks it;
  keep the `<table>` a direct child of the region, or update `placement`.

**This is the natural host of the 390 pass.** Its practice already holds rows in most UX-011 tables; a new phone pass
appended as further `test.step`s (each `atPhoneWidth(page, …)` restores 1280) costs no new setup (setup is the long
part). A second spec would need its own practice (a shared practice name races under `fullyParallel`) and its own
2-3 minutes of upload, pricing and triage.

### 1.3 helpers.ts, journeys.ts, prepare.ts; how specs sign in and reach routes
- helpers.ts (a ux-forms file; not #42): `withDatabase` :8 (superuser client on the e2e database), `practiceId(name)` :18
  (the seed's `north`/`south`/`other`), `enterPassword` :29, `signInWithTotp(page, key, ahead)` :41-60 (password, then
  TOTP from `personaTotpCode`, retrying the next 30 s step when a parallel spec used the code), `refusal` :63,
  `addVirtualKey` :68 (CDP WebAuthn), `signInWithKey` :76, `registerKeyAndSignIn` :84-91 (internal personas: console
  routes need a hardware key, so `registerKeyAndSignIn(page, 'onboarding-admin' | 'contracts-specialist' | …)`).
- journeys.ts (not #42, not ux-forms): `journeyPractice({ name, settings, internal? })` :71 (a practice of its own in
  the other group, created once per database, found by name on a retry; BAA and engagement letter inserted at ~:86;
  support grants for the contract specialist and named internal personas at ~:92); `JOURNEY_PRACTICE_ADMIN =
  'other-admin'` :61 (the practice administrator of every journey practice: the persona for `/settings/access-log`);
  `queue`, `until`, `chainFrom`, `chainPricedMonths`, `uploadedEarlier` :184, `untilLoaded` :207, `newestDocument` :215,
  `signedOffSchedule` :264, `pricedAndTriaged` :365. Routes are reached by `page.goto` on IDs read with `withDatabase`.
- prepare.ts (**#42 file, excluded**): drops and creates the e2e database, migrates, loads SYNTHETIC release 900001,
  `seed()`, `approvePreparedSplit` (every practice gets the approved place-of-service split, so `/settings/pricing`'s
  "Places of service in effect" table has rows in every practice), creates pg-boss queues. Runs once per Playwright
  webServer start, i.e. **once per CI shard**.
- The seed (`pnpm db:seed` = apps/web/scripts/seed.ts over packages/db/src/seed.ts): organizations (group, other group,
  firm, internal, SYNTHETIC SUSPENDED GROUP), personas (apps/web/scripts/synthetic-personas.ts, `SYNTHETIC_PERSONAS`
  :49ff; passwords and TOTP derived from the key), practices north, south, other (packages/db/src/seed.ts:41-43) with
  their agreements (:52-56, plus north's extra :60-66), accepted synthetic terms, the group's correspondence contact.
  **The seed loads no remittance, claim, run, case or ledger row.** Every data table's rows come from a spec.
- Playwright config (apps/web/playwright.config.ts): `fullyParallel: true` (:79), CI `retries: 1` and
  `failOnFlakyTests` (:83-84), one project (Desktop Chrome). CI shards by test (`--shard`), each shard its own seeded
  database, so **north's and south's rows depend on which tests share the shard**: a phone pass must never rely on
  north/south data that another spec loaded (reports.spec.ts:46 reads north's anomalies; that works only when
  uploads.spec's north uploads land in the same shard first: not a pattern to copy).

### 1.4 UX-011's routes: which spec or the seed populates the wide table

Legend: **L** = layout-1280.spec.ts's practice already has rows there (a new 390 step in that spec sees the table
populated); **L+** = reachable in that practice with one more `goto` or persona and (expected) populated; **S** = another
spec populates it in its own practice (a 390 call would go in that spec); **0** = no spec reaches it; **#42** = out.

| Route (UX-011 list) | Table(s) and file:line | Populated by | Reaches it today | 390 pass: where |
|---|---|---|---|---|
| /p/[id] | Agreements, page.tsx:438 (5 cols, SHA-256) | seed (north/south/other) and `journeyPractice` (BAA, engagement letter) | many (monitoring, triage, sign-in, packets:461) | **L+** (one goto; 2 rows, overflows) |
| /p/[id]/claims | Claims and lines, claims/page.tsx:134 (11 cols for PHI roles) | CAS-08 + CAS-02, 35 lines | layout:199, remittances.spec:53, era-exports:119, brand:358 | **L** |
| /p/[id]/cases | Cases, cases/page.tsx:242 (8 cols) | payer Q's case (3 lines) | triage.spec:62-96, packets:420, reports:48 (north, shard-dependent) | **L+** |
| /p/[id]/cases/[caseId]/packet | Line schedule, packet/page.tsx:546 | first version, 3 lines | layout:180, packets.spec (atPhoneWidth :120) | **L** |
| /p/[id]/anomalies | Anomaly cohorts, anomalies/page.tsx:162 (9 cols); Flagged lines :58 (`?anomaly=`) | CAS-02's no-agreement lines (layout says "some flagged as investigatory"; cohort minimum to confirm on the first run) | reports.spec:46 (north, shard-dependent) | **L+** (both: list, then open the first cohort) |
| /p/[id]/abstraction/ledger | Entries, abstraction/ledger/page.tsx:48 | ledger entries (needs the contract specialist under a grant, `ledger.adjust`; entries exist after reconciliation) | **0** | reconciliation.spec's practice + `contracts-specialist`? grant: needs a step; else **0** |
| /p/[id]/contracts | Contracts, contracts/page.tsx:91 (bare in card) | payer Q's signed-off contract | contracts.spec:72,201,211; packets:436 | **L+** |
| /p/[id]/contracts/[contractId] | Versions | one version | layout:251 | **L** |
| /p/[id]/contracts/versions/[versionId] | Fields (review.tsx:240) | one rate record | layout:166, contracts.spec (atPhoneWidth :167, axe off) | **L** |
| /p/[id]/mapping | Payers and plans | Q and N plans | layout:135 (only on a first attempt), contracts:184, mapping.spec:50, pricing:76, onboarding:453 | **L+** (goto unconditionally) |
| /p/[id]/remittances | Remittances, remittances/page.tsx:71 (bare in card) | 2 remittances | layout:210, remittances.spec:38 | **L** |
| /p/[id]/remittances/[remittanceId] | Claims | CAS-08's claims | layout:213 | **L** |
| /p/[id]/pricing-runs/[runId] | Unpriced reasons, Variance by payer pattern, Run lines | March, April | layout:219,226; pricing.spec (atPhoneWidth :193) | **L** |
| /p/[id]/pricing-runs/compare | diff.tsx tables | March vs April | pricing.spec:225 | **L+** (`?before=march&after=april`; confirm the compare accepts runs of different periods) |
| /p/[id]/reconciliation | Exports :306, Ledger entries :145 | posting/EFT exports | reconciliation.spec:69-229, packets:451, ledger-patient-share, brand:410 | **S** reconciliation.spec (the layout practice shows empty states, no table) |
| /p/[id]/reports/[reportId] | reports/display.tsx:120 (the one `<caption>`, :126) | an audit report | reports.spec:143,228 | **S** reports.spec |
| (reports/documents/[id]) | documents.tsx | coverage report | layout:255 | **L** |
| /p/[id]/reports/roi | ROI statements, roi/page.tsx:63 | a statement | reconciliation.spec:171-177 (generated), :235 (viewer) | **S** reconciliation.spec |
| /p/[id]/settings/access-log | Access log, access-log/page.tsx:46 | access events from the journey's PHI reads | **0** | **L+** as `other-admin` (practice_admin has `access_log.read`, packages/db/src/authz/permissions.ts:179); a second context |
| /p/[id]/support-access/[supportGrantId] | reads | | | **#42** (UX PR 76) |
| /p/[id]/uploads | Receipts (receipts.tsx, unnamed) | 2 uploads | layout:119,245; many | **L** |
| /p/[id]/packet-reviews | Exports waiting, packet-reviews/page.tsx:48 | an approved, exported packet | packets.spec:333, unattested.spec:60,170 | **S** packets.spec (:333, before :355) or unattested.spec |
| /p/[id]/settings/pricing | Places of service in effect, settings/pricing/page.tsx:137 | prepare.ts's approved split (every practice) | onboarding:437,520 (atPhoneWidth :524) | **L+** (as `other-admin` if the billing manager cannot read it) |
| /console/prospects | Audit requests, prospects/page.tsx:50 (bare, 8 cols, 3 forms) | onboarding's request (:74-83) | onboarding:98, screening.spec:637 (#42) | **S** onboarding.spec (after :100) |
| /console/specialist-queue | Practices | grants | contracts.spec:109, hardware-key:59 | **S** contracts.spec:109 |
| /console/support | | | | **#42** (UX PR 74) |
| /console/tickets | Tickets, tickets/page.tsx:46 | onboarding's ticket (:311-315, from `/support`) | **0** (only `/support`'s own table) | **S** onboarding.spec, an internal persona after :315 |
| /console/rule-releases | notes, check problems (:195,213), note.tsx:94 | release 900001 (prepare.ts) | **0** | new step: platform admin; rows exist from prepare.ts |
| /console/compliance | controls | 17 controls | onboarding:147 | **S** onboarding.spec |
| /console/terms | terms versions | seed's synthetic terms | **0** | new step as platform admin |
| /console/organizations/[organizationId] | Members :133, Invitations :191, Agreements :236, Grants :305 | onboarding's new group | onboarding:341-375 (and :98-111) | **S** onboarding.spec |
| /settings/billing/[organizationId] | invoices, :126 | an invoice | billing.spec:95 (suspended group), onboarding:226 | **S** onboarding.spec (if it holds an invoice) or billing.spec |
| /settings/organizations/[organizationId]/users | | | | **#42** (UX PR 75) |
| /screening/results/[resultId] | anomalies, top rows, coverage | | screening.spec (#42) only | **UX PR 4** (`screening-phone.spec.ts`, new); PR 3 has a unit render of coverage.tsx |

Routes no spec reaches with data: `/abstraction/ledger`, `/settings/access-log`, `/console/tickets`,
`/console/rule-releases`, `/console/terms` (and, with rows, `/console/screening`, reached only by #42's spec).
Reached only in a state where the wide table is absent or fits (the review's point, re-checked): settings/pricing
(onboarding:524 runs at a waiting month; the split table is present but short) and the packet builder (packets:120 has
it; it fits at 390 only inside its scroller).

### 1.5 CI cost and counts at e908c21
- ci run 40401493722 (push of e908c21, "Merge pull request #48"): **e2e (1/2) 27 passed (5.0m)**, **e2e (2/2) 27 passed
  (4.3m)** = **54** (check-run annotations). Jobs 121849065662 (21:08:16-21:13:58, 5.7 min) and 121849065557
  (21:08:01-21:13:12, 5.2 min); the journeys step alone 5.0 and 4.3 min. Two shards on the public repository, three on
  a private one (ci.yml:421); `timeout-minutes: 25` (ci.yml:417). Matches lane-b-ci-deps-verify-summary.md (e2e 54,
  unit 6,265 + 1 skipped, golden 376, db 9,222 + 1 skipped over 127 files).
- `test(` declarations in apps/web/e2e: 53 in 26 spec files (layout-1280 is 1); 54 run (the extra one not traced: a test declared in a loop or by a helper).
- Cost of the 390 pass inside layout-1280: about 20 routes x (goto + `atPhoneWidth` poll + axe) ≈ 2-4 s each ≈ 1 min on
  one worker; keep `test.setTimeout(480_000)` or raise it to 600_000. Per-route cost in other specs: one call each.
  The count stays 54 when the pass is steps inside existing tests (preferred: `failOnFlakyTests` makes a new test's
  first flake a red run).

### 1.6 Which e2e files are #42's (excluded)
env.ts, prepare.ts, screening.spec.ts, screening.ts, mail.ts, mail-cutoff.spec.ts, mail-notices.spec.ts (the last two
are new in #42; not on e908c21). ux-forms also changes contracts.spec.ts, helpers.ts, triage.spec.ts and adds
forms-keep-input.spec.ts (keep-both if touched; better: PR 3 touches none of them).

---

## 2. Unit tests for components

- There is **no vitest config in apps/web**. The root vitest.config.ts has three projects: `unit`
  (`{apps,packages,infra,tools}/**/*.test.{ts,tsx}` minus `*.db.test.ts`, `*.golden.test.ts`, `apps/web/e2e/**`; global
  setup tools/test/ci-chromium.ts fails CI when Playwright's Chromium is missing), `db`, `golden`. No `environment`
  is set: **node**. No jsdom, happy-dom or @testing-library anywhere in the workspace's package.json files.
- How .test.tsx files render: `renderToStaticMarkup` from `react-dom/server` (24 files in apps/web/src and
  packages/ui/src), then regex or `toContain` on the HTML. Example: apps/web/src/components/scroll-table.test.tsx (2
  tests): :22 pins `^<div role="region" aria-label="Run lines, scrolls sideways" tabindex="0" class="relative min-w-0
  max-w-full overflow-x-auto `; :26 no `data-state="scrolls-sideways"` on the server. Other pins on ScrollTable's markup
  (from the inventory scout): pricing content.test.tsx:87, diff.test.tsx:71,235, calculation-words.test.tsx:91; screening
  result.test.tsx:479-480 pins the hand-rolled screening regions. A class-string change in ScrollTable breaks the
  prefix regexes; keep the classes' order and append, or loosen the pins in the same PR.
- `ScrollTable` at e908c21 (components/scroll-table.tsx:1-54): `'use client'`; `useEffect` measures
  `scrollWidth > clientWidth`, observes the scroller and its children with a ResizeObserver; `tabIndex={0}` always; the
  cue `<p aria-hidden data-state="scrolls-sideways">` above, at every width.

**How scroll-table.test.tsx can check both behaviours:**
1. Server tab stop, name, region, `relative`, no cue, no fade class (or the fade classes present but inert): extend the
   existing `renderToStaticMarkup` test. This is the "tab stop rendered on the server" half and needs nothing new.
2. The ResizeObserver behaviour (tab stop dropped only while the table fits; cue and fades only while it overflows):
   no DOM in the unit project. Options, best first:
   - (a) Move the decision into a pure exported function, e.g. `scrollState({ scrollWidth, clientWidth, scrollLeft })`
     returning `{ tabStop, startFade, endFade, cue }`, unit-tested in node over fits / overflows / scrolled to the end /
     1 px rounding (`scrollWidth - clientWidth <= 1` counts as fitting); the component only wires it. Plus the e2e: at
     1280 a fitting table's region has no `tabindex` once hydrated; at 390 it has `tabindex="0"` and the cue shows.
   - (b) A real browser in the unit project: ux-forms (origin/co-001/ux-forms 17bbb70) adds
     `apps/web/src/components/test-support/browser.ts` (Vite's `createViteServer` + Playwright Chromium,
     `withHarness`, `open(form, { width })`), `forms-harness.html`/`.tsx`, `action-form.browser.test.tsx` (16 tests).
     It is forms-specific (`?form=` entries in forms-harness.tsx) and not on the base. If ux-forms merges first, a
     `scroll-table.browser.test.tsx` with its own harness entry could resize a real page (390 vs 1280) and read
     `tabindex`; but that changes ux-forms' files (keep-both) or duplicates the harness. Proposal, not this PR's
     dependency.
   - (c) Adding jsdom or happy-dom: a new dependency under ADR 0066's pinning and advisory gates, and neither
     implements layout (`scrollWidth` is 0), so ResizeObserver would be mocked: tests the mock. Not recommended.
- stacked-rows.test.tsx: `renderToStaticMarkup` suffices if `StackedRows` is a server component (section 4).

---

## 3. Test-matrix and synth conventions; TBL-01 to TBL-04

### 3.1 Conventions
- docs/product/test-matrix.md: one `## Name (CODE)` section per module, an intro paragraph naming the ADR and the
  reservation, then `| ID | Case | Assertion |` / `| --- | --- | --- |`, one row per case on one line. Last sections at
  e908c21: BIL (:236-248), CI (:250), DBF (:277-289), RCC (:291-…, last). ux-forms adds `## Forms (FRM)` with FRM-01 to
  FRM-08 (its merge commit 9f9757e orders RCC before FRM). TBL goes last (after FRM when both are in).
- packages/synth/src/fixtures.test.ts:34-44: parses every line matching `^\| ([A-Z]{2,3}-\d{2}) \| (.*) \| (.*) \|$`
  and requires `TEST_MATRIX` (matrix.ts) to equal those rows in order, word for word, `CASES` ids in the same order,
  `REGISTRY_IDS` the same set; :46-56 every case has `completesIn` 0..13 and files or a `noFileReason`; :58ff every
  `assertedBy` path exists. Pipes or backticks inside an assertion are fine; a literal `|` is not.
- packages/synth/src/expected/types.ts:9 `CASE_MODULES` = [... 'DBF', 'RCC'] (ux-forms adds 'FRM'): add `'TBL'`.
- packages/synth/src/cases/common.ts:18 `MODULE_NUMBER` is `Record<CaseModule | 'VAR', number>` (compile error without
  the entry): `..., RCC: 14, BIL: 15` (ux-forms: `FRM: 16`); add **`TBL: 17`** (reserved, status file).
- packages/synth/src/cases/matrix.ts: `{ id, title, assertion }` objects in matrix order (BIL :366-401 shows the long
  form, DBF :418-422 the one-line form).
- packages/synth/src/cases/registry.ts:27 `none(completesIn, noFile, assertedBy?)`; no-file entries: BIL-01 to BIL-06
  :572-592 (completesIn 11), DBF :615-619 (0), RCC :621-646 (0 or 7); ux-forms FRM-01 to FRM-08 use **completesIn 1**
  ("The forms are refused in a browser harness with in-memory actions, and on synthetic sign-ins and practices the seed
  creates; no file."). Use 1 for TBL too (the same UX baseline series), with assertedBy the four test files.
- `pnpm synth` then writes fixtures/synthetic/TBL-0N/expected.json (shape: fixtures/synthetic/BIL-06/expected.json:
  case, module, title, assertion, synthetic, completesIn, assertedBy, codeListRelease null, noFileReason, files []...).
  These four files join the PR (generated, never hand-written).

### 3.2 Draft rows (one per test prs.json order 3 names)

Section intro (draft): "## Tables (TBL)" / "The tables of the UX baseline review's third pull request (docs/adr/0078 if
the design needs one; ADR 0056's phone rule): every data table scrolls inside a named region a keyboard reaches and
says that it scrolls, no page scrolls sideways at a phone's width, and phones get one stacked-row layout. TBL-01 to
TBL-04 are Lane B's reservation."

| ID | Case | Assertion |
| --- | --- | --- |
| TBL-01 | A wide table's scroller | The scroller is a region named "<the table's name>, scrolls sideways", `relative`, with a visible focus ring, and is rendered on the server with tabindex 0, so it is reachable before any script runs; in the browser it drops the tab stop only while its table fits and takes it back when the table overflows again; the edge fades and the phone caption show only while columns lie past an edge, drawn by classes alone (no style attribute); every data table in apps/web sits in the scroller or a stacked layout |
| TBL-02 | No page scrolls sideways | At 1280 px each wide table fits its card or scrolls in its own region, every table's headers stand apart and no page scrolls sideways; at 390 px no changed route is wider than the window, every element past its right edge sits inside a scroller, and a populated wide table shows the caption that says it scrolls |
| TBL-03 | Every changed route at a phone's width passes axe | At 390 px every changed route, each with its wide table populated and overflowing, has no axe-core WCAG 2.1 A or AA violation, a scrollable region the keyboard cannot reach (scrollable-region-focusable) among them |
| TBL-04 | One stacked-row layout | Each stacked row is a list item headed by its naming cell (a link when the row has one), then a definition list of each column's label and value, then the row's actions; expected, paid and short stand in that order whatever order they are given in, each in the mono face with tabular numerals; a status is text on its tint and wraps inside the card; the stacked rows hold every column the table shows and repeat none of the table's row hooks |

Registry draft (assertedBy to match the files the PR adds):
- TBL-01: `none(1, 'The scroller is rendered from a synthetic table the test passes in memory, and measured in the browser on a synthetic practice a journey loads; no file.', ['apps/web/src/components/scroll-table.test.tsx', 'apps/web/e2e/layout-1280.spec.ts'])` (+ the table-guard test if the PR adds one).
- TBL-02: `none(1, 'A synthetic practice of its own loads SYNTHETIC CAS-08 and CAS-02, whose files belong to those cases; no file.', ['apps/web/e2e/layout-1280.spec.ts', ...other specs that gain a 390 call])`.
- TBL-03: `none(1, 'The routes read synthetic practices the journeys load; no file.', [the same e2e specs])`.
- TBL-04: `none(1, 'The stacked rows are rendered from synthetic rows the test passes in memory; no file.', ['apps/web/src/components/stacked-rows.test.tsx'])`.
Wording note: the assertion strings must be byte-equal in test-matrix.md, matrix.ts and (generated) expected.json;
curly apostrophes are used elsewhere in registry reasons, straight ones in the matrix (match BIL's style: straight).

---

## 4. Consumers of the stacked-row primitive

### 4.1 UX PR 4 (prs.json order 4; UX-005, UX-040, UX-042, UX-043, UX-132, UX-206)
Files: components/screening/anomalies.tsx, coverage.tsx, result-summary.tsx, lib/screening/labels.ts, result.test.tsx,
e2e/screening-phone.spec.ts (new). All three tables are **server components** (no `'use client'` in anomalies.tsx or
coverage.tsx) rendered into `/screening/results/[resultId]`.
- **Anomalies by code and payer product** (anomalies.tsx:275-341): card title `h2#screening-anomalies` (:279) names the
  region and table by `aria-labelledby`; hand-rolled region `div.overflow-x-auto role=region tabIndex=0
  data-scroll="anomalies"` (:286). Columns (:290-299): Code (mono), Payer product (text), Rows (count), Claim lines
  (count), Medicare figure (money), Reduced figure (money or a dash with sr-only reason, `Reduced` :122-132), Allowed in
  your file (money), Difference (money), Reduced difference (money or dash), Status (`GroupStatus` :161-166: a
  `StatusChip` with long words, e.g. "Anomaly: 3 of 4 rows more than $5 a claim line below their lowest figure").
  Row hooks: `tr[data-group="<code>:<product>"][data-group-no]` (:304). A **footer row** `tfoot tr[data-group="others"]`
  (`OtherGroups` :229-268): "The other N groups, summed" with a note, the same figures, and a chip. Pagination
  (`GroupPages` :198) and the empty state (:283-284, `EmptyState`) sit outside the table.
- **Rows with the largest differences** (`ScreeningTopRows` :345ff): 16 columns (:363-378): Row, Code, Modifiers,
  Units, Place of service, Payer product, Quarter, "Claims" (UX-043: "Claim lines"), two Medicare line/figure pairs,
  Allowed, two differences, Status; region `data-scroll="top-rows"` (:359).
- **Coverage** (coverage.tsx:50-112): bare `div.overflow-x-auto` (:61) (UX-011; PR 3 wraps it). Columns: Payer product,
  Outcome (`StatusChip tone={toneOf(disposition)}`), Reason (code in mono over its words; UX-132 drops the code on the
  public result, keeping `data-reason`), Rows, Claim lines, Allowed in your file. Row hooks
  `data-coverage`, `data-reason` (:77-78).
- Figures: `ScreeningMoney`/`ScreeningCount` (result-summary.tsx:83-90) already mono + tabular. Brand order here is
  Medicare figure (the expected role), Allowed (paid), Difference (short) (UX-005 Fix): already the column order.
- Tone: UX-040 moves the anomaly chip from `short` to the unpriced tone; a test asserts no screening component uses
  short or whole. The primitive must not choose a tone itself (it takes the chip the caller renders).
- **Constraint from #42's spec:** screening.spec.ts:461 and :488-491 use
  `page.locator('[data-group="97110:ma_noncontracted"] [data-slot="status-chip"]')` and `[data-coverage=…][data-reason=…]`
  with single-match assertions. Playwright's `locator()` matches hidden elements, so a stacked copy that repeats
  `data-group`/`data-coverage` makes those strict-mode assertions fail (two matches) at 1280. **The stacked view must
  not repeat the table's row hooks** (give it its own, e.g. `data-stacked-row`), and the same holds for every spec's
  `data-*` row hooks elsewhere (triage, unattested, export-attempts use `[data-case-line]` on the case page's existing
  list; pricing.spec:151 scopes `tr[data-line]` to the table: safe).
- **Constraint from StatusChip:** `whitespace-nowrap` (components/status.tsx:25). Inside a scroller that is fine; in a
  stacked card at 390 a long screening status passes the window's edge and `atPhoneWidth` fails. The stacked status
  slot needs `whitespace-normal` (StatusChip takes `className`) or the primitive wraps its status.

What UX PR 4 needs from the primitive: a heading without a link (code and payer product), a definition list with a
"one figure" dash value (ReactNode values, sr-only text kept), figures in the brand order, a status slot that wraps, a
**summary/footer item** (the "others" row), the caller's own hooks per item, and no empty state of its own (the card
already branches to `EmptyState`).

### 4.2 UX PR 34 (prs.json order 34; UX-078, UX-079 parts (b) and (c))
- **Cases** (cases/page.tsx:242-287): 8 columns: Payer and plan (**link** to the case, the naming cell), Pattern
  (`behaviorText`, a long sentence), State (`CaseStateBadge`), Lines ("open of total", mono), Actionable total
  (`Money`), Deadline (`Deadline` with state), Pursuit cost (Money or "not estimated"), Owner (email or "Unassigned").
  Hooks `tr[data-case][data-state]`. Empty state and "No case matches these filters" outside; `Pager` after. Stacked:
  heading = link; dl = pattern, lines, actionable total, deadline, pursuit cost, owner; status = state badge.
- **Claims and lines** (claims/page.tsx:134-200+): 11 columns for PHI roles, 9 otherwise (`canReadPhi` drops Patient and
  Service date): Patient reference (**link**, with PCN and payer ICN stacked in mono), Service date, Code and
  modifiers (mono, plus Reversal/Reversed/Superseded badges), Units, Charge, Expected allowed
  (`th[data-figure=expected]`), Observed allowed (`data-figure=paid`, "allocated" note, `title` basis), Short
  (`data-figure=short`), Paid, Patient share, Status (chip with reason). Rows are claim-level or line-level. Heading:
  the patient link for PHI roles, the code for the others (the stacked heading must follow the same role rule, so it
  should come from the same column decision as the table). Audit #107 adds columns: one source avoids drift.
- **The anomaly's Flagged lines** (anomalies/page.tsx:58-96): Payer claim control number (PHI only), Service date or
  Line (**link**), Code (mono), Units, Observed allowed, Mode for the units, Short of the mode. Note: the table's order
  is observed, mode, short; the brand order puts the mode (the expected role) first. A primitive that orders figures by
  role fixes the stacked view; the table's own order is UX PR 34's call.
- Anomaly cohorts (:162): 9 columns, Payer and plan link; "Reviewed" state. Reference tables (Agreements, Fields,
  Versions) keep the scroller and the sticky naming cell only (UX-079 (b)).
- **Console record pages with forms in rows** (UX-078): tickets/page.tsx:46 (Number, From, About, Message, Opened,
  Status with an `ActionForm` per next status :82); prospects/page.tsx:50 (8 columns; "Next" holds up to three
  `ActionForm`s :91-113); organizations/[organizationId]/page.tsx Members :133 (Email, Role, Account, Actions: Unlock,
  End membership :155-165), Invitations :191 (an unlabelled action column :198: Send again :212), Agreements :236,
  Grants :305; console/models:120, status:60-72, billing:40 (fit but wrap). The ledger's AdjustForm (UX PR 13) moves
  out of the cell into a full-width row or the stacked item. Stacked: heading = identity (email, ticket and practice,
  organization), dl = facts, **actions full width underneath** (ReactNode slot: `ActionForm`s, client components passed
  as children of a server component: fine).
- Part (b), the sticky naming cell, is a table concern: the naming column needs `sticky left-0 z-[1] bg-card` (inside the
  `relative` scroller). If columns are declared once, the same `name: true` marks the sticky cell and the stacked heading.

### 4.3 UX PR 85 (prs.json order 85, after #42): the screening template's stacked reference
app/screening/page.tsx (a #42 file) "What the file holds" (:80), table "The screening columns" (:95-100): Column, What it
holds, Example. Below `sm`: one item per column of the file, heading = the column's name (mono), dl = what it holds,
example. No figures, no status, no actions. Needs the primitive without figures/status/actions (all optional).

### 4.4 What each needs (summary)

| Need | UX PR 4 screening | UX PR 34 Cases / Claims / Flagged | UX PR 34 console records | UX PR 85 reference |
|---|---|---|---|---|
| Heading | text (code + product) | **link** (case; patient or code by role; line) | text (email, ticket) | text (column name, mono) |
| Heading level | h3 under the card's h2 (`CardTitle` is an `h2`, packages/ui card.tsx:19-21) | h3 (Cases has a page h1 and no card: h2? caller sets) | h3 | h3 |
| Definition list (label/value) | yes, ReactNode values (dash + sr-only) | yes | yes | yes |
| Figures in mono, brand order | Medicare figure, allowed, difference | expected, observed, short (+ charge, paid, patient share as plain facts) | none | none |
| Status on tint | yes, long words, must wrap; caller's tone | case state badge; line status chip + reason | ticket/prospect status | no |
| Row actions / forms | no | none (link only) | **yes**, full width, after the dl | no |
| Summary / footer item | **yes** ("the other N groups, summed") | no | no | no |
| Empty state | no (the card branches) | no (the page branches) | no | no |
| Sorting | none anywhere (no `aria-sort` in apps/web; order is the database's) | none | none | none |
| Caption | the card title names the list (`aria-labelledby`) | `aria-label` ("Cases", "Claims and lines") | `aria-label` | `aria-label` |
| Own hooks per item, never the table's | **yes** (#42's screening.spec) | yes (specs use row hooks) | yes | n/a |

### 4.5 One source or a separate component; server or client
- **Server.** Every consumer is a server component (pages and the screening components), and cell renderers are
  functions: a function prop cannot cross into a client component. A combined "data table" that took
  `columns: { cell: (row) => ReactNode }` would have to be a server component; `ScrollTable` stays the only client leaf
  (it measures). `StackedRows` is pure markup: server, testable with `renderToStaticMarkup`.
- **Both views render; CSS picks one.** The table inside `hidden sm:block` and the list inside `sm:hidden` (or the
  `ScrollTable` region itself `hidden sm:block`). `display:none` removes the hidden copy from the accessibility tree
  and from axe, so names may repeat. What may not repeat: element `id`s (forms using fixed ids such as onboarding's
  `#field-email`, `aria-labelledby` targets like `#screening-anomalies`), and spec hooks (`data-group`, `data-case`,
  …), since `page.locator()` sees hidden nodes. Row forms render twice (each `ActionForm` with its own request key from
  `FormKeys`, apps/web/src/components/form-keys.tsx:11-14); what was typed does not carry across a resize past `sm`.
  Acceptable for record lists; say so in the ADR.
- **One source of row data, not one mega-component.** The tables are bespoke (tfoot sums, `colSpan`, conditional PHI
  columns, badges inside cells, `title` attributes), so a generic DataTable would be a large refactor of 35 sites
  outside this PR's scope. Recommended shape: `StackedRows` (server) takes items
  `{ key, heading: ReactNode, status?: ReactNode, facts: { label, value: ReactNode }[], figures?: { role:
  'expected' | 'paid' | 'short', label, value: ReactNode }[], actions?: ReactNode, hooks?: data-* }`, an optional
  `summary` item, and `label`/`labelledBy` for the list. It renders figures in the brand order by role (code enforces
  the order, TBL-04), `dd` for figures in `font-mono tabular-nums`, and the dl in the house pattern (`grid grid-cols-1
  gap-x-6 gap-y-1 text-sm`, term over value at phone width, ADR 0056:51-53; 14 existing `<dl>`s use it). Each consumer
  builds table rows and stacked items **from the same row array and the same label constants** (one `COLUMNS` const of
  labels per table, used for both `<th>` and `dt`), and UX PR 4's "stacked rows hold every column" test checks parity.
- **Markup:** `<ul aria-label=…>` of `<li>`, each `<article>`-free: `h3` heading (link inside when given), the dl, the
  status (`StatusChip className="whitespace-normal"`), then actions in a `div` (full width, `flex flex-col gap-2`).
  The case page's existing stacked lines (cases/[caseId]/page.tsx:173-190, `ul[aria-label="Case lines"] > li.rounded-md
  .border.p-4`) are the visual precedent the review cites.

---

## 5. Answers in one place
1. The 390 pass belongs in layout-1280.spec.ts as further steps (its practice populates claims, packet, remittances,
   remittance, runs, contract, version, uploads, upload, coverage report; one goto each for home, cases, anomalies and
   a cohort, contracts, mapping, compare, access log as `other-admin`, settings/pricing). Single calls go in
   reconciliation.spec (reconciliation, ROI), reports.spec (a report), packets.spec (packet reviews), onboarding.spec
   (prospects, compliance, organization, tickets via an internal persona, billing), contracts.spec (specialist queue,
   a ux-forms file: avoid; hardware-key.spec:59 has it empty). Not reached with rows: abstraction/ledger,
   console/rule-releases, console/terms (new console steps), access-log, console/tickets.
2. Unit: node, `renderToStaticMarkup`; the observer's decision as a pure function tested in node; the live behaviour in
   e2e (tabindex absent on a fitting table at 1280, present at 390).
3. TBL needs CASE_MODULES 'TBL', MODULE_NUMBER TBL: 17, four matrix rows (3.2), four `none(1, …)` registry entries,
   generated expected.json files.
4. StackedRows: server, items with heading (link or text), facts, figures by role in brand order, status that wraps,
   actions, optional summary item, own hooks; both views rendered and switched at `sm`, no repeated ids or spec hooks.

## 6. Proposals outside this item's scope (notes)
- P1. Widen `tabTo` (a11y.ts:22) to reach a `region` by its `aria-label`, so specs can prove a scroller is in the Tab
  order (axe proves it only while overflowing).
- P2. `sidewaysScroll` (a11y.ts:73-82) excuses an element inside any `overflow-x: auto` ancestor, so a bare scroller
  with no tab stop passes the width check; a check that every overflowing scroller is `role=region` with a name and a
  tab stop would catch UX-011's defect without relying on axe (in scope if the author wants it: a11y.ts is PR 3's file).
- P3. A source guard: every `<table` in apps/web/src sits inside `ScrollTable` or a stacked layout (UX-011's Fix; a
  unit test reading the tsx files, as fixtures.test.ts reads the matrix). In scope if added.
- P4. `atPhoneWidth` on every page route from the route registry (audit #103) with a seeded data shape per route: a
  bigger, separate item; it needs a journey practice with reconciliation and packet-review data.
- P5. If ux-forms merges first, generalise its browser harness (test-support/browser.ts) to take any entry, so
  ScrollTable's observer gets a real-browser unit test; a ux-forms follow-up, not PR 3's dependency.
- P6. The flagged-lines table (anomalies/page.tsx:63-69) shows observed, mode, short: the brand order would put the
  mode first. UX PR 34's call.
- P7. reports.spec.ts:46 expects an investigatory anomaly in the seeded north practice, which the seed does not load;
  whichever spec loads it (not traced here), the coupling is order- and shard-dependent. A journey practice of its own
  would remove it.
