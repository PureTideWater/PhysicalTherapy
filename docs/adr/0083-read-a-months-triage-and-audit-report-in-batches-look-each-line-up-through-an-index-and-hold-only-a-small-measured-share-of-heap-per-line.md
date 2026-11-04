# 0083. Read a month's triage and audit report in batches, look each line up through an index, and hold only a small, measured share of heap per line

- **Status:** accepted for SUITE-CAP-1a (`co-001/suite-cap-1-bounded-reads`, bounded reads, no migration), merged as
  #81. SUITE-CAP-1b (`co-001/suite-cap-1-triage-locks`, the stage lock, built on SS-01 and #81's merge) is built and
  recorded below ("SUITE-CAP-1b, as built"); its migration `20261109090000_line_status_heads.sql` takes effect only
  with the founder's approval of the regenerated domain model (CO-02), which its pull request asks for. SUITE-CAP-1a's
  part is kept as it merged; the decisions it reserved for SUITE-CAP-1b are now recorded as built.
- **Date:** 2026-10-28
- **Deciders:** the co-founder, under the founder's delegation of 2026-10-25 (LANES.md, claim row 188), whose ruling of
  2026-10-26 (about 00:20 UTC, "Don't ask for approvals anymore just build and optimize") has the build take each
  recommended option without asking; the build (Lane B), for the design's choices and its review's findings, each
  reversible. Every option is judged under the founder's standing rule of 2026-10-18. SUITE-CAP-1a needs no founder
  action: it has no migration, no domain-model change and no freeze item.
- **SUITE-CAP-1b's ledger freeze exception (D8):** granted by the founder, Tyler Williams, relayed by the co-founder,
  on 2026-10-27 at 20:49 UTC (`approval-summaries/founder-asks-2026-10-27.md`, line 3), word for word: "Granted: the
  ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md
  section 4.5, as written." Recorded also in reconciliation-001, "Ledger semantics". SUITE-CAP-1b stays inside that
  text: section 4.5 changes the lock line of the two `ledger_entry` triggers and nothing else.
- **PRD sections:** 6 (Reports and exports), 8 (`line_status` and the status machine), 12 (triage and cases), 15 (the
  worker), 18 (testing and release); test matrix CAS-40, CAS-41 and CAS-42; ADRs
  [0038](0038-triage-runs-into-anomalies-and-cases-keep-five-stages-and-release-an-audit-report-only-once-a-reviewer-signs.md)
  (one transaction per triage and per report, unchanged),
  [0067](0067-measure-every-ledger-amount-in-what-the-payer-pays-decide-the-outcome-on-the-allowed-amount-show-the-patients-share-beside-and-take-back-on-a-reversal-the-payment-it-removes.md)
  (the correction chain the patient-balance step reads, unchanged),
  [0071](0071-check-a-releases-coverage-against-the-last-refuse-months-the-content-does-not-cover-read-only-the-keys-a-run-prices-and-keep-a-content-calendar.md)
  (the worker's 560 MiB heap and the weekly real-size run) and
  [0009](0009-database-roles-and-forward-only-migrations.md) (a rollback runs the previous image).

## Context

#49's weekly real-size run (ADR 0071) triaged and reported a 100,000-line month for the first time. A's triage and A's
audit report each failed all three attempts at about 48 s with Postgres 53200, "out of shared memory":
`line_status_rules()` takes one `pg_advisory_xact_lock` per line, and a month's triage holds one per line it moves until
it commits. The lock table is shared by the whole cluster, so one practice's triage also makes another practice's
stage writes fail. That defect, and its fix, are SUITE-CAP-1b's (below).

With the lock fixed on a scratch database, the same month ran on, and five more real-size defects stood behind it
(SUITE-CAP-1 design, section 1.4; probes on SYNTHETIC rows only):

1. **Triage's actionable write is quadratic.** `advanceStages` found each wanted line's current stage with a
   `DISTINCT ON` over the practice's events, joined to the wanted set by `IN`. Inside the triage transaction the
   practice's new validated events are its own uncommitted rows, which the planner's statistics do not count, so it
   chose a nested loop: 6,667 actionable lines in 7.1 s, then 33,334 in 196.8 s.
2. **Triage held every candidate's trace at once.** `candidateRows` read `p.trace` (4,735 bytes of JSON on average) for
   every candidate, and `candidateLines` judged them all before any was released: 531 MiB of peak heap against the
   worker's 560 MiB. The Cases page reads the same candidates in the web task through `planWaiting`.
3. **The report held every line at once.** `gatherReport` mapped every line to a `ReportLine` (about 965 bytes of heap
   each), filtered the array once per figure and per case, sorted it, and handed it to `generate.ts`, which printed the
   PDF with Chromium and only then built the whole CSV as one string. Under the 560 MiB flag it ran out of heap.
4. **The report's patient-balance step took 616 s,** from a missing index (`claim.superseded_by_claim_id`, SUITE-CAP-1b)
   and a quadratic loop (`lineShares` filtered every adjustment for each claim and for each line).
5. **Large jobs of different practices share one heap.** The worker runs every practice queue in one process with one
   560 MiB heap on a 1,024 MiB task, and the report prints with Chromium in the same task. A heap out-of-memory is not a
   job failure: V8 aborts the process and every in-flight job of every practice dies with it.

A rollback makes the order matter. Shipped with the lock fix, the bounded reads would leave a gap: once the new trigger
no longer stops a large report at 48 s, the previous image's whole-read report runs on into a heap out-of-memory
(probe E), on a rollback (ADR 0009) and in each deploy's window between the migration and the new image.

## Decision

### Two rules for every reader of a month's lines

**A statement over a month's lines looks each line up through an index.** The planner cannot count a transaction's
own rows: statistics come from `ANALYZE`, which never sees uncommitted rows, so a triage that has just written 100,000
validated events still plans its next statement as if the practice had none of them. A statement that joins a month's
wanted lines to a table the same transaction is filling must therefore reach each line through an index lookup the
plan cannot turn into a scan per line: a `LEFT JOIN LATERAL (… WHERE practice_id = $1 AND <line> = w.<line> ORDER BY
… LIMIT 1)` on an index whose leading columns are those keys. Not a `DISTINCT ON` or `IN` over the whole practice,
which the planner may answer with a nested loop, and not `ANALYZE` inside the transaction, which fixes one plan by
accident and costs a full sample each time.

**A job's heap does not hold a month's lines beyond a small, measured per-line holder.** A reader of a month's lines
reads them through a cursor in fixed batches, judges or folds each batch while its rows and traces are in hand, and
drops them before the next. What may grow with the month is named, kept small and measured in a test: today triage's
judged `CandidateLine`s (`planCases` must see every candidate of a pattern) and the report's CSV arena index (its rows'
bytes are kept outside the V8 heap). A new per-line holder is a design decision with its own measurement, not a
convenience.

### The options

The defects behind the lock (design 2.2):

| Defect | Option | Verdict |
| --- | --- | --- |
| 1. Quadratic stage advance | **A per-line `LEFT JOIN LATERAL` lookup on `line_status_by_line`** | **Taken** (D12). 33,334 actionable lines in 5.0 s, from 196.8 s |
| | Read the stage from `line_status_head` (1b's head row) | Rejected: the application role has no grant on it (1b's D4), and a definer read function adds surface for no gain over the index |
| | `ANALYZE` inside the triage transaction | Rejected: fixes one plan by accident, a full sample on every triage |
| | Drop the filter and let the trigger refuse lines already at the stage | Rejected: a refusal aborts the statement, and a re-triage must skip them |
| 2. Triage's traces held whole | **A cursor over the query it runs today, batches of 2,000, judged per batch; only the `CandidateLine`s kept** | **Taken** (D13) |
| | Group in SQL | Rejected: moves `@tp/triage`'s judgement, which reads the trace in TypeScript, into the database, for memory the target does not need |
| 3. The report held whole | **Fold the figures per batch and stream the CSV from a byte arena** | **Taken** (D14, D17) |
| | An external sort spilling sealed runs to the task's disk | Rejected: PHI on a local disk, cleanup after a crash, a disk budget, and little to win over the arena's heap |
| | Order the CSV by what a query can sort (payer, plan, date, claim) | Rejected: the claim number is sealed with the practice's key, so this changes what a person reads in the CSV, a product change this fix does not need |
| | A larger worker task or heap | Rejected: a cost every month, and the whole read still grows with every line |
| 4. Patient balance | **Group the adjustments once; fold per batch of case lines; read the ledger entries once** | **Taken** (D16, D18); the index is 1b's (D15) |
| | Rewrite `claimLines` without its recursive lookup | Rejected: it is the ledger's correction chain (ADR 0067), and with the index it takes 0.97 s |

Concurrent large jobs (design 2.3): **keep each large job's heap per line small and measured** is taken. Rejected: a
process-wide gate over price, triage, the report and reconcile (pg-boss counts a job's expiry from its fetch, so a
gated job runs its expiry down while it waits, and a small practice's triage waits behind a large report); a larger
task or heap (a monthly cost, and the sum still grows); a second worker service for large jobs (a second task's cost,
and its jobs still share its heap); a per-job heap reservation (estimates to keep true). Measuring the live heap per
job, in the weekly run and in production, is SUITE-CAP-1b's (D19, D10, D23).

### Decisions

The design's decisions keep its numbers (other designs cite them). SUITE-CAP-1a's:

| # | Decision | Why |
| --- | --- | --- |
| D12 | `advanceStages` reads each wanted line's latest event with a `LEFT JOIN LATERAL` lookup on `(practice_id, service_line_id)` ordered by `seq DESC LIMIT 1`. | Defect 1, and the first rule above. The same rows are filtered out, so the same events are written. |
| D13 | One candidate reader, `judgedCandidates(scope, practiceId, pricingRunId, requestId)`, reads `candidateRows`' query through a cursor in batches of 2,000, audits each batch, judges it with `candidateLines`, and returns only the `CandidateLine`s, in the same order. Triage and `planWaiting` (so opening a case and the Cases page) use it. `candidateRows` and `candidateLines` stay, for the reader and for tests. | Defect 2, and its web twin. |
| D14 | The report streams: `runLines`' query through a cursor in batches of 2,000; per batch the deadlines, today's mapping to `ReportLine`, the running figures and the CSV arena; then the batch is released. After the last batch: the cases, headline and gaps from the folded figures, the CSV streamed, then the PDF. | Defect 3. Every figure is a sum, a count or a per-key total, so folding gives the same integers. |
| D16 | `lineShares` groups the adjustments once into two maps, claim-level by claim and line-level by line, keeping their query order, and reads them from the maps. | Defect 4. The same adjustments, in the same order, reach the same arithmetic. No ledger table, ledger package, matching rule or recovered total changes, so this is not a freeze item. |
| D17 | The CSV keeps its order and its bytes. Each line's row (`csvRow(line).map(csvCell).join(',')` and CRLF) is appended to a byte arena of 1 MiB chunks outside the heap, with its sort key in typed arrays (payer and plan as indexes into an interned list, the line number) and two strings (the claim number and the line ID). After the last batch an index is sorted with today's comparator and the header and rows are streamed in that order through `documents.write`'s `AsyncIterable`. | Defect 3. The claim number is sealed in the database, so no query can sort by it; the arena keeps the sort key and nothing more. `auditCsv` stays as the reference the test compares against, and for its other callers. |
| D18 | The report's other per-line reads go by batch: `lineDeadlines` for each batch's lines; `patientBalanceCases` folded over batches of 2,000 case lines; the practice's ledger entries read once and passed to `lineCorrections`. | Each held a whole month's rows at once. The functions' answers are unchanged. |
| D21 | SUITE-CAP-1a ships before SUITE-CAP-1b. From launch on, 1a reaches production in an earlier release than 1b, and the runbook's rollback note for 1b's release says so. | The image before the new trigger must already read in batches (Context, the rollback). |

Reserved for SUITE-CAP-1b, which records them here as built: D1 to D6 (the head row `line_status_head` and the
trigger's row lock), D7 (no writer changes for locking), D8 (the ledger triggers' practice key, under a freeze
exception), D9 (`max_locks_per_transaction` unchanged), D10 and D20 (the weekly run's new checks and its "large jobs
together" phase), D11 (stored windows stay with #8), D15 (the index `claim_by_superseded`), D19 and D23 (the worker's
live-heap log line and its alarm), and D22 (the migration's `NOWAIT` lock loop).

### As built (SUITE-CAP-1a)

**Triage** (`apps/worker/src/triage/execute.ts`, `patterns.ts`):
- `CANDIDATE_QUERY` holds `candidateRows`' query text, moved word for word, so the whole read and the cursor read the
  same statement. `CANDIDATE_BATCH_LINES = 2000`.
- `judgedCandidates` declares `triage_candidates NO SCROLL CURSOR` with the same two parameters (node-postgres binds
  them through the extended protocol; no cursor package is needed), then fetches 2,000 rows at a time, each `FETCH`
  inside `readWithAudit` (purpose `triage`, one `priced_line` event per row, as before), and judges each batch with
  `candidateLines`. One release-facts loader is shared by every batch, so each release's facts are read once per call;
  `lineDeadlines` stays per batch (it is a pure per-row query). It stops on an empty or short batch and closes the
  cursor. It does not close in a `finally`: an error aborts the transaction, which ends the cursor, and a `CLOSE` there
  would hide the first error.
- `triageInScope` and `planWaiting` call it. The audit events are the same set; their insert order now interleaves with
  the deadline reads, and no read depends on `audit_event`.

**The report** (`apps/worker/src/report/content.ts`, `csv-arena.ts`, `generate.ts`):
- `RUN_LINES_QUERY` holds `runLines`' query text, moved word for word; `REPORT_BATCH_LINES = 2000`. `gatherReport`
  declares `report_lines`, and per batch fetches inside `readWithAudit` (purpose `audit_report`), reads that batch's
  deadlines, maps each row with today's mapping (`reportLineOf`), folds it into `ReportFigures` and appends it to the
  arena. It returns `{ content, arena }`.
- `ReportFigures` holds one running total per filter the old code ran: validated and overpaid counts and cents; per
  pattern its key, tally and first line under the report's order (so patterns keep their order of first appearance in
  the sorted lines); not-actionable tallies keyed by the reason's place in the fixed list; per case the lines still
  actionable and their variance, and the set of this run's case lines; the no-window and unverified charge tallies and
  the set of unverified causes (`deadlineRemedy` reads membership only).
- `CsvArena` (`CSV_ARENA_CHUNK_BYTES` = 1 MiB) keeps a row that does not fit in the next chunk, so it holds the rows'
  bytes plus at most one chunk's tail. It holds the report's `compareText` (by UTF-16 code unit, as before) and
  `compareLineOrder`. After `release()`, `append` throws and `rows()` rejects.
- `generateAuditReport` gathers, draws the two keys as before (PDF first, CSV second), writes the CSV from
  `arena.rows()` and releases the arena in a `finally`, then runs `auditReconciliation`, prints and writes the PDF and
  runs the same `UPDATE`, all in the same transaction. Chromium never runs while the arena is held. The CSV's SHA-256
  is the same, since the same plaintext bytes pass the hashing tap.
- `gatherReport` creates the arena first and releases it on every path that does not hand it to the caller: anything
  that throws, in the line loop or after it (`practiceLedgerSettings`, `ledgerEntries`, `patientBalanceCases`, building
  the content), releases it once and the error goes on. `release()` is idempotent, so the caller's own `finally` after
  a handed-over arena is safe. A test fails `gatherReport` after its line loop, at the ledger read and at the patient
  balance's cursor, and finds the arena released once.
- **A failed print leaves the CSV stored.** Because the CSV is written before Chromium prints (design 5.3 point 4), a
  failure in `auditReconciliation`, the print or the PDF's write leaves the sealed CSV under this attempt's own key with
  no `audit_report` row naming it, where the base stored nothing on a failed print. It is not deleted, and cannot be:
  the documents bucket is written once per key, and the application role holds no `s3:DeleteObject` and no Object Lock
  bypass on any bucket (`infra/lib/constructs/application-role.ts`; `infra/test/application-role.test.ts`, "cannot
  delete objects"), and `SealedBytes` has no delete. It is the same class of object the base already left when the CSV's
  write failed after the PDF was stored: a sealed copy of one practice's report under a fresh random key of that
  practice (`auditReportKey`, one per attempt, so at most three per report across its retries), sealed with the
  practice's data key (ADR 0018), named by no row, readable by no screen or link. The rule that covers it is ADR 0018's
  data lifecycle: the documents bucket keeps current objects until the practice's data key is destroyed at its
  deletion, which makes every one of its objects unreadable, orphans included (noncurrent versions expire after the
  35-day backup window). No figure or byte of a stored report changes.
- `patientBalanceCases(scope, practiceId, caseIds, entries, batchLines?)` reads its case lines through
  `report_case_lines` in batches of 2,000 and folds `foldPatientBalance` per case (`PATIENT_BALANCE_UNSEEN`, `patientBalanceOf`, beside an
  unchanged `casePatientBalance` in `apps/worker/src/reconcile/patient-share.ts`). A line's answer from
  `lineCorrections` depends only on its own claim, so batching by line is safe; the test checks that too. The case
  lines come in their claim's order, so each batch holds whole claims and the batches together read each claim's lines
  and correction chain once, as the one whole call did. Unordered, the case lines of a month scatter over its claims,
  and each batch read the claims of nearly all its lines again (the Check phase's 100,000-line probe: 7,584 claim rows
  for each batch of 2,000 case lines, 2.6 times the whole call's rows, each `claimLines` call about 50 s until
  SUITE-CAP-1b's `claim_by_superseded`).
- **The chains' practice-wide part is read once per report.** `chainContext` reads, for any call, the practice's
  matches in chain order (`CHAIN_ORDER`, `ledgerMatches`) and the lines (`claimLines`) and loaded reversals of every
  claim a claim match names, beside the call's own claims. Called once per batch of case lines, that part was read
  again for every 2,000 case lines (about 17 times for a 100,000-line month, where the base read it once). Now
  `patientBalanceCases` reads it once, before its first batch, through `practiceCorrections` (`practiceChains` in
  `remittances.ts`, with what each match's entries approved), and each batch's `lineCorrections` reads only its own
  claims' lines and reversals (`chainContextFor`). A line's chain reads its own claim's lines and the matched claims'
  lines and reversals alone, and a reversal belongs to the one claim it reverses, so the two parts are disjoint; merged
  (claim lines by claim; reversals in the query's order, payment date, when loaded, ID, each once) they hold for each
  line what one call over every line would. `chainContext` itself sends the same queries in the same order as before,
  so its other callers (`remittances.ts`, `postings.ts`, `shortfalls.ts`, `manual.ts`, and through them the web) are
  unchanged.
  The test counts the queries the batched `patientBalanceCases` sends (a client proxy): the chain order, the matches and
  the matched claims' reversals once per report, and on a two-line case on two claims at batches of one, the matched
  claims' lines once.
- `lineShares` is exported and groups once (D16). `lineCorrections` takes an optional fourth argument, the ledger
  entries or the practice's part read once (`PracticeCorrections`); the web's callers keep today's signature through its
  default, which reads the entries and the chains whole as before.
- **Batch sizes a test can name.** `TriageOptions.batches` (`candidateLines`), `ReportOptions.batches` and
  `GatherInput.batches` (`ReportBatches`: `candidateLines`, `reportLines`, `caseLines`, `csvChunkBytes`) default to
  `CANDIDATE_BATCH_LINES`, `REPORT_BATCH_LINES` and `CSV_ARENA_CHUNK_BYTES`; production names none, and no environment
  variable sets them. `batchSize` refuses anything but a positive whole number, since the size is written into a
  `FETCH`.

Cursor names are fixed per reader, so a second declare in the same transaction fails loudly; no caller runs two of
one at once (the report's inline triage closes its cursor before `gatherReport` declares its own). A cursor is planned
with `cursor_tuple_fraction` 0.1, which may change a plan but not its rows or their order; SUITE-CAP-1b's real-size
measurement checks the time, and `SET LOCAL cursor_tuple_fraction = 1` around the `DECLARE` is the in-file remedy.

**What stays per line after a batch:** triage's `CandidateLine`s; the report's folded figures (per pattern one key and
one five-field first-line key, per case a tally and the run's case-line IDs, the cause set), the arena (its bytes
outside the heap; per line five typed-array slots and two strings), and the interned payer and plan names. Each
reader's peak also holds about two batches, since the previous `FETCH`'s rows are alive while the next runs: a
constant, not per line.

### The proof (CAS-41)

- **The same answers** (`apps/worker/src/triage/batched.db.test.ts`, `apps/worker/src/report/streamed.db.test.ts`). The
  whole reads of `claude/build-platform` at 085299bd are kept word for word as test references
  (`apps/worker/src/triage/test-support/whole-triage.ts`, `apps/worker/src/report/test-support/whole-read.ts`). Through
  `executeTriage` and `generateAuditReport` on the CAS fixtures (and LED-06, CAS-08 and LED-15 for recovery and the
  patient balance), and on a generated 10,000-line SYNTHETIC month through the readers, with every kind of line the
  figures distinguish: the judged candidates in order, the stored content, the CSV's bytes and SHA-256, the HTML handed
  to the PDF renderer and the audit events (one per row read) equal the whole read's. `lineShares`,
  `patientBalanceCases` and `lineCorrections` equal their filtering versions, and
  `apps/worker/src/reconcile/patient-share.test.ts` holds the fold equal to `casePatientBalance` in any order and split.
- **Bounded memory per line.** Heap in use after two full collections, sampled every 250 ms and at every query the
  reader sends, and once more with its answer in hand (for the report, before the CSV is written), at 10,000 and
  20,000 lines: at most 1,000 bytes per added candidate for triage and 400 bytes per added line for the report; the
  arena's buffers equal the CSV rows' bytes within one chunk. The sizes are 10,000 and 20,000 rather than the design's
  2,000 and 10,000: below about 10,000 lines the batches of 2,000 (candidates, and the report's case lines) are still
  filling, and that fill counts as growth (3,020 bytes per candidate and 1,283 per line between 2,000 and 10,000), so
  the bound would fail on readers that are bounded. From 10,000 lines the readers are in their steady state.
- **Measured** (Node 24, PostgreSQL 18): the base's whole reads grow by 5,477 bytes per added candidate and 5,350 per
  added line, and fail; the bounded readers grow by 802 and -230 (807 and -336 with a 5 ms timer), and pass.
- **Across batch boundaries.** Every comparison through the job (the CAS fixtures for triage and the report, LED-06,
  LED-15, and LED-15's two lines on two claims with its partial EFT) runs again with batches of one line and 61-byte
  arena chunks, so each line is a batch of its own for triage's candidates, the report's lines and its case lines, and
  every row falls across chunks: the same content, CSV bytes and SHA-256, PDF HTML and audit events. The figures folded
  are non-zero there: LED-06's payer approved and recovered 3,000 cents, LED-15's patient balance, and the two-claim
  case's 3,000 still actionable, 1,000 approved, 1,000 recovered and its patient balance, each line in its own batch.
  The generated month's readers also run in batches of seven with 61-byte chunks (splitting its multi-byte payer names),
  and `lineCorrections` in batches sharing the practice's part equals the one call on every fixture.
- **The arena** (`apps/worker/src/report/csv-arena.test.ts`): rows in random order come out in the comparator's order,
  byte-equal to `auditCsv` across chunk boundaries, with non-ASCII names, quoting, formula prefixes, ties by line ID and
  a row longer than a chunk.

SUITE-CAP-1a cannot prove 100,000 lines on its own, since today's trigger still stops a large triage at the lock. It
proves the same answers and the per-line memory at sizes today's trigger allows; SUITE-CAP-1b proves the real size
(CAS-42).

### The split

SUITE-CAP-1 ships as two pull requests, in this order:

- **SUITE-CAP-1a, bounded reads (now, this ADR's part).** D12, D13, D14, D16, D17, D18, with CAS-41. No migration and no
  domain-model change, so it is outside Lane A's serial chain (LANES.md rule 2) and merges on green checks after its
  fresh-clone verification (LANES.md rule 7). It changes no file of #42's code; its shared documents
  (`docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts`) and the generated
  `tools/screening-capacity/watched-paths.txt` follow LANES.md rule 6: whichever of the two merges second resolves the
  documents and runs the generator again.
- **SUITE-CAP-1b, the stage lock (after #42, SS-01 and SUITE-CAP-1a merge).** The migration
  (`line_status_head`, the trigger's row lock, `claim_by_superseded`, and under a ledger freeze exception the ledger
  triggers' practice key), the worker's live-heap log line and alarm, the weekly run's new checks and phase, CAS-40 and
  CAS-42. It needs the founder's approval of the regenerated domain model. It completes this ADR's status, adds the
  lock's section as built, and adds a dated note to ADR 0038.

**The release order (D21).** From launch on, SUITE-CAP-1a reaches production in an earlier release than SUITE-CAP-1b.
The image before the new trigger then already reads in batches, so neither a deploy's window nor a rollback to the
previous image runs the whole reads on a trigger that no longer stops them. A rollback past SUITE-CAP-1a is not a
supported step on SUITE-CAP-1b's schema: on a large month the whole reads take the worker, and every practice's
in-flight job, down. SUITE-CAP-1b's runbook note for its release says so.

### SUITE-CAP-1b, as built

SUITE-CAP-1b moves a line's stage lock out of the cluster's shared lock table and measures the worker's heap per job.
It changes no writer's code and no sentence a person reads.

#### The decisions it reserved, as built

| # | Decision, as built | Why |
| --- | --- | --- |
| D1, D5, D6 | `line_status_head`: one row per service line with any stage event, holding its current stage and the `seq` of its latest event. Its key is an `id` (every registered table's key is one column, which the cross-tenant tests address rows by); the unique index `line_status_head_once (practice_id, service_line_id)` is the upsert's arbiter and keeps `practice_id` leading. No foreign keys. Forced row-level security with the tenant policy `line_status_head_tenant`, a registry row, and `line_status`'s guards (`triage_never_deleted()`, `triage_no_truncate()`). | The design's option H. The stage event the trigger checks carries the same references in the same statement; CAS-40.5's property and CAS-40.7's backfill hold the head row equal to the line's latest event, which a foreign key cannot say. |
| D2, D3 | `line_status_rules()` takes the line's lock by writing its head row first: `INSERT … ON CONFLICT (practice_id, service_line_id) DO UPDATE … RETURNING WITH (OLD AS prior, NEW AS next) prior.stage, next.seq`. `prior.stage` is the stage the event follows (null for a line's first) and the checks run against it, with today's messages; `NEW.seq` is the identity value a first event drew, or a `nextval` drawn under the lock. The `pg_advisory_xact_lock` per line is gone. | A writer of the same line waits on the row until the other commits, so a line's events sort in commit order (CAS-40.2) and the lock lives in the row, not in the shared lock table (CAS-40.9, 30,000 events in one transaction with no advisory lock). |
| D4 | `line_status_rules()` is `SECURITY DEFINER`, owned by `tp_owner`, `SET search_path = pg_catalog, public, pg_temp`, `REVOKE ALL … FROM PUBLIC`. No role may insert, update or delete `line_status_head`; the trigger is its only writer. **`tp_app` holds `SELECT` on it,** within its practices by the tenant policy, as it reads `line_status`. | The design said no grant at all. Every tenant table is read as `tp_app` by the generated access and cross-tenant tests (`access.db.test.ts`, 6 tests; `cross-tenant.db.test.ts`, 8 tests), which fail with "permission denied" without it, and those tests are never loosened (CLAUDE.md rule 4). A read grant shows a person nothing new: the head row is the latest event of `line_status`, which `tp_app` already reads in the same practices. CAS-40.8 asserts the exact ACL. The founder's approval of the domain model covers it. |
| D7 | No writer's code changes for locking: triage, the report, opening a case, reconcile, manual ledger work and the reopen keep their transactions, their outer locks (`triage:`, `ledger:`) and their statements. | ADR 0038's "an advisory lock per practice" stays true (its dated note of 2026-10-28). |
| D8 | Under the founder's grant (Deciders, above): `ledger_entry_within_evidence()` and `ledger_entry_within_line()` take `pg_advisory_xact_lock(hashtextextended('ledger:' \|\| NEW.practice_id::text, 0))`, the key `lockLedger` already holds, instead of one key per posting or EFT row and one per line. Nothing else in either body changes; CAS-40.8 diffs each body against `20261027090000`'s. | Every `ledger_entry` writer runs after `lockLedger`, so the triggers re-take a lock the transaction holds: no new lock-table entry and no deadlock. |
| D9 | `max_locks_per_transaction` stays 64 everywhere. | The tests prove a bound that does not depend on it. |
| D10, D20 | The weekly run reads the new checks (first attempt; at most `TRACE_LOCK_BUCKETS` = 64 advisory locks per backend; the live heap at most `HEAP_LIVE_PERCENT` = 75% of its `job heap` line's limit; memory per phase) and runs the phases "reconcile" (step 7b) and "the large jobs together" (step 7c). | The review's F1 and F2. |
| D11 | The stored per-content windows stay with #8. | Unchanged. |
| D15 | `claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL`, built under the lock loop's `SHARE` lock. | The report's patient balance and `claimLines` look claims up by the claim they supersede (Context, defect 4). |
| D19 | The heap line: `apps/worker/src/heap.ts` keeps one process-wide `PerformanceObserver` on major collections and the heap in use just after the latest one. `attempt()` in `apps/worker/src/worker.ts` opens a handle before every attempt of every job kind the worker runs (the practice jobs, the platform jobs and the screening jobs) and logs, in a `finally`, whether the attempt completed, failed or was refused, `job heap` with `job_id`, `job_type`, `heap_live_peak_mib` and `heap_limit_mib`. The peak is the largest live heap seen while the attempt ran (a job with no major collection reports the latest value from before it began), rounded **up** to a whole MiB, so a peak just over a line never reads under it; the limit is V8's `heap_size_limit`, rounded **down**. IDs and numbers only. | The quantity that crashes the worker is the live heap, not a sampled `heapUsed`. |
| D22 | The migration takes `claim`'s `SHARE` lock and `line_status`'s `SHARE ROW EXCLUSIVE` lock together with `NOWAIT`, once a second, up to 300 tries, in a subtransaction each; after that it fails with "line_status or claim stayed in use for five minutes; run the deploy again (docs/adr/0083)" (55P03). | A refused try queues nobody, so no reopen or 835 load waits behind the migration. |
| D23 | An alarm on the metric `JobHeapLivePeak` (`TherapyPlatform/Worker`, from a filter on `job heap`): the maximum of `heap_live_peak_mib` over 300 s above `HEAP_MIB.worker` × 75% (420 MiB), missing data not breaching, routed as the worker's other alarms. | The weekly run's line, read in production. |

#### CAS-42.3 at 2,000 lines

The reconcile at size (`apps/worker/src/reconcile/reconcile.large.db.test.ts`) runs 2,000 case lines by default, not the
design's 20,000; `TP_LARGE_RECONCILE_LINES` sets any size. The pass grows faster than its lines whatever its locks:
`candidatesFor` runs two queries per open case line per pass (the by-patient one decrypting every claim of the same code
and date), `claimLines` reads each line's correction chain on its own, and `syncLineStages` writes each stage as a
statement of its own that refreshes the line's whole case. 2,000 lines took 57.7 s and 6,000 took 341.8 s on 4 CPUs
with the lock fixed, so 20,000 would take hours, past a CI shard. The lock bound it proves (at most the practice's one
`ledger:` lock) is the same at every size: on SUITE-CAP-1a's merge the sampled peak was 6,001 locks at 2,000 lines,
about three per line. The pass's own time at size is handed on (Revisit when). Its 835s are LED-06's SYNTHETIC segments
repeated under new numbers, since the worker does not depend on `@tp/synth`.

#### The proof at real size (CAS-42.1 and CAS-42.2), measured

`apps/worker/src/triage/triage.large.db.test.ts` (`TP_LARGE_TRIAGE_LINES`, 100,000 by default) builds the harness's
shape: B's month (20,000 lines) priced, triaged and reported; A's and Y's months (100,000 lines each) priced. Each
month is half Medicare Advantage non-contracted and half under a SYNTHETIC contract at 110% of Medicare with a cited and
verified 365-day window, in claims of four lines with sealed SYNTHETIC claim numbers, priced by the price job. Each job
runs through its own code (`executeTriage`, `generateAuditReport`) in a child process
(`apps/worker/src/triage/test-support/large-jobs.ts`) on the worker's login, printing with Chromium, and the heap is
D19's observer in that child. The advisory locks per backend are sampled every 25 ms.

Measured on this container (4 CPUs, Node 24, PostgreSQL 18.4 with 64 locks per transaction and 100 connections),
Chromium from `/opt/pw-browsers`, on 2026-11-01 and 2026-11-02 (two full runs of the file at `ce408d2f`; the times
below are the second's, the first's within 5%):

| Job | Heap flag | Time (budget) | Live heap peak (75% of the flag) | Advisory locks per backend | For the record: sampled `heapUsed`, resident |
| --- | --- | --- | --- | --- | --- |
| A's triage alone (CAS-42.1): 83,332 validated, 41,667 actionable in 1 case | 420 MiB | **60.1 s** (120 s); actionable write **6.6 s** (30 s) | **151 MiB** (315 MiB) | 1 | 231 MiB, 486 MiB |
| A's report alone, right after A's triage (CAS-42.1) | 420 MiB | **460.2 s** (180 s): **fails the budget**, see below | **128 MiB** (315 MiB) | 1 | 212 MiB, 549 MiB |
| A's second report and Y's triage together (CAS-42.2) | 560 MiB | report **87.2 s**, triage **70.0 s** (actionable 6.9 s) | **189 MiB** (420 MiB) | 1 | 307 MiB, 649 MiB |

The first run gave 61.5 s (actionable 6.7 s) and a live peak of 160 MiB for the triage, 481.3 s and 149 MiB for the
report alone, and 89.4 s, 72.3 s and 220 MiB for the pair. The file took 838 and 939 s, of which the shared setup
(B's month priced, triaged and reported; A's and Y's months priced) took 191 and 317 s.

With the candidates' query fixed (below), the integration's full database suite on 2026-11-02 ran the file in its
first shard (its shard took 722 s with every other file in it, against CI's 20-minute job): setup 358.3 s; A's triage
alone 70.8 s (actionable write 6.9 s), live peak 163 MiB; A's report alone right after it **95.8 s** (180 s), its
candidate read 10.8 s, live peak 117 MiB; A's second report and Y's triage together 111.8 s and 88.6 s (actionable
8.5 s), live peak 219 MiB (420 MiB); at most 1 advisory lock per backend throughout. Both tests pass.

On SUITE-CAP-1a's merge (`efb20704`, without SUITE-CAP-1b's migration; the test, its child and `heap.ts` copied in as a
scratch measurement): B's 20,000-line triage, in the shared setup, failed with 53200
("out of shared memory") at its validated write after 30 s, so neither test ran. At 20,000 lines
(`TP_LARGE_TRIAGE_LINES=20000`, B at 4,000), the setup completed in 44.7 s and both tests failed with 53200: A's
triage alone (CAS-42.1), and A's report beside Y's triage (CAS-42.2). The heap never came into it: the shared lock
table runs out first, as probe B found. So CAS-42.1 and CAS-42.2 fail on the base and, but for the report's time, pass
on the head.

Every live peak is far below 75% of the flag in force, so the gate of section 8.2 (the heap) holds and SUITE-CAP-1b
went on. Four readings of the numbers:
- **A report right after its own practice's triage took the wrong plan (fixed here).** 391.8 s of the 460.2 s is
  `FETCH 2000 FROM triage_candidates` (21 fetches): the report's own read of the candidates, `candidateRows`' query. The
  same practice's next report (CAS-42.2, minutes later) took 87.2 s, its candidate read 10.3 s. With autovacuum off on `line_status`, `case_line`
  and `line_status_head` the cursor took 421.7 s, and its plan (`auto_explain`) shows why: the statistics still hold
  `case_line` and `line_status` as they were before the triage added 41,667 case lines and 124,999 stage events, so the
  planner expects one candidate and answers `NOT EXISTS (… case_line …)` with a nested loop over every case line of the
  practice through `case_line_by_case (practice_id, case_id)`, 83,332 loops of 31,250 rows (2.6 billion rows filtered),
  instead of the unique `case_line_once (service_line_id)`. With autovacuum on, whether the report wins the race with
  its `ANALYZE` decides between about 80 s and about 460 s (two runs of 460 and 481 s, one of 80 s). It was a plan
  that depended on statistics, as D12's was. The integration fixed it: the query asks whether a line is in a case
  through a correlated subquery, `NOT coalesce((SELECT true FROM case_line cl WHERE cl.service_line_id = …), false)`,
  which the planner keeps per row and answers through `case_line_once`, so no anti-join plan is left to choose. Its
  rows and their order are unchanged (one case line per line, `case_line_once`). On the same database and statistics
  (100,000 lines, A's and Y's months priced, autovacuum off on the three tables, the cursor read as the worker's login),
  the old form had read 16,000 of 41,665 candidates when it was stopped at 120 s; the new one read all of them in 4.4 s
  (3.9 s for the old form once analysed). CAS-42.1 holds the report to its 180 s budget.
- **The report's own lines' query had the same dependence (fixed here).** At `048bc843`, the interest integration ran
  CAS-42.1 twice on fresh databases and A's report took 748.4 and 730.4 s, 688.1 and 672.7 s of it in
  `FETCH 2000 FROM report_lines` (51 fetches), while the pair's report (CAS-42.2) took 92 to 95 s; 1b's own run had
  95.8 s. `runLines`' query joined each priced line to a `DISTINCT ON` of the practice's every stage event and to every
  case line. With autovacuum off on `line_status`, `case_line` and `line_status_head` after the setup's `ANALYZE`
  (statistics as they were before A's triage: `case_line` 8,334 tuples against 50,001 live, `line_status` 25,000
  against 149,999), the cursor read as the worker's login, `auto_explain` with `log_analyze`: the old form's plan is a
  nested loop that rescans a materialized copy of every current stage (83,332 rows) and every case line (41,667) for
  each line, and its first `FETCH 2000` took 27.4 s with 111,057,071 and 83,334,000 rows removed by the join filters
  (about 23 minutes for the 100,000 lines at that rate). The query now reads a line's stage from its head row through
  `line_status_head_once (practice_id, service_line_id)` (a scalar subquery; the head row holds the stage of the line's
  latest event, written by `line_status_rules()` in the event's own statement) and its case line through a `LATERAL`
  with `LIMIT 1` through `case_line_once (service_line_id)`, so the planner keeps both per row and has no join to
  choose: on the same database and statistics it read all 100,000 lines in 16.6 s (100,000 index lookups each). Its
  rows are unchanged (one head row and at most one case line per line); the report's streamed-equals-whole test
  (`streamed.db.test.ts`) still compares it with the whole read's old form. No `ANALYZE` at the end of triage instead:
  the application role owns no table and may not analyze one, and a `SECURITY DEFINER` helper would add a migration
  for what the query's shape settles. Measured with the fix (2026-11-02, this container): CAS-42.1 three times in a
  row with autovacuum on, A's report right after A's triage **83.2, 81.3 and 80.8 s** (180 s; `report_lines` 22.6,
  21.6 and 22.2 s), A's triage 65.9, 66.0 and 61.8 s, and 85.9 s a fourth time in the database run of the report's and
  triage's directories; once with autovacuum off on the three tables (a scratch setting in an untracked copy of the
  file, never committed), A's triage 63.2 s and A's report **79.5 s** (`report_lines` 21.7 s); CAS-42.2's report
  91.5, 90.1, 86.7, 110.6 and 86.3 s and Y's triage 74.3, 74.1, 70.2, 88.0 and 70.9 s; at most 1 advisory lock per
  backend throughout; both tests passed in all five runs.
- **The limit V8 reports is not the flag.** `heap_size_limit` is the old generation's limit plus the young
  generation's: 612 MiB under `--max-old-space-size=420` and 752 MiB under 560, measured on Node 24.22. CAS-42 holds
  each peak to 75% of the flag itself. The weekly run's check took 75% of the `job heap` line's `heap_limit_mib`, which
  allowed 564 MiB under the worker's 560 MiB flag where the design meant 420 MiB. It now holds each peak to 75% of the
  worker command's `--max-old-space-size` flag (or of the logged limit, when that is lower or the command has none:
  `heapLimitMib` in `tools/release-capacity/checks.ts`), the line the production alarm reads (420 MiB). The line still
  logs V8's limit, as D19 says.
- **The sampled `heapUsed` and the resident memory are printed for the record only.** They count garbage V8 has yet to
  collect, and resident memory leaves out the Chromium processes.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| One pull request with the lock fix | A rollback or a deploy's window would run the whole reads on the new trigger, into a heap out-of-memory that takes the shared worker down (probe E) |
| Raise the worker's task size or heap | A cost every month, and the whole reads still grow with every line |
| A process-wide gate on the large job types | pg-boss's expiry runs while a fetched job waits, so queued large jobs expire and retry; a small practice waits behind a large one |
| An external sort for the CSV on the task's disk | PHI on a local disk and its cleanup and budget, for little over the arena's about 110 bytes of heap per line |
| A CSV order a query can sort | Changes what a person reads; the sealed claim number is the reason the arena exists |
| `pg-cursor` or another package for the cursor | Not needed: a parameterized `DECLARE … CURSOR` binds through node-postgres, and a dependency is one more pin |
| Closing the cursor in a `finally` | An error has already aborted the transaction, which ends the cursor; the `CLOSE` would raise and hide the first error |

## Consequences

- Triage, the Cases page's waiting patterns and the audit report read a month in batches of 2,000. Their figures, the
  report's content, its CSV's bytes and SHA-256, its PDF's HTML and the audit events are unchanged; no sentence a
  person reads changes, and no money computation, pricing file, ledger table or `content/releases` file changes.
- A triage's actionable write is linear in its lines whatever the statistics say.
- The report writes its CSV before it prints the PDF, inside the same transaction; the PDF and the CSV are stored
  under the same keys as before.
- The report reads the practice's ledger entries once, not twice, so `gatherReport` and `lineCorrections` now read
  them from one snapshot.
- `patientBalanceCases` uses a cursor, so it must run inside a transaction block; every caller does.
- CAS-41's two large test files take minutes each; they lead the database shards (`SLOW_FIRST` in
  `vitest.config.ts`).

## Revisit when

- SUITE-CAP-1b lands: it completes this ADR's status and adds the lock's section, and its 100,000-line measurement
  (with Chromium) confirms or corrects the cursors' plans and times and the per-line figures above.
- A new per-line holder is proposed for triage or the report, or another job type reads a month's lines: it gets the
  same two rules and its own measurement.
- The Cases page's time (it recomputes its waiting patterns on every load, over 20 s for 33,332 waiting candidates on
  4 CPUs): bounded in memory here, not in time; storing the waiting patterns at triage is handed to Lane A.
- `candidateRows`' query still reads the practice's whole stage log through a `DISTINCT ON`, which grows with the
  practice's history (`runLines`' now reads each line's head row): the head row, or a per-line lookup, would remove it
  in a later item.
- The reconcile pass's own time at size (CAS-42.3 runs 2,000 lines, not 20,000): `candidatesFor`'s two queries per
  open case line, `claimLines`' per-line correction chain and `syncLineStages`' statement per stage, which grow faster
  than the lines. SUITE-CAP-3 measures reconcile at real size.
