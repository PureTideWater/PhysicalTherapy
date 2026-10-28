# Lane B: one actionable figure on the home and the ROI statement, and the Recovered tile names its period (UX PR 9, `co-001/ux-home-figures`)

The UX baseline review's PR 9 (`designs/lane-b-ux-review.md` §3.2 "UX PR 9", "### UX-003 (C-009)", "### UX-015
(C-048)", "### UX-140 (C-183)" and §6.1's words for UX-015 and UX-140; `designs/lane-b-ux-review/synthesis/prs.json`
order 9; raw findings `words-practice-15`, `flows-practice-20`, `words-practice-16`, `words-practice-45`). Written
2026-10-28 ~07:15 UTC against `claude/build-platform` 83d71fd (#51, #52, #56, #74, #78, #79 and #81 merged), in the
worktree `/home/user/ux-home-figures`, read only. Every line number below is this base's, never the review's. Session:
session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B item run by Lane A's orchestrator. Reserved: ADR 0082, test-matrix HOM-01
to HOM-04, `packages/synth` module 20 (HOM) (`LANES.md` claim row 185).

## 1. The defect

**Three readings of "actionable" for one case (UX-003, blocking).** On LEDGER the home's tile reads "Actionable $0.00 /
what the packets ask for: 1 line in cases still being worked" and the ROI statement "Actionable in open cases:
$30.00". The case's one line was priced again (the adjusted 835), then recovered, then reopened to actionable by a
recoupment, so its case line names a priced line that is no longer its pricing in effect. Today's base computes the
figure four ways:

| Where | Dollars | Lines | Source |
| --- | --- | --- | --- |
| Home tile (`lib/dashboard/queries.ts:91-110`) | `ACTIONABLE_NOW` over cases not resolved or closed | case lines at actionable, not written off, **no pricing check** (`:93-96`) | live, two predicates |
| Cases screen header and rows, case page, packet builder (`lib/triage/queries.ts:354-363`, `:369`, `:439`) | `ACTIONABLE_NOW` | `ACTIONABLE_NOW_LINES` | live, one predicate |
| ROI statement (`apps/worker/src/reconcile/statements.ts:72-76`) | `c.actionable_cents` of each case not resolved or closed | none | **stored** |
| Monthly digest, "Cases nearing their deadline" (`apps/worker/src/digest/figures.ts:61-63`, words `digest/view.ts:144`) | `c.actionable_cents` of each case at state `open`, deadline in [today, today + 14] | none | **stored** |

`case.actionable_cents` is written by `case_rules()` (`packages/db/functions/case_rules.sql`) on every update of the
case: the variance of every line not written off, **at any stage and on the pricing it joined with**. So it keeps lines
that moved on to payer approved or recovered, and lines priced again since (ADR 0061, item #4: "the case keeps it and
its stored total until PR 11 refreshes the case"). Two more readers of it: the case page's "Net expected value"
(`lib/triage/queries.ts:377`, stored total less pursuit cost, beside a live Actionable $0.00) and the audit report's
"Whole case" column (`apps/worker/src/report/html.ts:213`, `components/reports/display.tsx:295`, labelled as the case's
whole total, which is what it is).

**The Recovered tile names no period (UX-015, should fix).** The tile reads "Recovered (deposited) $12.00 / stage five:
cash deposited, proved by the bank export, net of recoupments and reversals" (`app/p/[practiceId]/page.tsx:215-222`),
all time, while "Where things stand" reads "Recovered (deposited) this quarter $0.00 (2026-Q4, ...: stage five only,
...)" (`:356-363`). "stage five" is internal numbering in four read texts: the home (`:221`, `:362`), Reconciliation's
totals (`components/reconciliation/display.tsx:114`), the case summary (`cases/[caseId]/page.tsx:98`), and the
practice help (`components/help.ts:10`, a #42 file). The Payer approved note says "not cash until it posts"
(`page.tsx:214`) on a practice that proves by deposit, and the ROI statement's empty line says "Nothing approved is
waiting to be posted." on the page (`reports/roi/[statementId]/page.tsx:126`) and in its PDF
(`apps/worker/src/reconcile/statement-html.ts:115`), whatever the proof level.

**The empty home names the wrong gate (UX-140, polish).** "Uploads open once the agreement chain below is on file."
(`page.tsx:187`) beside "Go to Uploads", while Uploads opens on the BAA alone (`lib/routes/uploads.ts:111`,
`practice_baa_on_file()`). The review's correction says the page already holds the gate; it does not quite:
`practiceHome` reads `agreement WHERE practice_id = $1` (`lib/routes/practice.ts:150-152`), while
`practice_baa_on_file()` also admits an **organization-wide BAA** (`practice_id IS NULL`, same organization) and
requires `signed_at <= now()`. A practice covered by its organization's BAA would be told uploads are closed.

## 2. The fix, in one sentence

Every actionable figure, on a screen or in a document, reads **one predicate** (a case line not written off, whose
latest stage is actionable and whose pricing check is `current`) from one SQL module that both apps import, counted
with the same predicate as its dollars; the Recovered tile carries both of its periods; no read text says "stage
five"; approval words follow the proof level; and the empty home says the gate Uploads itself uses.

## 3. Decisions (each the recommended option, taken under the founder's standing rule and the co-founder's ruling)

### D1. Where the one predicate lives: `apps/worker/src/triage/actionable-now.ts`, exported through `@tp/worker/triage`
- Confirmed: the worker cannot import `apps/web` (no dependency; `apps/worker/package.json`); both apps depend on
  `@tp/triage` (`apps/web/package.json:35`, `apps/worker/package.json:51`); and the web already depends on `@tp/worker`
  and imports `@tp/worker/triage` (2 modules) and `@tp/worker/ledger` (9).
- **Recommended:** a SQL-text module in the worker, exported through its existing triage entry
  (`apps/worker/src/triage/public.ts`), imported by `lib/triage/queries.ts`, `lib/dashboard/queries.ts`,
  `reconcile/statements.ts` and `digest/figures.ts`. Reasons:
  - it is the codebase's own pattern for one figure across both apps: `PRICED_IN_EFFECT` (`@tp/worker/pricing`, read
    by `lib/monitoring/queries.ts:215`) and `COVERAGE_IN_EFFECT` ("a SQL text", `@tp/worker/digests`, read by the
    dashboard, Coverage and the coverage report "so their figures agree", ADR 0039 and 0040);
  - the worker writes the stages the predicate reads (triage, the reconcile) and holds the statement and the digest;
  - the module imports nothing, so #42's `web-entries.test.ts` (which refuses a web-bundled worker module that reaches
    `@tp/db`'s main entry) is satisfied; the review rejected the worker on that test's account, and the test does not
    reach a module with no imports;
  - no `package.json` changes (both are #42 files).
- *Rejected:* `packages/triage/src/actionable-sql.ts` (the review's choice): `@tp/triage`'s charter is "Pure functions
  ... No database, clock or network inside" (`packages/triage/src/index.ts:1-8`); SQL naming `case_line`, `line_status`
  and `priced_line_pricing_check()` would sit in a package whose unit tests cannot run it, beside the pure
  `judgeLine()` it must not be confused with (`actionable.ts` is the validated-to-actionable judgement on a triage date,
  not this read). *Rejected:* a database function `case_actionable_now(case)`: a migration (Lane A's alone). Lane A's
  PR 11 may move the predicate into one when it refreshes the stored column (open question 3).

### D2. The predicate: today's rows, the pricing check last, cents and lines in one pass
- `ACTIONABLE_NOW_LINE(x)` (a `case_line` alias): `CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM
  line_status s WHERE s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN
  priced_line_pricing_check(x.priced_line_id) = 'current' ELSE false END`. The same rows as today's `AND` form (a null
  stage is false either way); the `CASE` guarantees the plpgsql check (a dozen index probes:
  `service_line_priced_in_effect()`, the withdrawal, the mapping in force, the version) runs only for lines not written
  off and at actionable, never for a resolved case's payer-approved or recovered lines.
- `ACTIONABLE_NOW_OF(c)`: a `LATERAL` subquery giving a case's `cents` (sum of `p.variance_cents` of its lines in the
  figure), `lines` (their count) and `open_lines` (its lines not written off), reading each case line once.
- `ACTIONABLE_NOW(c)` and `ACTIONABLE_NOW_LINES(c)` stay as scalar subqueries over the same `ACTIONABLE_NOW_LINE`, for
  the call sites that need one figure (`listCases`' count, the statement, the digest). `CASES`
  (`lib/triage/queries.ts:365`) reads `ACTIONABLE_NOW_OF('c')` once per row instead of two subqueries.
- The module's comment carries today's (`lib/triage/queries.ts:347-353`) and names every reader, as `COVERAGE_IN_EFFECT`'s
  does. `lib/triage/queries.ts` stops defining it.

### D3. The home: one statement, the tile counted with its dollars
- `dashboard()` reads the cases once: `SELECT c.state, count(*), sum(a.cents), sum(a.lines), sum(a.open_lines), and,
  for the cases still being worked whose deadline is within 14 days, count, sum(a.cents) and min(deadline_on) (FILTER)
  FROM "case" c CROSS JOIN LATERAL ACTIONABLE_NOW_OF(c) a WHERE c.practice_id = $1 GROUP BY c.state`. `casesByState`
  is its rows (shape unchanged); the headline sums the worked states; `deadlines` sums the FILTER columns. Today's
  headline, `casesByState` and `deadlines` statements (`:93-97`, `:138-146`) go.
- `Headline.actionable` becomes `{ cents, lines, outOfFigure }`: `lines` is `ACTIONABLE_NOW_LINE`'s count, and
  `outOfFigure` the worked cases' lines not written off less `lines` (each moved past actionable or off its pricing in
  effect; a fixture test holds that every one has one of those two causes).
- **Cost on a large practice.** #81 (ADR 0083) bounded triage's and the audit report's heap; the home is a request-time
  read, not a month's lines, and was not in its scope. Measured from the code: today's home evaluates the predicate in
  three statements (headline, `casesByState` over every case including resolved and closed, deadlines) and counts the
  lines in a fourth, so each actionable case line can take the pricing check three times. After: one statement, at
  most one check per case line at actionable, none for other lines; Node receives at most six rows (one per state).
  The database work stays linear in the practice's case lines (latest-stage lookups through `line_status_by_line`)
  plus its lines at actionable (the check): bounded in memory, not in time. The builders measure it on CAS-41's
  100,000-line synthetic month after triage (`apps/worker/src/triage/test-support/generated-month.ts`), `EXPLAIN
  (ANALYZE, BUFFERS)` of today's statements and the new one, and record both in the PR. The bounded answer, an indexed
  read of a stored live figure, is Lane A's PR 11 (open question 3).
- The Recovered figures read the ledger's entries once (D7), not twice as today (`:100`, `:167`).

### D4. The ROI statement's open-case figure: the predicate, as an input to the ledger, not a change to it
- `generateRoiStatement` (`statements.ts:72-76`) reads `SELECT c.id, ACTIONABLE_NOW('c') FROM "case" c WHERE
  c.practice_id = $1 AND c.state NOT IN ('resolved', 'closed_written_off') ORDER BY c.opened_at, c.id`: the same case
  set (the home's and Cases' "still being worked"), each with its live figure.
- **An input, not the ledger's behaviour.** `roiStatement()` (`packages/ledger/src/roi.ts:85-118`) sums
  `input.openCases[].actionableCents` and lists their IDs; `RoiInput.openCases` is "the practice's open cases and their
  actionable totals when the statement is generated" (`:30`), supplied by the caller. `recomputeStatement()`
  (`statement.ts:67-77`) checks recovered, interest and approved-unposted only, never actionable;
  `roi_statement_rules()` checks only the recovered and interest sums (`functions/roi_statement_rules.sql:52-60`); the
  column's `CHECK (actionable_open_cents >= 0)` holds, since a line reaches actionable only with a positive shortfall
  and a per-visit line never does. So `packages/ledger` has no diff, its tests (LED-11) pass unchanged, and no part is
  for Lane A.
- **What changes is the meaning of a stored, immutable figure** for statements generated after the change: the cases'
  lines in the figure, not their stored totals. It lands before the first production deploy (no pull request goes into
  `main` before launch), so no stored statement holds the old meaning; ADR 0082 records the date. If launch comes first,
  see open question 4. The statement page's and PDF's descriptions say what the figure is (§3 D8).
- Statements are generated quarterly by the reconcile job and on demand: the predicate runs once per generation, over
  the worked cases only.

### D5. The digest's "Cases nearing their deadline" reads the predicate too
- `DIGEST_QUERIES.deadlines` sums `ACTIONABLE_NOW('c')` instead of `c.actionable_cents`, keeping its own case set (state
  `open`, deadline from the digest's day to 14 days after, ADR 0039) and its words. The JOB-03 test
  (`monitor/monitor.db.test.ts:542-551`) reads the constant, so it still finds the statement and no PHI column in it.
- `digest/figures.ts` is not a #42 file (`digest/job.ts` and `job.test.ts` are; neither changes).
- *Not settled here:* the digest's set (state `open`, passed deadlines excluded) differs from the home's (every worked
  state, passed included). That is a choice of which cases are "nearing their deadline", not of the figure (open
  question 1).

### D6. The stored column `case.actionable_cents` after this PR
- **Written** by `case_rules()` as today (no migration). **Read** by: the audit report's "Whole case" column (labelled the
  case's whole total, every run's lines: kept); `CaseSummary.actionableCents` (shown on no screen; its comment says it
  is the case's stored ask, kept for Lane A's PR 11 and for the test that the stored total is untouched,
  `pricing-current-routes.db.test.ts:238-249`).
- **No longer read** by the ROI statement (D4), the digest (D5) or the case page: "Net expected value" becomes
  `netExpectedValue(actionableNowCents, pursuitCost)`, the audit report's rule already ("its lines still actionable,
  less the cost", `report/content.ts:907-909`), negative when nothing is left to pursue.
- No screen, document or email shows the stored column as "actionable".

### D7. The Recovered tile: both periods in one tile, from the ledger's entries
- **Value:** the to-date figure, as today (`practiceLedgerTotals`, the proof level's stage plus recoupments, net of
  reversals; ledger entries only, CLAUDE.md "Never").
- **Note:** "to date, since 2026-06-09: cash deposited, proved by the bank export, net of recoupments and reversals"
  (`proofLevelWords()` unchanged). The date is the earliest `effective_on` of the entries the to-date figure sums
  (`LedgerTotals.entryIds.recovered`), never an approval's. With none: "to date, nothing deposited yet: cash deposited,
  proved by the bank export, net of recoupments and reversals" (posted: "nothing posted yet", and the posted words).
- **Second line:** "This quarter (2026-Q4): $0.00", the quarter of today (UTC) from `@tp/ledger`'s `quarterOf` and
  `quarterPeriod` as today, the same entries' total for the quarter. Inside the tile's link (`data-figure="recovered-quarter"`).
  The "this quarter" row of "Where things stand" goes; `Dashboard.recoveredQuarter` keeps its shape.
- **One read:** `practiceRecoveredPeriods(scope, practiceId, { from, to })` (new, in `reconcile/statements.ts` beside
  `practiceLedgerTotals`, where "Recovered ... is computed from entries here and nowhere else", `:10-12`; exported by
  `@tp/worker/ledger`): one `ledgerEntries` read, one settings read, `ledgerTotals` for all and for the quarter,
  `firstOn` from the recovered entries. An addition: `practiceLedgerTotals` and `packages/ledger` are unchanged.
- **Dates:** `quarter(key)` in `components/format.ts` beside `utc()` and `utcDate()` writes the quarter ("2026-Q4";
  refuses any other shape), and the since-date goes through `utcDate()`, so the screens' date style (UX-027, Lane A's
  practice time zone) changes in one place; both render whole (`WholeDates`, ADR 0078 Decision 1: no date breaks at a
  phone's width).
- *Rejected:* "all time" on the tile with the row kept (words-practice-16): two figures under one label still read
  apart (the review's own choice, flows-practice-20). *Rejected:* the first ledger entry of any stage as "since": an
  approval is not cash.

### D8. Words (brand: plain, exact, "Recovered" always with posted or deposited)
- **The actionable tile:** "what the packets ask for: {counted(lines, 'line')} in cases still being worked", and when
  `outOfFigure > 0`, " (1 more line in them is out of the figure: its pricing is no longer current, or it moved past
  actionable)" / "(3 more lines in them are out of the figure: their pricing is no longer current, or they moved past
  actionable)", through `counted()` (`lib/copy/words.ts:9`). The cause words are the packet builder's
  (`cases/[caseId]/packet/page.tsx:222`), so the screens read alike. *Rejected:* the review's "(1 line is no longer
  actionable: priced again or moved on)": the line's stage still reads "Actionable" on Reconciliation (the e2e asserts
  it, `reconciliation.spec.ts:168`), and "priced again" misses a withdrawn release or a superseded version.
- **The case page's Actionable fact** pairs its dollars with the same lines: "$0.00 on 0 of the 3 lines not written off
  (the rest are out of the figure: ...)" or "on 3 lines", one helper `actionableLinesWords(counted, open)` in
  `components/triage/display.tsx` with the packet builder's sentence. Today it reads "(3 of 3 lines not written off)"
  beside $0.00, the tile's defect.
- **The Cases header's second sentence** says what its figure is: "Each case counts its lines still actionable, on their
  pricing in effect; a written-off line is struck through and out of it." (today "A case’s total is the sum of its lines
  not written off", the stored total's definition).
- **"stage five" leaves every read text this PR may touch:** the home tile and row, Reconciliation's totals note
  ("cash deposited, proved by the bank export, net of recoupments and reversals"), the case summary's parenthesis.
  `components/help.ts:10` ("only stage-five amounts are recovered") is a #42 file: after #42 merges, "Dollar figures
  carry their stage; only cash posted or deposited at the practice’s proof level, net of recoupments and reversals, is
  recovered." (follow-up; open question 5).
- **The Payer approved note by proof level:** "what payers have agreed to pay on the lines they corrected, from the
  recovery ledger; counted as recovered only once it is deposited" (posted: "... once it is posted"), each a literal in
  a map beside `proofLevelWords()`. *Rejected:* the review's "not counted as recovered until it is deposited": **it
  fails `pnpm lint:copy`**, whose rule reads "until it is" before "deposited" as a denial (`tools/brand-copy/scan.ts:160`,
  `DENIED`), as it reads "not yet posted". Checked 2026-10-28 by running `recoveredUnlabelled()` on this base: the
  review's sentence is flagged, both of these pass, and so does D8's help sentence.
- **The ROI statement, page and PDF:** the empty line by proof level, "Nothing approved is waiting to be deposited." /
  "... to be posted.", one map `NOTHING_APPROVED_WAITING` in `apps/worker/src/report/recovered-words.ts` beside
  `NO_RECOVERED_CASH` (exported by `@tp/worker/reports`), which the page and the PDF already share. The open-case
  figure's description: page "The open cases (any not resolved or closed) when the statement was generated, each
  counting its lines still actionable on their pricing in effect, as the practice home and Cases count them."; PDF "The
  lines still actionable, on their pricing in effect, of the N open cases when the statement was generated: <ids>."
- **The empty home** (UX-140), from the gate Uploads uses (D9): open: title "Upload your first 835 files" (kept; the
  monitoring e2e asserts it), "Each file’s receipt follows it from received to loaded, and this page counts what it
  finds." and "Go to Uploads"; no BAA: title "Waiting for the business associate agreement", `NO_BAA`'s sentence ("Uploads
  open once the practice’s business associate agreement is on file. A platform administrator records it when it is
  signed."), no link; on file but the organization suspended: title "Uploads are paused", "They start again once the
  suspension above is resolved.", no link. Who uploads when the viewer cannot is UX-119's (another PR).
- The builders hold every string against `.claude/rules/brand.md`, `tools/brand-copy` and `docs/brand/BRAND.md`, adjust
  within them, and the PR description lists the final words (the co-founder may change any).

### D9. The empty home's gate, without `lib/routes/practice.ts`
- `baaOnFile()` and `NO_BAA` move from `lib/routes/uploads.ts:68-74` to `lib/uploads/gate.ts` (new); Uploads imports
  them from there, so the two pages share one gate and one sentence.
- `dashboard()` adds `uploads: { baaOnFile: boolean }` (`practice_baa_on_file()`, the database's answer). `practiceHome`
  passes `dashboard()`'s result through unchanged (`practice.ts:168`), so its type widens and `practice.ts` (a #42 file)
  is not edited. The suspension the page already has (`page.data.suspension`) completes the gate as Uploads computes it
  (`uploads.ts:118`).
- *Rejected:* reading the BAA from `page.data.agreements` (the review's correction): it omits an organization-wide BAA and
  a future-dated one, so a covered practice would be told uploads are closed. *Rejected:* a new field in `practiceHome`:
  a #42 file.

### D10. Files, #42, migration, overlaps
- **Files** (prs.json order 9, changed by D1, D5, D7 and D9): `apps/worker/src/triage/actionable-now.ts` (new),
  `triage/public.ts`, `triage/actionable-now.db.test.ts` (new); `reconcile/statements.ts`, `reconcile/public.ts`,
  `reconcile/statement-html.ts`; `report/recovered-words.ts`, `report/public.ts`; `digest/figures.ts`;
  `apps/web/src/lib/triage/queries.ts`, `lib/dashboard/queries.ts`, `lib/uploads/gate.ts` (new),
  `lib/routes/uploads.ts`; `app/p/[practiceId]/page.tsx`, `components/dashboard/headline.tsx` (new: the tile row, so a
  unit test renders it) and its test; `components/format.ts` and `format.test.ts` (new); `components/triage/display.tsx`,
  `components/reconciliation/display.tsx`; `cases/[caseId]/page.tsx`, `cases/page.tsx`,
  `reports/roi/[statementId]/page.tsx`; db tests `pricing-current-routes.db.test.ts`, `monitoring-routes.db.test.ts`
  (the headline's new fields), `home-figures.db.test.ts` (new); e2e `reconciliation.spec.ts`,
  `ledger-patient-share.spec.ts:91` (the note's words); docs ADR 0082, test-matrix HOM, synth module 20.
- **#42:** checked 2026-10-28 07:12 UTC: the list above against `pr42-files.txt` (217 files) and against `git diff
  --name-only $(git merge-base origin/claude/build-platform origin/co-001/pr-06b-mail-streams)
  origin/co-001/pr-06b-mail-streams` (head 46974a25): only `docs/product/test-matrix.md` and
  `packages/synth/src/cases/{matrix,registry}.ts`, rows added. Not edited: `lib/routes/practice.ts` (D9),
  `components/help.ts` (D8, follow-up), `apps/{web,worker}/package.json` (D1), `digest/job.ts`, `web-entries.test.ts`,
  `e2e/helpers.ts`, `e2e/prepare.ts` (used only).
- **Migration:** none. No column, function or check changes; the stored column's refresh stays Lane A's PR 11. Nothing
  is recorded "for Lane A" as a need; open question 3 is an offer to PR 11.
- **Engine and ledger:** no file under `packages/pricing` or `packages/ledger` changes.
- **Overlaps:** `co-001/ss-01-suspension-refusal` renames `page.data.suspension` to `hold` on the home (after #42): the
  one merged second keeps both (`LANES.md` rule 6), the empty state reading whichever is current. `co-001/wip-ux-forms`
  touches `cases/page.tsx`. UX PRs 11 and 12 change the home, the case page and `lib/dashboard/queries.ts`: they land
  after or beside this one.

### D11. ADR 0082
"Read every actionable figure, on a screen or in a document, through one predicate in the worker's triage entry;
count its lines with it; keep the stored case total as the case's ask." It is needed because it binds future code
(every new screen, report or email that shows actionable reads `ACTIONABLE_NOW_*`, as ADR 0039 binds coverage to
`COVERAGE_IN_EFFECT`), it changes what a stored, immutable figure means (`roi_statement.actionable_open_cents`, from
the date it records), and it sets the module's home against the review's choice. It cites ADR 0061 (which introduced
the live figure for the web screens) and does not amend it. The words (D7, D8) are UX choices, recorded in the PR.

## 4. Tests (test-matrix HOM-01 to HOM-04, a new series "## Home figures (HOM)")

| ID | Case | Assertion |
| --- | --- | --- |
| HOM-01 | One actionable figure everywhere | On one synthetic case before and after its re-run is accepted (its lines priced again), and on a case with a line moved on to payer approved, the home's headline dollars and lines, its cases by state and deadlines, the Cases header and row, the case page's figure and counted lines, an ROI statement generated on demand and the digest's nearing-deadline figure agree, each read through the one predicate; the lines out of the figure are counted and each has one cause (moved past actionable, or pricing no longer current); the case's stored total is untouched and shown nowhere as actionable; the statement recomputes from its entries and the database accepts it; the home's render runs the pricing check in one statement |
| HOM-02 | The home's figures in words | The tile counts its lines with counted() (0, 1 and 2 lines) and names the lines out of the figure only when there are any; the Recovered tile reads to date since its first counted entry, or nothing yet at the proof level, and this quarter from quarter(); quarter() writes a quarter key and refuses any other; the Payer approved note and the statement's empty line follow the proof level; no read text of the home, Reconciliation, the case page or the statement says stage five; pnpm lint:copy passes |
| HOM-03 | The empty home names the upload gate | The home's gate equals the Uploads page's: a practice BAA and an organization-wide BAA open it, a BAA signed in the future and none close it, a suspension pauses it; open shows the upload sentence with Go to Uploads, closed the BAA sentence with no link, paused the suspension sentence with no link |
| HOM-04 | The home and the statement agree in the browser | In the LED-06 journey after the recoupment, the home's actionable tile, the Cases header and an ROI statement generated then show the same amount, the tile naming the line out of the figure; the Recovered tile reads to date since 2026-06-09 with this quarter's line; Reconciliation's and the case's recovered notes carry no stage number; the statement's empty approval line names deposited |

- **HOM-01:** web, `pricing-current-routes.db.test.ts`' `figures()` (its test already claims "every actionable figure")
  gains the headline's `lines` and `outOfFigure`, the Cases header (`actionableCents`), and a statement generated through
  its route by a person who may reconcile (`posting.reconcile`): before `{9000, 3 lines, 0 out}` everywhere, after `{0, 0,
  3 out}` with the stored `9000` kept; its withdrawn-release test (`:325`) gains the same figures, so both causes of
  "pricing no longer current" are covered. Worker, `triage/actionable-now.db.test.ts` (new): the statement's
  `actionable_open_cents` and links, `DIGEST_QUERIES.deadlines`, on a priced-again case and on a case with one line moved
  to payer approved; `recomputeStatement(...).matches`; and a recording client (as JOB-03's) holds that `dashboard()`
  issues one statement containing `priced_line_pricing_check`. `practiceRecoveredPeriods` equals `practiceLedgerTotals`
  for all time and for the quarter on the LED worlds (`reconciliation-routes.db.test.ts`, after the recoupment: to date
  1200, since 2026-06-09, quarter 0).
- **LED-11 unchanged:** `packages/ledger/src/{roi,statement,rules}.test.ts`, `reconcile/ledger.db.test.ts:986-`,
  `reconcile/chain.db.test.ts:306` and `reconciliation-routes.db.test.ts:289` pass with no edit; the PR's diff under
  `packages/ledger` is empty.
- **HOM-02:** `components/dashboard/headline.test.tsx` (new, `renderToStaticMarkup` as `dates.test.tsx` does) and
  `components/format.test.ts` (new); `pnpm lint:copy` over the changed files. *Rejected:* a lint rule against stage
  numbers now: `help.ts` (#42) still holds one and its exemption would be an edit to that file; add the rule with the
  help sentence after #42.
- **HOM-03:** `home-figures.db.test.ts` (new) for the gate against `practice_baa_on_file()` (an agreement row with
  `practice_id` null, one signed tomorrow); the three empty states rendered in `headline.test.tsx`.
- **HOM-04:** `reconciliation.spec.ts`, a step after "the ROI statement recomputes ...": the home tile `$0.00` with "0
  lines in cases still being worked" and "1 more line in them is out of the figure", the Cases header `$0.00`, the
  statement's "Actionable in open cases" `$0.00`, read as one amount; the Recovered tile "to date, since 2026-06-09" and
  `/This quarter \(\d{4}-Q[1-4]\)/`; "Nothing approved is waiting to be deposited."; `atPhoneWidth` on the home.
- **Existing assertions whose words change:** `reconciliation.spec.ts:153` ("stage five: cash deposited, proved by the
  bank export" becomes "cash deposited, proved by the bank export"); `ledger-patient-share.spec.ts:91` (the Payer
  approved note at that practice's proof level); `monitoring-routes.db.test.ts:155` (`headline` `toEqual` gains
  `outOfFigure` and the Recovered `since`). Unchanged: `triage.spec.ts:181` ("3 lines in cases still being worked"),
  `monitoring.spec.ts:60-62` (the empty home's heading and link, on a practice with its BAA), `brand.spec.ts:445`,
  `report-documents-routes.db.test.ts:278` (`casesByState`' shape), `reports/display.test.tsx:83` and `report.test.ts:156`
  (the audit report keeps its note, open question 2). `brand.spec.ts`' `dashboard-tiles.png` is a saved shot, not a
  compared baseline.
- **Synth:** `'HOM'` in `CASE_MODULES` (`packages/synth/src/expected/types.ts:9`), `HOM: 20` in `MODULE_NUMBER`
  (`packages/synth/src/cases/common.ts:18`), `matrix.ts` rows and `registry.ts` `HOM-01`..`HOM-04` as `none(...)`
  entries naming the real test files, and the four `fixtures/synthetic/HOM-0N/expected.json` `pnpm synth --all` writes
  (as DLR's R03). Each row has no `|` inside.

## 5. What a person sees (the review's screenshot sample, 1280 px; 390 px stacks the same)

| Screen | Before | After |
| --- | --- | --- |
| `p.home.default` (LEDGER, deposited) | Actionable $0.00 "what the packets ask for: 1 line in cases still being worked"; Payer approved "... not cash until it posts"; Recovered (deposited) $12.00 "stage five: cash deposited, ..."; a row "Recovered (deposited) this quarter $0.00 (2026-Q4, ...: stage five only, ...)" | Actionable $0.00 "... 0 lines in cases still being worked (1 more line in them is out of the figure: its pricing is no longer current, or it moved past actionable)"; "... counted as recovered only once it is deposited"; $12.00 "to date, since 2026-06-09: cash deposited, proved by the bank export, net of recoupments and reversals" and "This quarter (2026-Q4): $0.00" in the tile; the row gone |
| `p.home.tiles` (PACKETS, posted, resolved case) | "0 lines in cases still being worked"; "not cash until it posts"; Recovered (posted) $0.00 "stage five: cash posted, ..." | "0 lines ..." (no clause: the resolved case is not being worked); "... only once it is posted"; "to date, nothing posted yet: cash posted, ..." and "This quarter (2026-Q4): $0.00" |
| `p.home.empty` (NORTH, BAA on file) | "Upload your first 835 files" / "... Uploads open once the agreement chain below is on file." / Go to Uploads | "Upload your first 835 files" / "Each file’s receipt follows it from received to loaded, and this page counts what it finds." / Go to Uploads. A practice with no BAA: "Waiting for the business associate agreement", the BAA sentence, no link |
| `p.home.error-last-run-failed`, `p.home.support-access` | Recovered tile and row as `p.home.default` | The tile with both periods; the row gone |
| `p.cases.default` (PACKETS) | "Actionable: $0.00 across 0 cases still being worked ... A case’s total is the sum of its lines not written off; ..." | Same figure; "Each case counts its lines still actionable, on their pricing in effect; a written-off line is struck through and out of it." |
| `p.case.default` (PACKETS) | "Actionable $0.00 (3 of 3 lines not written off)"; "Recovered (posted) $0.00 (stage five: cash posted, ...)"; Net expected value from the stored total | "$0.00 on 0 of the 3 lines not written off (the rest are out of the figure: ...)"; "(cash posted, proved by the posting export (no deposit data is supplied), net of recoupments and reversals)"; Net expected value from the live figure (or "—" when not estimated) |
| `p.reconciliation.*` (LEDGER) | Totals: Recovered (deposited) $12.00 "stage five: cash deposited, ..." | "cash deposited, proved by the bank export, net of recoupments and reversals" |
| `p.roi-statement.default` (LEDGER) | "Actionable in open cases: $30.00 / The actionable totals of the cases open when the statement was generated."; "Nothing approved is waiting to be posted." | A statement generated after the change: "$0.00 / The open cases (any not resolved or closed) when the statement was generated, each counting its lines still actionable on their pricing in effect, as the practice home and Cases count them."; "Nothing approved is waiting to be deposited." A statement generated before keeps its stored $30.00 (immutable); the after shots generate a new one |

## 6. Pipeline for this PR
1. This design, with one adversarial reviewer (a workflow agent) that tries to break D1 to D9.
2. Builders: one workflow, two agents in series: (a) the predicate module, the queries, the statement, the digest,
   `practiceRecoveredPeriods`, the gate and their db tests (HOM-01, HOM-03) with the large-practice measurement; (b)
   the words, the tile component, the pages, `quarter()`, the unit tests and the e2e (HOM-02, HOM-04), ADR 0082 and the
   matrix and synth rows. Each checks what it touches (eslint, typecheck, the files' tests); heavy commands under
   `flock /tmp/laneb-heavy.lock`, with `PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
3. Draft PR into `claude/build-platform`, every section of the template.
4. Two adversarial reviews: the UX and brand review (`.claude/agents/ux-brand-reviewer.md`, before and after shots at
   1280 px and 390 px light and 1280 px dark through `ops/tools/lane-b-screen-tour/README.md` "From another lane"), and
   the payment-engine review (`.claude/agents/payment-engine-reviewer.md`: the statement's figure, the digest's, and that
   `packages/ledger` and `packages/pricing` are untouched).
5. Fix round with the full local suite once, one push; 6. fresh-clone verification reading CI; 7. merge per
   `lanes/lane-b.md` "Merging".

## 7. Open questions (not settled from the code)
1. **Which cases are "nearing their deadline"?** The digest counts state `open` from today to 14 days ahead; the home
   and Cases count every worked state, passed deadlines included. Both now carry the same figure per case; the sets
   still differ. For the review of this design, or a follow-up.
2. **The audit report.** Its per-run "actionable" counts a case line of the run as actionable while not written off and
   not past actionable, with no pricing check (`report/content.ts:607-610`), and its Payer approved note keeps "not cash
   until it posts" on the web (`components/reports/display.tsx:78`, which has no proof level) and in the PDF
   (`report/html.ts:164`). A run's stored document with its own figure; left out here, offered as a follow-up.
3. **For Lane A's PR 11.** Should the refreshed `case.actionable_cents` hold the live predicate (kept current when a
   line's stage or pricing changes), so every screen reads an indexed column and the home's time is bounded, or keep
   "the case's ask"? Until then the module is the one definition.
4. **If launch precedes the merge,** statements generated before it hold stored totals under the same label; the review
   says to date the change by `generated_at`, which needs the deploy's date in code or data. Not needed while nothing is
   in production.
5. **`help.ts`'s "stage-five"** (a #42 file): the sentence in D8 and a copy-lint rule against stage numbers, after #42.
6. **Words** chosen here against the review's: the out-of-figure clause (D8) and the approval note (the review's fails
   lint:copy). The co-founder may change either.

## Design review and dispositions (2026-10-28 ~07:45 UTC)

One adversarial reviewer with the payment-engine checklist and the UX and brand lens (workflow `wf_132e0b59-2b4`; script
`workflow-scripts/lane-b-ux-home-figures-design-wf_132e0b59-2b4.js`; findings `designs/lane-b-ux-home-figures-review.json`).
Verdict: **build with changes**; no migration; no frozen code touched (`packages/pricing` and `packages/ledger` get no
diff; the ROI statement's change is an input to `roiStatement()`, which only sums it, and neither `recomputeStatement()`
nor `roi_statement_rules()` checks actionable). All 13 findings are taken. **Where this section and the sections above
disagree, this section wins**; builders read it as the amendment.

| ID | Sev. | Disposition (the design as amended) |
| --- | --- | --- |
| F1 | should-fix | The per-line value is computed once, behind an optimization fence: `ACTIONABLE_NOW_OF(c)` is a `CROSS JOIN LATERAL` over a derived table `(SELECT p.variance_cents, x.written_off_reason IS NULL AS open, <line predicate> AS now, … FROM case_line x JOIN priced_line p … WHERE x.case_id = c.id AND x.practice_id = c.practice_id OFFSET 0) y`, whose aggregates FILTER on `y.now` and `y.open`; the latest-stage lookup also matches `s.practice_id = x.practice_id` (the index leads with it). HOM-01 asserts that `EXPLAIN (VERBOSE)` of the home's statement names `priced_line_pricing_check` exactly once. The CAS-41 measurement is a gate: the new statement's `EXPLAIN ANALYZE` time is at most the sum of today's three statements; both recorded in the PR. If the gate fails, that part stops and goes to Lane A's PR 11. |
| F2 | should-fix | The inventory adds the monthly summary (screen, CSV, PDF; `lib/monitoring/queries.ts`, a #42 file) and the audit report. §2 and ADR 0082 say "every live actionable figure of the practice's cases (home, Cases, case page, packet builder, ROI statement, digest)", with two named exceptions keeping their own figure: the run-scoped audit report and the month-scoped monthly summary. A follow-up after #42 for the monthly summary (count a case line only through the line predicate, the rest apart as out of the figure). Nothing changes in `lib/monitoring/queries.ts` here. |
| F3 | should-fix | D5 and ADR 0082 list `digest.totals_cents.cases_nearing_deadline_actionable` beside `roi_statement.actionable_open_cents` as stored figures whose meaning changes from the date the ADR records. `digest/figures.ts`'s comment says "its lines still actionable on their pricing in effect (ACTIONABLE_NOW)". ADR 0039 (a #42 file) is not edited. |
| F4 | should-fix | `ACTIONABLE_NOW_OF` also returns `moved_on` (not written off, latest stage not actionable) and `stale` (at actionable, check not current), read once from the F1 table. One helper `outOfFigureWords(movedOn, stale)` in `components/triage/display.tsx`, on `counted()`, showing each part only when above 0. Tile: "what the packets ask for: 0 lines in cases still being worked; out of the figure: 1 line whose pricing is no longer current, 2 lines moved on past actionable". Case page: "$0.00 on 0 of the 3 lines not written off; out of the figure: …". The packet builder (`packet/page.tsx`, added to the files) uses the same helper. The PR says UX-023's Actionable part closes here, so UX PR 12 keeps only Written off and the partial answer. HOM-02 renders 0, 1 and 2 of each cause. |
| F5 | should-fix | Cases: the header reads "{stageLabel('actionable')} lines" and the cell "{actionableNowLines} of {openLines}". HOM-01 asserts each row's count equals the lines in its figure, before and after a re-run. |
| F6 | should-fix | `PAYER_APPROVED_NOTE` and `LEDGER_TOTALS_HELP` (`components/reconciliation/display.tsx`) become maps by proof level beside `proofLevelWords()`: "what payers agreed to pay, never the patient’s share; counted as recovered only once it is deposited" (posted: "… only once it is posted"); "Payer approved is net of reversals and of what was taken back before it was deposited." (posted: "… before it posted."). `ledger-patient-share.spec.ts` follows; both notes join HOM-02 and the copy lint check. |
| F7 | should-fix | The to-date value is its own span, `data-figure="recovered-to-date"`; the tile keeps `recovered-total` for its label (`brand.spec.ts` expects it). `monitoring.spec.ts`, `packets.spec.ts` and `ledger-patient-share.spec.ts` point at `recovered-to-date` with `toHaveText`. `report-documents-routes.db.test.ts`'s whole-headline `toEqual` is listed as changing. |
| F8 | should-fix | A pure `recoveredPeriods(all, proofLevel, { from, to })` in `reconcile/statements.ts`: `ledgerTotals(all, proofLevel)`, `ledgerTotals(periodEntries(all, from, to), proofLevel, entriesById(all))` (as `practiceLedgerTotals` does), and `firstOn`, the minimum `effectiveOn` over the recovered entry IDs or null. `practiceRecoveredPeriods` wraps it after one `ledgerEntries` read; `headlineOf` takes payer approved and the proof level from its all-time totals. HOM-01 adds a property test (the repo's property tool): on random ledgers with reversals crossing the quarter's boundary, the result equals `practiceLedgerTotals`' composition for all time and for the quarter. Amounts through `centsToString` only. |
| F9 | should-fix | The ROI page and PDF read "Actionable in cases still being worked: $X" and "Counted when the statement was generated, as the practice home and Cases count: each case's lines still actionable on their pricing in effect. Not recomputed from its links." **For Lane A (a migration, left out):** a fifth `roi_links_valid()` key, `actionable_open_lines` (priced_line IDs, whose `variance_cents` never change), so the stored figure can be recomputed; in ADR 0082 and open question 3. HOM-04 renames the region if it asserts it. |
| F10 | nit | The home's statement: the headline's cents are `sumCents(rows.map((r) => parseCents(r.cents)))` over the worked states (or `GROUPING SETS ((c.state), ())`), never `Number`; it ends `ORDER BY c.state`; the deadlines FILTER is `c.state NOT IN ('resolved','closed_written_off') AND c.deadline_on <= $2::date + $3::int`; `earliest` is `min(deadline_on)::text` of the filtered rows. |
| F11 | nit | `baaOnFile` and `NO_BAA` stay importable from `lib/routes/uploads.ts` (a re-export) so `contracts.ts` and `reconciliation.ts` need no edit; or both are listed and import from `lib/uploads/gate.ts`. Builders choose the smaller diff. |
| F12 | nit | The no-BAA empty state links "See the agreement chain" (`/p/<id>/settings/agreements`) for roles that may open Settings; viewers see no link. HOM-03 renders it. |
| F13 | nit | D3 says the home as a whole still reads every ledger entry and runs the stage summary, so it is not bounded; the CAS-41 timing of the whole `dashboard()` call is recorded beside the statement's. |

**Next:** builders (after the session's go), then the draft PR, the two reviews (UX and brand with before and after shots;
the payment-engine review), the fix round, the verification and the merge.
