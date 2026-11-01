# 0082. Read every live actionable figure through one predicate in the worker's triage entry, count its lines with it, and keep the stored case total as the case's ask

- **Status:** accepted (`co-001/ux-home-figures`, the UX baseline review's ninth pull request; UX-003 (C-009), with
  UX-015 (C-048) and UX-140 (C-183) in the same pull request, whose words are UX choices recorded there, not here).
  Adds to [0061](0061-verify-a-deadline-only-from-signed-off-evidence-refuse-an-unverified-export-in-sql-and-attest-the-export-over-its-hashes.md)
  (which made the web's `ACTIONABLE_NOW` count only lines whose pricing check is `current`, and left
  `case.actionable_cents` untouched) and to
  [0039](0039-monitor-each-upload-batch-through-a-keyed-job-chain-and-digest-each-month-in-counts-and-totals.md)
  (the digest's "cases nearing deadline ... with their actionable total"); amends neither file, and reverses none of
  their rulings
- **Date:** 2026-11-01
- **Deciders:** the co-founder, under the founder's delegation of 2026-10-25 (LANES.md, claim row 185), whose ruling of
  2026-10-26 has the build take each recommended option without asking; the build (Lane B), for the design's choices
  (D1 to D11) and its review's thirteen findings (F1 to F13, all taken). Every option is judged under the founder's
  standing rule of 2026-10-18. No founder action: no migration, no domain-model change, and no diff under
  `packages/pricing` or `packages/ledger`. Each reversible by the founder
- **PRD sections:** 7 (the practice home's tiles and deadlines), 8 (`line_status` and the status machine), 12 (From
  validated to actionable; Deadlines and pursuit cost), 13 (the recovery ledger: the ROI statement and the recovered
  figures), 15 (the worker and the web app); test matrix HOM-01 to HOM-04; ADRs 0039, 0040 (a line judged on its
  pricing in effect), 0061 and 0083 (bounded reads of a month's lines)

## Context

On one synthetic practice a person read three amounts for "actionable" about the same case: the home's tile said
"Actionable $0.00 / what the packets ask for: 1 line in cases still being worked", and the ROI statement said
"Actionable in open cases: $30.00" (UX-003). The case's one line had been priced again (an adjusted 835), recovered,
then reopened to actionable by a recoupment, so its case line names a priced line that is no longer its pricing in
effect. The base computed the figure four ways:

| Where | Dollars | Lines |
| --- | --- | --- |
| The home's tile (`lib/dashboard/queries.ts`) | the web's `ACTIONABLE_NOW` | case lines at actionable, not written off, with **no pricing check**: a second predicate |
| Cases, the case page and the packet builder (`lib/triage/queries.ts`) | `ACTIONABLE_NOW` | `ACTIONABLE_NOW_LINES`: the same predicate |
| The ROI statement (`reconcile/statements.ts`) | `case.actionable_cents` of each case not resolved or closed: **stored** | none |
| The monthly digest's "Cases nearing their deadline" (`digest/figures.ts`) | `case.actionable_cents` of each open case: **stored** | none |

`case.actionable_cents` is written by `case_rules()` on every update of the case: the variance of every line not
written off, at any stage and on the pricing it joined with. ADR 0061 kept it so ("the Cases screen shows the case's
own ask beside what is actionable now"), until Lane A's PR 11 refreshes the case. So the stored total keeps lines that
moved on to payer approved or recovered, and lines priced again since; two documents read it as "actionable", and the
case page's "Net expected value" subtracted the pursuit cost from it beside a live Actionable of $0.00.

Two more figures count actionable lines on their own terms (the design review's F2): the audit report (a run's lines,
counted while not written off and not past actionable, `report/content.ts`) and the monthly summary (a month's lines by
the stage their latest event names, `lib/monitoring/queries.ts`, a file of pull request #42 this pull request may not
edit). Each is scoped to a run or a month, not to the practice's cases now.

What constrained the design: the worker cannot import `apps/web`; the web already imports `@tp/worker/triage` and
`@tp/worker/ledger`; #42's `web-entries.test.ts` refuses a web-bundled worker module that reaches `@tp/db`'s main
entry; both apps' `package.json` are #42 files; and a database function would be a migration, which is Lane A's.

## Decision

1. **One predicate, in one SQL-text module that imports nothing (D1, D2).** `apps/worker/src/triage/actionable-now.ts`,
   exported through `@tp/worker/triage`, holds the one definition: a case line is in the figure when it is not written
   off, the latest stage of its service line is `actionable`, and `priced_line_pricing_check()` of its priced line is
   `current`. `ACTIONABLE_NOW_LINE(x)` writes it as a `CASE`, so the check (a plpgsql function of a dozen index probes)
   runs only for a line not written off and at actionable, never for a resolved case's payer approved or recovered
   lines; the latest-stage lookup matches the practice first (`line_status_by_line` leads with it). `ACTIONABLE_NOW`
   and `ACTIONABLE_NOW_LINES` sum and count it for the call sites that need one figure; `ACTIONABLE_NOW_OF(c)` gives a
   case's `cents`, `lines`, `open_lines`, `moved_on` and `stale` in one pass, for a `CROSS JOIN LATERAL`. The module is
   the codebase's own pattern for one figure in both apps, as `COVERAGE_IN_EFFECT` (ADR 0039) and `PRICED_IN_EFFECT`
   are; `lib/triage/queries.ts` stops defining its own.
2. **Every live actionable figure of the practice's cases reads it (D11 as amended by F2).** The practice home's tile,
   its cases by state and its deadlines; the Cases screen's header and rows; the case page and the packet builder; the
   ROI statement's figure for the cases still being worked; and the digest's cases nearing their deadline. A new
   screen, report or email that shows the practice's cases as actionable reads `ACTIONABLE_NOW_*`, as a coverage figure
   reads `COVERAGE_IN_EFFECT`. **Two named exceptions keep their own figure:** the run-scoped audit report and the
   month-scoped monthly summary, each a stored or downloaded account of a run or a month, not of the cases now (Revisit
   when).
3. **Its lines are counted with its dollars (D3, F4, F5).** Each place that shows the figure counts its lines with the
   same predicate, and names the lines out of it: `moved_on` (not written off, latest stage not actionable) and `stale`
   (at actionable, pricing no longer current). Every line not written off has exactly one of three fates: in the
   figure, moved on, or stale. The Cases row reads "{lines in the figure} of {lines not written off}".
4. **Each line is judged once (F1).** `ACTIONABLE_NOW_OF` reads a case's lines through a derived table behind an
   optimization fence (`OFFSET 0`), whose columns are the latest stage and the predicate; the aggregates' `FILTER`s read
   those columns. PostgreSQL neither merges a common subexpression across aggregates nor keeps one when it pulls a
   subquery up, so without the fence the check would run once per `FILTER`. The home reads its cases in one statement,
   one row per state, its headline summed in TypeScript with `sumCents` and `parseCents`, never `Number` (F10); the
   Cases screen picks and pages its cases before it joins the figure, so a page computes only its own.
5. **The stored column stays the case's ask (D6).** `case_rules()` writes `case.actionable_cents` as before (no
   migration). It is read only where it is labelled as the case's whole total: the audit report's "Whole case" column,
   and `CaseSummary.actionableCents`, shown on no screen and kept for Lane A's PR 11 and for the test that the stored
   total is untouched. No screen, document or email shows it as "actionable". The case page's "Net expected value"
   becomes `netExpectedValue(actionableNowCents, pursuitCost)`, the audit report's rule already, and is negative when
   nothing is left to pursue.
6. **Two stored figures change meaning from this ADR's date, 2026-11-01 (D4, F3).** Both are fixed once recorded:
   - `roi_statement.actionable_open_cents`: `generateRoiStatement` passes `roiStatement()` the cases not resolved or
     closed, each with `ACTIONABLE_NOW` (`OPEN_CASES_ACTIONABLE`), in place of each case's stored total. An input to
     the ledger, not a change to it: `roiStatement()` sums `openCases[].actionableCents` and lists their IDs;
     `recomputeStatement()` and `roi_statement_rules()` check recovered, interest and approved-unposted, never
     actionable; and the column's `CHECK (actionable_open_cents >= 0)` holds, since a line reaches actionable only
     with a positive shortfall.
   - `digest.totals_cents.cases_nearing_deadline_actionable`: `DIGEST_QUERIES.deadlines` sums `ACTIONABLE_NOW('c')`
     over its own case set (state `open`, deadline from the digest's day to 14 days after, ADR 0039), its words
     unchanged. ADR 0039 is not edited.

   No pull request goes into `main` before launch, so no production statement or digest holds the old meaning. One
   generated on a build before this change keeps its stored figure (both are immutable); the statement's page and PDF
   describe the figure as counted when the statement was generated (F9).
7. **The statement's figure cannot yet be recomputed from its links; the key that would allow it is Lane A's (F9).**
   `roi_links_valid()` holds four keys (`actionable_open`, the case IDs; `approved_unposted`; `interest`;
   `recovered`). A fifth, `actionable_open_lines` (the priced line IDs the figure sums, whose `variance_cents` never
   change), would let `recomputeStatement()` check the actionable figure as it checks the others. It is a migration,
   so it is left out here and offered to Lane A; until then the page and the PDF say the figure is "not recomputed from
   its links".
8. **The Recovered tile's two periods come from one ledger read (D7, F8).** `recoveredPeriods(all, proofLevel, { from,
   to })` in `reconcile/statements.ts`, pure, gives the to-date totals, the quarter's totals (the quarter's entries
   totalled against the whole ledger through `entriesById(all)`, as `practiceLedgerTotals` does, so a reversal in the
   quarter of an earlier entry nets rather than throws) and `firstOn`, the earliest `effective_on` of the entries the
   to-date recovered figure sums. `practiceRecoveredPeriods` wraps it after one `ledgerEntries` read and one settings
   read. Recovered is still computed from ledger entries at posted or deposited, by proof level, and nowhere else; an
   addition, with `practiceLedgerTotals` and `packages/ledger` unchanged.
9. **The empty home asks the database Uploads asks (D9, F11).** `baaOnFile()` and `NO_BAA` move to
   `lib/uploads/gate.ts`; `lib/routes/uploads.ts` imports and re-exports them, so its other importers need no edit.
   `dashboard()` gains `uploads.baaOnFile` (`practice_baa_on_file()`, which admits an organization-wide BAA and refuses
   one signed in the future), and `practiceHome` (a #42 file) passes it through unedited.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| The predicate in `packages/triage/src/actionable-sql.ts` (the UX baseline review's choice) | `@tp/triage`'s charter is pure functions with no database, clock or network; SQL naming `case_line`, `line_status` and `priced_line_pricing_check()` would sit where its unit tests cannot run it, beside the pure `judgeLine()` (the validated-to-actionable judgement on a triage date) it must not be confused with |
| A database function `case_actionable_now(case)` | A migration, which is Lane A's. PR 11 may move the predicate into one when it refreshes the stored column (Revisit when) |
| Keep the stored total in the statement and the digest | Two documents would go on saying "actionable" for lines that moved on or were priced again, the defect itself |
| Refresh `case.actionable_cents` to the live figure here | A trigger or job change on the case's write path, kept current when a line's stage or pricing changes: Lane A's PR 11 |
| The predicate as two scalar subqueries per case, or one derived table without the fence | The check would run once per `FILTER` or per reference, two or three times per actionable line on the home (F1) |
| Move the monthly summary and the audit report onto the predicate now | The summary's query is a #42 file; the audit report is a run's stored account with its own figure. Both follow-ups (Revisit when) |
| Date the statement's change by `generated_at` against a deploy date in code or data | Not needed while nothing is in production; needed only if launch precedes the merge |
| Read the BAA from the home's agreements | Omits an organization-wide BAA and a future-dated one, so a covered practice would be told uploads are closed |

## Consequences

- The home, Cases, the case page, the packet builder, an ROI statement generated from now and a digest recorded from
  now show one amount for the same cases, each counting its lines with it and naming the lines out of it.
- A line priced again, under a withdrawn release or a version no longer in force, or moved on past actionable leaves
  every live figure at once; its case keeps the line and its stored total until PR 11.
- `roi_statement.actionable_open_cents` and `digest.totals_cents.cases_nearing_deadline_actionable` mean the cases'
  lines still actionable on their pricing in effect when generated, from 2026-11-01; `packages/ledger` and its tests
  (LED-11) are unchanged.
- The home runs the pricing check in one statement, at most once per case line at actionable and never for other lines,
  and Node receives at most one row per state. Its database work is still linear in the practice's case lines (the
  latest-stage lookups) plus its lines at actionable (the check): bounded in memory, not in time. The home as a whole
  still reads every ledger entry and runs the stage summary, so it is not bounded either (F13). The design's gate (F1)
  compares the new statement's time against the sum of the three it replaces on CAS-41's 100,000-line month, recorded
  in the pull request with the whole `dashboard()` call's.
- The case page's net expected value can be negative: nothing left to pursue costs the pursuit.
- The HOM rows of the test matrix hold the behaviour: `pricing-current-routes.db.test.ts`,
  `reconciliation-routes.db.test.ts`, `home-figures.db.test.ts` (one statement, the check at one plan node, once per
  line at actionable; the upload gate against `practice_baa_on_file()`), `triage/actionable-now.db.test.ts` (the
  statement and the digest, before and after a re-run) and `reconcile/recovered-periods.test.ts` (500 random ledgers
  with corrections crossing the quarter's boundary) for HOM-01 and HOM-03; the words' unit tests and `pnpm lint:copy`
  for HOM-02; `reconciliation.spec.ts` for HOM-04.

## Not verified here

- The figure on a real practice's history: every test reads synthetic cases (CAS-08, LED-06 and CAS-41's generated
  month).
- The home's time on a practice larger than CAS-41's month, or with years of stage history: the latest-stage lookups
  grow with it.
- A statement or digest recorded before this change and read after it: none exists outside test databases.

## Revisit when

- Lane A's PR 11 refreshes `case.actionable_cents`: if it stores the live predicate (kept current when a line's stage
  or pricing changes), every reader moves to that indexed column and the home's time is bounded; if it keeps the
  case's ask, this module stays the one definition. The `roi_links_valid()` key `actionable_open_lines` belongs with
  it (Decision 7).
- #42 merges: the monthly summary counts a case line as actionable only through `ACTIONABLE_NOW_LINE` and reports the
  rest apart as out of the figure; the practice help's "only stage-five amounts are recovered" (`components/help.ts`)
  becomes "Dollar figures carry their stage; only cash posted or deposited at the practice’s proof level, net of
  recoupments and reversals, is recovered.", with a copy-lint rule against stage numbers.
- The audit report's per-run actionable figure and its Payer approved note, which has no proof level, are taken up
  (the design's open question 2).
- Launch precedes the merge of this change: statements generated before it hold stored totals under the same label,
  and the change is dated by `generated_at` against the deploy.
- The digest's case set (state `open`, passed deadlines excluded) and the home's (every worked state, passed deadlines
  included) are made one: a choice of which cases are nearing their deadline, not of the figure.
