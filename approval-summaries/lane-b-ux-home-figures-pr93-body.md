## What changes

Every live actionable figure of a practice's cases now reads one predicate, so the home, Cases, the case page, the packet builder, the ROI statement and the digest give one figure for one case, each counted with its own lines. The Recovered tile names its period, no read text this pull request touches says "stage five", the approval words follow the practice's proof level, and the empty home names the gate Uploads itself uses.

- **One predicate** (`apps/worker/src/triage/actionable-now.ts`, exported through `@tp/worker/triage`; docs/adr/0082):
  - a case line counts when it is not written off, its latest stage is actionable and its pricing check is current. `ACTIONABLE_NOW_OF` returns the cents, the lines, the lines not written off, and the two causes a line not written off is out of the figure: `moved_on` (latest stage past actionable) and `stale` (at actionable, pricing no longer current).
  - Each case line is read once behind an `OFFSET 0` derived table, and the pricing check runs once per line at actionable (F1).
  - `lib/triage/queries.ts` imports the predicate instead of keeping its own copy. Cases now picks and pages its cases first, then computes the figure for that page only. The case's "Net expected value" comes from the live figure less the pursuit cost (D6), not from the stored `case.actionable_cents`, which stays the case's ask and is shown nowhere as actionable. It shows an amount only on a case still being worked with a line in the figure and a pursuit estimate; otherwise it says why (`netExpectedOf`, `CaseSummary.netExpectedState`).
- **The home** (`lib/dashboard/queries.ts`): one statement, `HOME_CASES`, replaces today's three. It returns one row per state with cents, lines, moved on and stale, and the deadline columns; the headline is summed in TypeScript with `sumCents` and `parseCents`, never `Number` (F10). The tile's lines are counted by the same predicate as its dollars.
- **The ROI statement** (`apps/worker/src/reconcile/statements.ts`): `generateRoiStatement` reads `OPEN_CASES_ACTIONABLE`, the same case set (not resolved or closed) with the predicate per case, and passes it into `roiStatement()`, which only sums it. `packages/ledger` is not touched.
- **The digest** (`apps/worker/src/digest/figures.ts`): "Cases nearing their deadline" sums the predicate and keeps its own case set (D5, F3).
- **The Recovered tile** (`components/dashboard/headline.tsx`): to date, since the first counted entry that still stands (never a reversal, an adjustment or an entry reversed since), and this quarter, both from one ledger read: `practiceRecoveredPeriods()` reads the entries once and the new pure `recoveredPeriods()` splits them (F8). It and `practiceLedgerTotals` total their entries through one pure function, `ledgerTotalsOver()`. The "this quarter" row of "Where things stand" goes. The to-date value is its own span, `data-figure="recovered-to-date"`; the tile keeps `recovered-total` (F7).
- **Approval words by proof level** (`components/reconciliation/display.tsx`, `apps/worker/src/report/recovered-words.ts`): `PAYER_APPROVED_NOTE`, `PAYER_APPROVED_HOME_NOTE`, `LEDGER_TOTALS_HELP` and `NOTHING_APPROVED_WAITING` are maps by proof level; the ROI page and its PDF share `ACTIONABLE_OPEN_LABEL` and `ACTIONABLE_OPEN_NOTE`.
- **The empty home** (UX-140): `baaOnFile()` and `NO_BAA` move to `lib/uploads/gate.ts`; `dashboard()` adds `uploads.baaOnFile` (`practice_baa_on_file()`, an organization-wide BAA included), and the home checks it, then `page.data.suspension`, in the order Uploads does. `lib/routes/uploads.ts` imports and re-exports both (F11), so `contracts.ts` and `reconciliation.ts` are not edited.
- **Cases** (F5): the column reads "Actionable lines" and each row "{lines in the figure} of {lines not written off}", or "none (all N written off)" for a case whose every line is written off (`casesLinesCell()`).
- **UX-023's Actionable part closes here** (F4): the tile, the case page and the packet builder name the lines out of the figure and their cause through one helper, `outOfFigureWords()`, rendered by `<OutOfFigure/>` with every count in the mono face. UX PR 12 keeps only Written off and the partial answer.
- **Tests and docs:** ADR 0082; test matrix "## Home figures (HOM)", HOM-01 to HOM-04; `packages/synth` module 20 (HOM) with `fixtures/synthetic/HOM-01` to `HOM-04/expected.json`; `tools/screening-capacity/watched-paths.txt` gains `apps/worker/src/triage/actionable-now.ts`.

### CAS-41: the home's cost (F1, F13)

The 100,000-line month (100,040 service lines, 20,420 case lines, 4 cases), run as `tp_app` with the practice scope, medians of 5 `EXPLAIN ANALYZE` runs:

| Measure | Base 83d71fd6 (when measured; the base is now 4eaf7124) | This pull request |
| --- | --- | --- |
| The home's case statements | three statements: 8300.1 + 8590.3 + 1422.0 = 18312.4 ms | `HOME_CASES`: 7775.4 ms (0.42x) |
| The whole `dashboard()` call (3 runs) | 56.3 to 64.1 s | 47.4 to 48.1 s |

The gate (the new statement at most the sum of today's three) passes, so the home's statement stays in this pull request. On a 10,000-line month: base 863.2 ms (the three statements), `HOME_CASES` 361.7 ms (0.42x); the pricing-check calls fall from 3,780 to 1,740. The home as a whole is still not bounded: it reads every ledger entry and runs the stage summary (F13; the file's doc comment says so).

### The words (open question 6)

Read from the code at 30c055c9 (the fix round); unchanged at the head d1e4c4c4, whose merge of the base touched only the test matrix and the synth matrix and registry files, none of the code the words come from. Wording is the co-founder's; he may change any of them.

- **Actionable tile:** "what the packets ask for: {N line(s)} in cases still being worked", followed, only when a cause counts one or more, by "; out of the figure: 1 line whose pricing is no longer current and 2 lines moved on past actionable" (stale first, then moved on, each through `counted()`, listed in words).
- **Case page and packet builder:** "{$} on 3 lines" when the figure holds every line not written off; "{$} on no line (all 3 lines written off)" ("its 1 line" for a case of one); otherwise "{$} on 0 of the 3 lines not written off (out of the figure: …)", so the packet's ", as of 2026-11-01." follows the parentheses. The case page's Net expected value: "{$} (actionable less the pursuit cost)" on a case still being worked with a line in the figure; "— (the case is resolved or closed; nothing is left to pursue)"; "— (not estimated)"; "Not computed: no line is in the actionable figure now (out of the figure: …)"; or "Not computed: every line is written off".
- **Cases header:** "{$} across {N case(s)} still being worked, as of {date}. Each case counts its lines still actionable, on their pricing in effect; a written-off line is out of it, struck through on the case’s page." Column: "Actionable lines".
- **Payer approved, home:** "what payers agreed to pay to date on the lines they corrected, deposited or not, never the patient’s share; only deposited cash counts as recovered" (posted: "… posted or not, … only posted cash counts as recovered").
- **Payer approved, Reconciliation:** "what payers agreed to pay to date, never the patient’s share; only deposited cash counts as recovered" (posted: "… only posted cash counts as recovered"), as long as the note it replaces, so the six tiles keep one height. Help: "Payer approved is net of reversals and of what was taken back before it was deposited." (posted: "… before it posted.").
- **Recovered tile:** "to date, since 2026-06-09: cash deposited, proved by the bank export, net of recoupments and reversals", or "to date, none yet: …" at either proof level; then "This quarter (2026-Q4): {$}", the date and the quarter key each kept on one line. The posted proof level reads "cash posted, proved by the posting export, as no deposit data is supplied, …" (no parentheses of its own, so the case page never nests them).
- **ROI statement, page and PDF:** "Actionable in cases still being worked: {$}"; "Counted when the statement was generated, as the practice home and Cases count: each case’s lines still actionable on their pricing in effect. The figure is not recomputed later from the cases it counted."; the page's case links read "Case 1 of 3"; "No case was being worked." (PDF: "No case was being worked when the statement was generated."); "Nothing approved is waiting to be deposited." (posted: "… to be posted.").
- **Empty home:** open: "Upload your first 835 files", "Each file’s receipt follows it from received to loaded, and this page counts what it finds.", "Go to Uploads". No BAA: "Waiting for the business associate agreement", `NO_BAA` ("Uploads open once the practice’s business associate agreement is on file. A platform administrator records it when it is signed."), and "See the agreement chain" for some roles (below). Paused: "Uploads are paused", "They start again once the suspension above is resolved.", no link.

### The agreement chain link (F12)

F12 gives the link to "roles that may open Settings; viewers see no link", but every practice role, viewer included, holds `practice.open` and can open `/settings/agreements`. The build followed F12's words: the link shows when the person holds any role other than viewer (`access.roles.some((role) => role !== 'viewer')`, with a comment pointing at UX-119). The stricter alternative is `rolesPermit(roles, 'agreement.sign')`, the agreements page's own `canConfirm`; say if you prefer it.

## Why

The UX review's PR 9 (`designs/lane-b-ux-review.md` §3.2 "UX PR 9"):

- **UX-003 (C-009, blocking):** the base computes "actionable" four ways: the home tile (live dollars, lines with no pricing check), Cases and the case page (live), the ROI statement (the stored `case.actionable_cents`) and the digest (stored). On the LEDGER story the home tile read $0.00 and the ROI statement $30.00 for the same case.
- **UX-015 (C-048, should fix):** the Recovered tile named no period, "stage five" is internal numbering in read texts, and the Payer approved note said "not cash until it posts" on a practice that proves by deposit.
- **UX-140 (C-183, polish):** the empty home said uploads open once "the agreement chain below" is on file, while Uploads opens on the BAA alone, an organization-wide BAA included.

The design is `designs/lane-b-ux-home-figures.md` on `claude/build-ops` (D1 to D11), as amended by its adversarial review (`wf_132e0b59-2b4`: build with changes; no migration; no frozen code; 13 findings, F1 to F13, all taken). ADR 0082 records the decision. Into `claude/build-platform`, not main.

## What it does not change

- Pricing engine (`packages/pricing`): None. No file under it changes.
- Ledger (`packages/ledger`): None. No file under it changes. The ROI statement's figure is an input to `roiStatement()`, which only sums it; neither `recomputeStatement()` nor `roi_statement_rules()` checks actionable. From 2026-11-01 (ADR 0082) two stored figures mean the live predicate: `roi_statement.actionable_open_cents` and `digest.totals_cents.cases_nearing_deadline_actionable` (F3). No production statement or digest holds the old meaning, since nothing reaches main before launch.
- Database schema and migrations: None. No migration; nothing under `packages/db` changes.
- Content releases (`content/`): None.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: None.
- CI and the GitHub settings: None. `tools/screening-capacity/watched-paths.txt` gains one line (`apps/worker/src/triage/actionable-now.ts`), written by `watched.ts --write`.
- **Two figures keep their own count** (F2): the audit report, counted per run, and the monthly summary, counted per month.
- **#42's files:** none edited by hand except one generated line in `tools/screening-capacity/watched-paths.txt` (see Overlaps). Left alone: `lib/routes/practice.ts`, `components/help.ts`, `lib/monitoring/queries.ts`, `digest/job.ts` and `apps/{web,worker}/package.json`. ADR 0039 and ADR 0061 are cited, not edited.

### For Lane A (left out)

- **F9:** a fifth `roi_links_valid()` key, `actionable_open_lines` (the priced_line IDs a statement's actionable figure counted, whose `variance_cents` never change), so a stored statement's figure can be recomputed. A migration; in ADR 0082.
- **Open question 3 (Lane A's PR 11):** should the refreshed `case.actionable_cents` hold the live predicate, so every screen reads an indexed column and the home's time is bounded, or keep the case's ask? Until then the module is the one definition.

Neither blocks this merge.

### Follow-ups

- **`components/help.ts`** (a #42 file) still says "only stage-five amounts are recovered": after #42 merges, the sentence in D8 and a copy-lint rule against stage numbers (open question 5). HOM-04 pins it as the one known exception and fails once it is gone.
- **`docs/product/reconciliation-001.md`** (a #42 file): after #42, "Ledger semantics" gains the line ADR 0082's Revisit names (the ROI statement's actionable input changed; not an exception).
- **Lane A, a line's remaining ask** (engine-r3-R2): a line a partial recoupment put back to actionable counts its whole variance in the figure, the case's ask and a packet until an additive `line_remaining_ask_cents(case_line)` is read by the predicate, `case_rules()` and the packet builder (ADR 0082).
- **The audit report's per-case "Net expected"** takes the case page's rule (it predates this pull request).
- **`WholeDates`** (`components/dates.tsx`) widened to quarter keys for the anomalies page and the reports list; the tile keeps its own span here.
- **The ROI PDF** (`statement-html.ts:117`) still lists raw case IDs; naming cases by payer and plan needs `statement.links.actionableOpen` to carry them.
- **The design** (`designs/lane-b-ux-home-figures.md` on build-ops): F8 and HOM-02 "since its first counted entry that stands", D7 "to date, none yet", D8 and `p.cases.default` the Cases sentence, the Payer approved notes, to match this pull request.
- **The home's Agreements card** still reads "No agreements on file … Nothing can be uploaded until they exist." from `practiceHome`'s practice-only agreement query (`lib/routes/practice.ts`, a #42 file). A practice covered by an organization-wide BAA would see that card while the empty state, now correct, says uploads are open. After #42.
- **The audit report** keeps its run-scoped actionable (no pricing check) and its "not cash until it posts" note (`components/reports/display.tsx:78`, `report/html.ts:164`), which has no proof level to word it by (open question 2). A follow-up of its own.
- **The monthly summary** (`lib/monitoring/queries.ts`, its CSV and PDF; a #42 file): count a case line only through the line predicate and report the rest apart as out of the figure (F2). After #42.

### Overlaps with other pull requests

- **#42:** rows only, in `docs/product/test-matrix.md` and `packages/synth/src/cases/{matrix,registry}.ts`; HOM comes after SGN (DLR, SGN, HOM). Also one line each in the generated `tools/screening-capacity/watched-paths.txt` (separate hunks; `git merge-tree` merges it cleanly, and the unit test that holds it equal to `watched.ts` output checks the merged list; rerun `pnpm exec tsx tools/screening-capacity/watched.ts --write` only if that test fails).
- **#92 (UX PR 6, sign-in steps; SGN):** merged into the base; it shares rows in `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts`, `common.ts` and `expected/types.ts`. The merge in d1e4c4c4 keeps both sides' rows: SGN is module 19, HOM module 20.
- **#85 (UX PR 10):** also changes `lib/routes/uploads.ts`, where this pull request keeps `baaOnFile` and `NO_BAA` re-exported so #85's code still compiles; #85 adds `uploadGate()` (the BAA plus the suspension). Whichever merges second keeps one gate: if #85 is in first, the home reads `uploadGate()`. Both also change `cases/[caseId]/page.tsx` and `apps/web/e2e/packets.spec.ts`.
- **The schema chain** (SS-01, 1b, interest): SS-01 renames `page.data.suspension`, which the empty home reads, to `hold`. Whichever merges second resolves, with the empty state reading the field that is current.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

The head is d1e4c4c4: it merges `claude/build-platform` at 4eaf7124 (#92, UX PR 6 sign-in steps). The conflicts in `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts`, `common.ts` and `expected/types.ts` were resolved by keeping both sides' rows (SGN as module 19, HOM as module 20).

The fix round’s full local suite on its tree, committed as 30c055c9 against the base then, 43565235, not on the head (Node 24, PostgreSQL 18, one heavy command at a time; build, stamp and e2e on the commit itself):

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass. |
| `pnpm check:fixtures` | Pass: 333 files read, 3,908 searched. |
| `pnpm typecheck` | Pass: 22 projects. |
| `pnpm lint` | Pass: 1,689 files, 0 errors, 0 warnings. |
| `pnpm lint:copy` | Pass: 540 files. |
| `pnpm lint:logs` | Pass: 1,090 files. |
| `pnpm verify-content` | Pass. |
| Engine freeze against 43565235 | Pass: nothing under `packages/pricing/src` changes. |
| `watched.ts --write`, then `git diff --exit-code` | No change: the one line from af3b6d89 stays. |
| `pnpm synth --all`, then `git diff --exit-code` | 0 written, 661 + 16 unchanged; tree clean. |
| `pnpm test` (unit, with coverage) | Pass: 410 files, 6,950 tests passed, 4 skipped. |
| `pnpm test:golden` | Pass: 5 files, 376 tests. |
| `pnpm test:oracle` | Pass: pyx12 4.0.0 and `packages/edi835` agree on all 687 synthetic 835s. |
| `pnpm db:migrate` on a fresh database | 44 applied. |
| `pnpm test:db`, 4 shards one after another | Pass: 131 files (every db file once), 9,290 passed, 1 skipped. |
| `pnpm build`, the build stamp, `pnpm test:e2e` with `E2E_PREBUILT=1`, 2 shards | Pass: 64 tests. The first run failed one real case, `brand.spec.ts`'s mono check on the Actionable tile, which now holds the note's counts in the mono face too; the spec checks every mono span, and both shards pass on 30c055c9. |
| Stryker affected against 43565235, then the gate | No money shard affected; the gate passes ("No money path changed"). |

The build's first run (af3b6d89) passed unit, db, build, e2e, typecheck, lint, copy, logs, synth and the Stryker gate.

CI on the head d1e4c4c4, still running: approval-of-record, mutation, build, lint, domain model and both changes jobs pass; Stryker (matrix) is skipped by design (no money path changed); db (4 shards), e2e (2 shards), unit, static, images and capacity are running; `all green`, `screening-capacity gate` and notify have not reported yet. No failure so far. The fresh-clone verification follows once CI completes.

HOM-04's browser world and the db test differ, as design §4 expected: in the LED-06 journey the recoupment's chain prices the case's line again, so after it the home reads $0.00 with 1 line out of the figure because its pricing is no longer current, and Cases, the case page and the statement read $0.00; the e2e pins those exact values (stable over two runs). The db test (`reconciliation-routes.db.test.ts`) gives $30.00 on 1 line, whose pricing stays current there.

## Reviewer agents' findings

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Design review (`wf_132e0b59-2b4`; payment-engine checklist with the UX and brand lens) | F1: compute the per-line value once behind a fence; gate on CAS-41 | Fixed in af3b6d89: `OFFSET 0` derived table; the check computed at one plan node and called once per line at actionable (HOM-01); gate passes. |
| Design review | F2: name the audit report and the monthly summary as exceptions | Fixed in af3b6d89 (ADR 0082, test matrix); the monthly summary is a follow-up after #42. |
| Design review | F3: the digest's stored figure changes meaning too | Fixed in af3b6d89 (ADR 0082; `digest/figures.ts`'s comment). |
| Design review | F4: count and name the lines out of the figure | Fixed in af3b6d89 (`outOfFigureWords()` on the tile, case page and packet builder; HOM-02). |
| Design review | F5: Cases rows count the figure's lines | Fixed in af3b6d89 (HOM-01). |
| Design review | F6: Payer approved note and help by proof level | Fixed in af3b6d89. |
| Design review | F7: the to-date value its own span | Fixed in af3b6d89 (`recovered-to-date`; e2e specs follow). |
| Design review | F8: one ledger read for both periods, with a property test | Fixed in af3b6d89 (`recoveredPeriods()`; `recovered-periods.test.ts`). |
| Design review | F9: the ROI words; a fifth `roi_links_valid()` key | Words fixed in af3b6d89; the key is deferred to Lane A (a migration; "For Lane A" above). |
| Design review | F10: sum the headline in cents, `ORDER BY c.state`, the deadlines filter | Fixed in af3b6d89. |
| Design review | F11: keep `baaOnFile` and `NO_BAA` importable from `uploads.ts` | Fixed in af3b6d89 (re-export). |
| Design review | F12: the agreement chain link for roles that may open Settings | Fixed in af3b6d89 (any role but viewer); the stricter alternative is above. |
| Design review | F13: record the whole `dashboard()` time | Fixed: recorded above and in `lib/dashboard/queries.ts`'s doc comment. |
| Payment-engine reviewer, round 1 | E1: no test exercises the CASE guard | Fixed in 30c055c9: the measured HOM-01 test writes off one line and reopens another inside the rolled-back transaction; the check runs only for lines at actionable and not written off (a check-first mutant fails). |
| Payment-engine reviewer, round 1 | E2: the property test checks a copy of the composition | Fixed in 30c055c9: `ledgerTotalsOver()`, exported and read by `practiceLedgerTotals` and `recoveredPeriods`; the test compares against it. |
| Payment-engine reviewer, round 1 | E3: Net expected value negative on resolved and closed cases | Fixed in 30c055c9 with UX-R1-01: `netExpectedOf`, `CaseSummary.netExpectedState`, `<NetExpected/>`; a test for each branch; ADR 0082 Decision 5. |
| Payment-engine reviewer, round 1 | E4: the freeze's record does not note the ROI input change | Fixed in 30c055c9: the sentence is in ADR 0082 Decision 6; `reconciliation-001.md` is a #42 file, so its line is a follow-up after #42. |
| Payment-engine reviewer, round 1 | E5: the 10,000-line timing does not say which number is new | Refuted (not a defect); the numbers are labelled anyway. |
| Payment-engine reviewer, round 2 | R1: the since-date can come from a reversed entry or a reversal | Fixed in 30c055c9: `firstOn` only from counted original entries that still stand; oracle, property test and a wrong-match unit case follow; ADR 0082 Decision 8. |
| Payment-engine reviewer, round 2 | R2: the overlap list leaves out `watched-paths.txt` | Fixed in this description (Overlaps, What it does not change). |
| Payment-engine reviewer, round 3 | R1: the since-date can be a recoupment's | Refuted: it dates the summed figure, as D7 and F8 say. No change. |
| Payment-engine reviewer, round 3 | R2: a partially recouped line counts its whole variance | ADR 0082 Consequences sentence and the test's comment in 30c055c9; the remaining ask is a Lane A follow-up named in the ADR. |
| Payment-engine reviewer, round 3 | R3: the stale doc comments leave out two causes | Fixed in 30c055c9: all five causes, pointing to `PRICING_CHECK_RESULTS`. |
| UX and brand reviewer, round 1 | UX-R1-01: Net expected value negative on a resolved or approved case | Fixed in 30c055c9 (with E3). |
| UX and brand reviewer, round 1 | UX-R1-02: the home's Payer approved note reads as money still waiting | Fixed in 30c055c9: both notes say "to date", keep "never the patient’s share" and give the proof level's rule; a takeback test. |
| UX and brand reviewer, round 1 | UX-R1-03: HOM-04 accepts any amount | Fixed in 30c055c9: two runs gave $0.00 both times; the tile, its note, Cases, the case page and the statement are pinned. |
| UX and brand reviewer, round 1 | UX-R1-04: the quarter key can break at its hyphen | Fixed in 30c055c9: a whitespace-nowrap span (ADR 0078 Decision 1), tested. |
| UX and brand reviewer, round 1 | UX-R1-05: causes joined by a bare comma | Fixed in 30c055c9: `listed()`; parentheses on the case page and packet builder. |
| UX and brand reviewer, round 1 | UX-R1-06: Cases header pluralises by hand | Fixed in 30c055c9: `<Counted/>`. |
| UX and brand reviewer, round 1 | UX-R1-07: "Not recomputed from its links." | Fixed in 30c055c9: "The figure is not recomputed later from the cases it counted." |
| UX and brand reviewer, round 2 | ux-r2-01: HOM-04 cannot see the help's "stage-five" | Fixed in 30c055c9: the home's read text apart from its help, the pattern widened everywhere, the help's line pinned as the one #42 exception. |
| UX and brand reviewer, round 2 | ux-r2-02: a written-off case reads "0 of 0" | Fixed in 30c055c9: "none (all N written off)" on Cases, "no line (all N lines written off)" on its page; tested. |
| UX and brand reviewer, round 2 | ux-r2-03: nested parentheses on the case page | Fixed in 30c055c9: the posted words hold none of their own. |
| UX and brand reviewer, round 2 | ux-r2-04: the PDF pluralises by hand | Refuted (not a defect). No change. |
| UX and brand reviewer, round 2 | ux-r2-05: the Cases header describes the case page's strike-through | Fixed in 30c055c9. |
| UX and brand reviewer, round 2 | ux-r2-06: the same counts mono on Cases, sans elsewhere | Fixed in 30c055c9: `<OutOfFigure/>`, `<ActionableLinesOn/>`, `<ActionableNote/>`; a test that no digit sits outside the mono face. |
| UX and brand reviewer, round 3 | ux-r3-01: "nothing posted yet: cash posted" | Fixed in 30c055c9: "to date, none yet". |
| UX and brand reviewer, round 3 | ux-r3-02: the home note leaves out the patient’s share | Fixed in 30c055c9 (with UX-R1-02). |
| UX and brand reviewer, round 3 | ux-r3-03: every ROI case link reads "Case" | Fixed in 30c055c9: "Case i of n"; the PDF's IDs are a follow-up. |
| Both reviewers, round 4 (re-review of the fix round) | Stale comments ("nothing posted yet"), "all 1 line" | Fixed in 30c055c9 ("to date, none yet"; "its 1 line"). |

## Freeze exception

No: it changes none of them. No freeze exception needed (ADR 0082, Decision 6): no DDL or trigger on `roi_statement`, nothing under `packages/ledger`, the stage CHECK, the recovered total and LED-01 to LED-11 unchanged; three payment-engine review rounds agreed.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKPLmdYyBmbVaUjag2c
