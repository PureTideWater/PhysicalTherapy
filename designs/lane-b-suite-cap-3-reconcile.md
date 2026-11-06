# SUITE-CAP-3: a reconcile pass at real size (no migration)

Design contract, 2026-11-02. Against `claude/build-platform` at **83d71fd6** (worktree `/home/user/suite-cap-3-reconcile`,
branch `co-001/suite-cap-3-reconcile`, read only), with SUITE-CAP-1b (`co-001/suite-cap-1-triage-locks` at 358dc53f)
and the interest fix (`co-001/ledger-interest-once` at e0646746) read, not checked out. Claim: LANES.md line 195. Item
prompt: `lanes/lane-b-item-prompts-2026-11-01/suite-cap-3.md`. Finding: `approval-summaries/lane-a-schema-chain-status.md`
lines 86-93. Run by the item session under Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW), from 2026-11-01.

Reserved and used: test-matrix CAS-49 to CAS-51; `packages/synth` cases CAS-49 to CAS-51 (module 5, the CAS module; no
fixture files); ADR 0087 (section 3, D12: the design makes one decision of lasting kind). No migration, index, table or
fixture release. Nothing under `packages/ledger/src` changes. No sentence a person reads changes.

Every number below was measured on SYNTHETIC rows only (this item's probe, `cap3-probe/`, rebuilt from SUITE-CAP-1a's
method; section 15), on a private PostgreSQL 18 cluster (port 5494, `max_locks_per_transaction` 4096, outside
`/tmp/claude-0`, removed at the end), 4 CPUs, the pass in a child process under `node --max-old-space-size=560`.

---

## 0. In twelve lines

1. On the base a step-7b pass (an 835 reprocessing every actionable line plus a posting export, approved and posted in
   one pass) took 262.5 s at 2,000 lines, 1,653.3 s at 6,000; with 1b's migration 208.4 s, 1,486.4 s, and 3,412.1 s at
   10,000 (about 3.3 h projected at 20,000). It grows close to N squared in every schema state.
2. Every statement family's call count is linear; the time per call grows. Four families do it: the per-line candidate
   queries (`candidatesFor`, two per open line per round), the per-candidate `claimLines` reads (two per line), the
   one-row stage inserts that each refresh the whole case (`syncLineStages`), and the ledger_entry triggers.
3. The first three are orchestration, in the worker. The fix keeps every rule, filter, comparison and write, and the
   order of every write, and changes only how often the pass reads: every open line's candidates found in one search
   for the pass (one statement per round by control number, one per pass by patient, each claim decrypted once), each
   claim's lines read once, and the pass's stage events written in one statement in today's order (D1-D4).
4. Three small quadratic loops in TypeScript and one quadratic read of the export's rows go the same way (D5-D7,
   D15).
5. The fourth (the ledger_entry triggers, 47.6 s of the 208.4 s at 2,000, 979.5 s of 3,412.1 s at 10,000) is in the
   database and frozen: handed to Lane A with its DDL and its measured gain (section 14.1). Most of it is
   `ledger_line_net`'s two whole-ledger joins, which a planner that sees an empty or small ledger runs as sequential
   scans per call; rewriting the function takes the inserts from 1,001.1 to 206.7 s at 10,000 (an index does nothing).
6. Measured (section 8.3), step 7b, state (c): 208.4 → 60.2 s at 2,000, 1,486.4 → 378.3 s at 6,000, 3,412.1 →
   1,058.4 s at 10,000; the candidate's own part is linear (5.1-5.7 ms a line) and the rest is the ledger triggers. With
   Lane A's function (14.1) as well: 21.6, 101.2 and 263.3 s. Shape P at 2,000: 136.5 + 66.4 → 7.8 + 9.8 s. The writes
   equal the base's row for row in all seven pairs compared, and LED-01 to LED-18 and the ledger oracle pass unchanged.
7. `claim_by_superseded` stays SUITE-CAP-1b's D15 (cited, not added). Its share is measured in section 1.4.
8. No lock, transaction or order changes: the pass stays one transaction under `lockLedger`, and every insert happens
   in today's order, so `ledger_entry.seq`, `line_status.seq` and (after the interest fix) `ledger_match.seq` draw the
   same order.
9. Shared code: `claimLines`' SQL is unchanged word for word (the interest fix's `CLAIM_LINES` copy stays valid);
   `chainContext` is unchanged; `lineChain` and `reprocessingOf` keep their answers, so the report path is re-proved
   by CAS-41 and the manual actions by LED-01 to LED-18.
10. Tests: CAS-49 (the same writes as today's code on generated passes), CAS-50 (the pass's statements and decrypts do
    not grow per line), CAS-51 (a real-size pass within its budget).
11. Merge: textually disjoint from the interest fix's hunks; whichever merges second re-runs CAS-49 (with LED-23 to
    LED-25 and the `seq` order if the interest fix is first). 1b only adds files here; its CAS-42.3 budget is reset by
    whichever lands second (section 8.4).
12. Not in this item, with why: section 14.

---

## 1. The problem, with evidence

### 1.1 What the pass does (83d71fd6)

`reconcilePractice` (`apps/worker/src/reconcile/pass.ts:35-51`) reads the practice's waiting exports, then runs one
transaction under `lockLedger` (`ledger.ts:16-18`): payer responses (`responses.ts:46`), `reconcileRemittances`
(`remittances.ts:1010`), `matchPostings` (`postings.ts:142`), `matchDeposits` (:190), `settleMatches` (:293),
`syncLineStages` (`stages.ts:72`) and the recoupment notices. Every caller (the triage job, intake and the
Reconciliation route storing an export, the remittance monitor, the daily schedule) runs the whole practice's pass.

Step 1, `matchClaims` (`remittances.ts:705-719`), reads the chain context once (`chainContext`, :414: the matches in
chain order, every case-line claim's and matched claim's lines through `claimLines`, the reversals), then for **every
open case line, on every pass, whether or not anything arrived**:
- `candidateClosure` (:723-741): at least one round of `candidatesFor` (:179-204), two statements: `byControl` and
  `byPatient`, each under `CANDIDATE_FILTERS` (:172-176). `byPatient` returns every claim with a line of the case line's
  code and date not yet matched to it, and decrypts each one's patient control number in TypeScript (:201). A round
  with candidates calls `claimLines` (:732) for them and runs another round.
- `chainOrdered` (:744-754): one more statement when a line has two candidates or more.
- per candidate, `matchCandidate` (:756) calls `reprocessingOf` (:593), which calls `claimLines` again (:599) for the
  line's claim and the candidate.

`claimLines` (:249-319) is one recursive statement: the named claims and every claim each corrects, back to the first,
with a correlated `corrects_claim_id` subquery per output row (:259). Without an index on
`claim(superseded_by_claim_id)` both the recursive step and the subquery scan the practice's claims.

`syncLineStages` (`stages.ts:72-110`) reads each line's ledger stage and latest event in one statement, then writes
each stage event with its own `INSERT INTO line_status` (`insertStage`, :60-70): zero to two per line. Each insert
fires the statement-level `line_status_refresh_cases` (migration `20261023090000:837-845`), which updates the line's
`"case"`, whose `case_rules()` (`packages/db/functions/case_rules.sql`) aggregates every line of the case with two
latest-event subqueries per line. Cases are reused by pattern while open (`triage/execute.ts:433`), so a case holds a
large share of the period's lines (a fifth in the probe's shape), and the same case row is updated once per event.

### 1.2 Measured: where the pass's time goes (state (c), 1b's migration applied; step-7b shape, spread R)

| family | calls | 2,000 s | 6,000 s | 10,000 s | k (2,000→6,000) |
| --- | ---: | ---: | ---: | ---: | ---: |
| ledger_entry inserts in `settleMatches` (the triggers) | N | 47.6 | 382.1 | 979.5 | 1.84 |
| `claimLines` (`remittances.ts:599`, :732) | 2N | 44.5 | 360.0 | 824.3 | 1.62 |
| `line_status` inserts (`stages.ts:61`) | 2N | 36.8 | 315.2 | 754.8 | 1.71 |
| `candidatesFor` by control number (:181) | 2N | 29.7 | 252.0 | 570.7 | 1.60 |
| `candidatesFor` by patient (:190) | 2N | 28.9 | 98.5 | 143.0 | 0.73 |
| TypeScript between statements | | 7.0 | 26.7 | 45.7 | 1.06 |
| **the pass** | | **208.4** | **1,486.4** | **3,412.1** | 1.79 |

Every family's call count is linear in N; the time per call grows (k is the exponent of the time; `t ~ N^k`). Peak heap
99 / 124 / 172 MiB against 560; TypeScript is 1-4% of the pass. Mechanisms, from the plans and auto_explain records
(`cap3-results/explain-cap3_r_6000_c_7b-after.txt`, `cap3-results/diag/`):
- `byControl`: each call hash-anti-joins all of `case_line` with `service_line` for the `NOT EXISTS` filter, O(N) per
  line.
- `byPatient`: flat per call on the realistic spread (16 claims share a code and date at any N), but on the adverse
  spread (a period on 20 dates) its decrypts grow with N: 50 a line at 2,000, 150 at 6,000 (900,000 decrypts against
  192,000), 312.3 s against 98.5 s at 6,000.
- `claimLines`: even with `claim_by_superseded` a call seq-scans `claim` and hashes all of `adjustment` (the recursive
  CTE is misestimated), O(N) per call.
- `line_status` inserts: each refreshes its case, 9.7 to 11.6 ms on a 400-line case, O(N/5) per event.
- ledger_entry inserts: section 1.5.

### 1.3 The other shape: postings only (a plain reconcile approved the reprocessing first)

| state | P 2,000 s | P 6,000 s | of which `line_status` inserts at 6,000 |
| --- | ---: | ---: | ---: |
| (a) base | 52.2 | 264.7 | 145.1 |
| (c) 1b sections 3-6 | 66.4 | 265.1 | 165.3 (62%) |

The approvals pass before it (shape P's `pre`) took 179.2 s (a) and 136.5 s (c) at 2,000: `claimLines` and the two
candidate queries again.

### 1.4 What SUITE-CAP-1b already removes (claim_by_superseded is its D15; cited, not added)

`designs/suite-cap-1-triage-locks.md` line 475 (D15) and section 4.4; migration
`20261109090000_line_status_heads.sql` section 4 on 358dc53f:
`CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL;`

| step 7b, spread R | (a) base | (b) + section 4 only | (c) sections 3-6 |
| --- | ---: | ---: | ---: |
| pass at 2,000 | 262.5 s | 224.2 s | 208.4 s |
| pass at 6,000 | 1,653.3 s | (dropped; (a) and (c) bracket it) | 1,486.4 s |
| one `claimLines` call at 2,000 / 6,000 | 21.7 / 48.9 ms | 11.9 ms / - | 11.1 / 30.0 ms |
| advisory locks per backend at 2,000 / 6,000 | 5,999 / 17,997 | 5,995 / - | 1 / 1 |

- Section 4 halves a `claimLines` call and takes 15% (2,000) and 10% (6,000) off the pass; the call still grows as N
  (above). The worker fix below removes the per-line calls; D15 then serves the three practice-wide calls and the report.
- Sections 3, 5 and 6 bring the advisory locks from about three per line to the practice's one `ledger:` lock, which
  removes the 53200 failure on a default cluster; they save little time (224.2 to 208.4 s at 2,000). The new
  `line_status_rules()` does not touch the statement-level case refresh (38.2 s against 36.8 s).
- Shape P at 2,000 runs slower in (b) and (c) (65.5, 66.4 s) than in (a) (52.2 s): a different `byPatient` plan (4.3
  against 10.4 ms a call). It is gone at 6,000 (264.7 against 265.1 s): plan noise, not a regression.

### 1.5 The ledger_entry triggers (Lane A's; section 14.1)

`settleMatches`' inserts (`postings.ts`, `insertEntry`) fire `ledger_entry_rules`, `ledger_entry_within_evidence` and
`ledger_entry_within_line`; the last calls `ledger_line_net(line, …)` three times
(`packages/db/functions/ledger_line_net.sql`). Its body LEFT JOINs `ledger_entry` twice on conditions that apply only
to reversals and adjustments, which the planner can use only as join filters; on a ledger it sees as empty each join
is a sequential scan of the practice's ledger per call (auto_explain: 12.8 ms a call, two scans of 3,995 rows, at
2,000 lines; trigger `ledger_entry_within_line` 39.0 of an insert's 43.4 ms). Two controls separate the causes:
- the ledger's planner statistics restored from an analyzed copy after its own pass (`statsx`): 47.6 → 19.9 s at 2,000;
- a ledger already holding 100,000 rows of another tenant (`fillx`, as a running deployment's would): 47.6 → 6.6 s at
  2,000, 382.1 → 48.7 s at 6,000.
So most of it is the plans made on an empty ledger (a new deployment's, or a first large practice's, first pass;
and the rows the pass itself writes are never in the statistics, since `ANALYZE` cannot see an open transaction's
rows), and what remains on a populated ledger still grows about N^1.8. No worker change reaches it: every one of these
inserts is a ledger write the rules require, in the required order.

### 1.6 Smaller quadratic steps

- `lineChain` (:542) filters every match of the practice for each line: O(C·M), in `matchClaims`, `shares`
  (`postings.ts:262`), `recoupReversals` and per line in the report.
- `settleMatches` sums the check's earlier check-level postings with `standing.slice(0, position).filter().reduce()`
  (`postings.ts:340-345`): O(P²).
- `claimsWithReference` (`postings.ts:72-90`) reads and decrypts every claim of the remittance for each posting row
  with a claim reference: O(P·K_r) decrypts, quadratic when one check holds thousands of claims.
- `matchPostings` and `matchDeposits` read the rows no match was ever made for with `NOT EXISTS (SELECT 1 FROM
  ledger_match m WHERE m.posting_row_id = p.id)` (`postings.ts:144-149`, :191-196). `ledger_match` has no index on
  `posting_row_id` or `eft_row_id`, and the export's rows were loaded moments before, unanalyzed, so the anti-join is
  planned on empty statistics and reads the matches once per row: one statement, 0.6 s at 2,000 rows and 5.6 s at
  6,000 on the candidate (k 2.0), which surfaced once the larger families were gone.

---

## 2. The options

The founder's standing rule (2026-10-18) judges each: accuracy, quality, user experience, reliability, security and
privacy, cost to serve, maintainability, resilience to change; never build effort.

### 2.1 Candidate search (`candidatesFor`, `candidateClosure`, `chainOrdered`)

- **A. One search for the pass (recommended, D1).** Before any line is matched, find every open line's candidates
  with the same rounds: per round one statement by control number for all lines still searching (each line's known
  claims passed as pairs), and once per pass one statement by patient that returns each claim some line's own query
  would have returned (same filters, joined on code and date), each decrypted once and given to the lines whose patient
  control number, code and date it carries and whose filters it passes; the chain's claim order sorted in TypeScript
  by the query's own key. Accuracy: identical filters, rounds and order (section 5.1 proves the equivalence; CAS-49
  tests it). Privacy: the search's decrypts fall from 31 per line (62,000 at 2,000 lines) to one per claim (500), never
  a claim no line's query would have decrypted. Cost: about six statements per pass (the patient search and its load-time read once, a control
  search and a claim-line read per round, two rounds in the probe's shapes) instead of two to eight per line. Resilience: the same
  `CANDIDATE_FILTERS` predicates, written once per statement.
- B. Keep one search per line, add indexes. Each call stays O(N) (the `NOT EXISTS case_line` anti-join and the claim
  scan are per call), and the indexes are a migration (not this item). Rejected: still quadratic.
- C. A patient-control-number equality hash column so `byPatient` filters in SQL. A migration on the remittance
  tables; measured unnecessary once each claim is decrypted once a pass (section 8.3: the patient search is about
  0.2 s at 2,000 and 0.9 s at 10,000 on the candidate, 1.5 s at 6,000 on the adverse spread). Rejected for now; proposed in section 14.3 should a spread make
  it matter.
- D. Search only lines whose code and date have a claim loaded since the last pass. Faster still, but it needs a
  "since" watermark that the rules do not have today (a person's unmatch, a reversal, a reload change eligibility
  without a new claim). Rejected: a matching-rule change in disguise.

### 2.2 Claim lines (`claimLines`)

- **A. Read each claim's lines once a pass (recommended, D2).** The context already holds every case-line claim's and
  matched claim's lines; each search round reads its new candidates' lines in one call; `reprocessingOf` takes the
  pass's map and reads only what it lacks (manual actions pass none and read as today). `claimLines`' answer for a claim
  depends only on the claim's rows and the claims it corrects, which the pass never writes, so the map equals a fresh
  read. The SQL stays word for word (the interest fix's `CLAIM_LINES` copy stays valid).
- B. Rewrite `claimLines`' SQL (drop the correlated subquery, join adjustments once). It speeds the three practice-wide
  calls in state (a), but D15 already does that; it changes shared SQL that the report and the interest fix's test
  plan. Rejected: no gain over A with D15, more merge work.
- C. Cache `claimLines` across passes. Rejected: a cache of PHI-bearing rows outside the transaction.

### 2.3 Stage events (`syncLineStages`)

- **A. One multi-row INSERT for the pass's events, in today's order (recommended, D3).** The statement trigger
  refreshes each touched case once. `INSERT … SELECT … FROM unnest(…) WITH ORDINALITY … ORDER BY n` keeps the row
  order, so each row draws its `seq` in today's order and each row's BEFORE triggers see the rows before it (PostgreSQL:
  SQL in a row-level BEFORE trigger sees the effects of rows previously processed by the same command), so a line's
  payer approved is checked before its recovered, under today's `line_status_rules()` and 1b's head-row version (both
  measured, section 8.3). The move-back notes are read before the insert, as each reads only its own line.
- B. Change `line_status_refresh_cases` to defer, or `case_rules` to update incrementally. A migration and a trigger
  change (Lane A); A already removes the per-event refresh. Rejected for this item; not needed after A.
- C. Chunks of, say, 1,000 events. Measured unnecessary: one statement of 2N rows (20,000 at 10,000 lines) took 4.8 s
  (section 8.3) within the 560 MiB heap; a chunk boundary would split a line's two events only if built carelessly. Kept as the
  fallback should a month's events outgrow one statement's parameters (each array is one parameter; no limit is near).

### 2.4 The smaller loops

- **`lineChain`: index the standing matches by line once per context (D5),** in a `WeakMap` keyed by the context's
  matches array, so every caller (the pass, the report, the screens) gets the same matches in the same order without a
  change to `ChainContext`'s shape. Rejected: a new field on `ChainContext` (touches the report's `chainContextFor` and
  the interest fix's `ChainContext` hunk).
- **`settleMatches`: a running sum of each check's check-level postings (D6),** in the standing matches' order. Same
  `before`, O(P).
- **`matchPostings` and `matchDeposits`: the rows never matched found by reading the matched IDs and the rows' IDs
  apart and comparing them in TypeScript (D15),** then reading those rows' columns by ID in today's order. Linear
  whatever the statistics. Rejected: an index on `ledger_match (posting_row_id)` and `(eft_row_id)` (a ledger-table
  migration, Lane A, and it still depends on the planner seeing statistics on a just-loaded table); `NOT IN` with a
  hashed subplan (the plan flips to a per-row subplan when the estimate passes `work_mem`).
- **`matchPostings`: each remittance's claims read and decrypted once a pass (D7),** through an optional map passed to
  `postingDecision`; the manual posting match passes none and reads as today.

### 2.5 The ledger triggers

No worker option exists: the inserts are the ledger's writes, one per owed line, and their checks are the database's.
For Lane A (section 14.1), under a founder freeze exception: rewrite `ledger_line_net` so a correction's target is
read by primary key only for a correction (measured: 1,001.1 → 206.7 s of inserts at 10,000, the same answers). An
index leading with `service_line_id` was measured and gives nothing (14.1).

---

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | `matchClaims` finds every open line's candidates for the pass before matching any (`passCandidates`): per round, one statement by payer claim control number for every line still searching (`controlCandidates`), and once per pass one statement by patient control number, code and date (`patientCandidates`), each claim decrypted once; rounds, filters, `preferredCandidates`, the seen and known sets and the chain's claim order exactly as `candidateClosure` and `chainOrdered` had them. `candidatesFor`, `candidateClosure` and `chainOrdered` go. | Section 2.1 A; equivalence in 5.1. Statements per pass instead of per line; decrypts at most one per claim. |
| D2 | Each claim's lines are read once a pass: the context's map, extended by one `claimLines` call per search round for the round's new candidates; `reprocessingOf` gains an optional last argument, the map, and reads `claimLines` only when the map lacks the line's claim or the candidate. `claimLines`' SQL does not change. | Section 2.2 A. `claimLines` reads stored rows only, which the pass never writes. |
| D3 | `syncLineStages` collects its events and writes them in one `INSERT … SELECT … FROM unnest(…) WITH ORDINALITY … ORDER BY n` (`insertStages`), in today's order (by `service_line_id`, a line's payer approved before its recovered); the move-back notes are read first. | Section 2.3 A. One case refresh per statement; same rows, same `seq` order, same checks. |
| D4 | No change to locks, transactions or write order. The pass stays one transaction under `lockLedger`; every `insertMatch`, `insertEntry`, `recordReprocessedNoChange` and stage event is issued in today's order. | Section 5.2. `ledger_entry.seq`, `line_status.seq` and, after the interest fix, `ledger_match.seq` draw the same order, so every reader that orders by them reads the same. |
| D5 | `lineChain` reads a line's standing matches from an index built once per context's matches array (a module `WeakMap`), in the array's order. `ChainContext` keeps its shape. | Section 2.4. O(C+M) per context instead of O(C·M); every caller (pass, report, screens) unchanged in answer. |
| D6 | `settleMatches` keeps a running sum of each check's check-level postings in the standing matches' order instead of re-filtering the prefix. | Section 2.4. Same `before` for each match. |
| D7 | `matchPostings` passes `postingDecision` a map of each remittance's claims with their patient control numbers decrypted, filled on first use; `postingDecision` and `claimsWithReference` take it as an optional last argument (the manual match passes none). | Section 2.4. One read and one decrypt per claim a pass instead of one per row. |
| D15 (found in the probe phase; numbered last) | `matchPostings` and `matchDeposits` find the rows no match was ever made for by reading the practice's matched `posting_row_id`s (or `eft_row_id`s) and its rows' IDs (identifiers only), comparing them in TypeScript, then reading those rows by `id = ANY ($2)` with today's `ORDER BY`. | Section 1.6 and 2.4. The same rows in the same order; linear on an unanalyzed table. |
| D8 | `claim_by_superseded` is SUITE-CAP-1b's D15 (`designs/suite-cap-1-triage-locks.md` line 475, migration `20261109090000` section 4). This item cites it and adds nothing to the schema. | The orchestrator's limit. After D1-D2 it serves the three practice-wide `claimLines` calls and the report. |
| D9 | No migration, index or table. The ledger triggers' part is handed to Lane A (section 14.1) with its DDL and measured gain; it needs a founder freeze exception. | The ledger freeze. |
| D10 | Nothing under `packages/ledger/src` changes; no matching rule, amount, stage, outcome or recovered total changes. | The freeze; CAS-49 and LED-01 to LED-18 prove it. |
| D11 | Every new statement is practice-scoped (`c.practice_id = $1`, `o.practice_id = $1`, inside the pass's practice scope with forced RLS); decrypts happen only in the worker, once per claim, never logged; no identifier reaches a log line, an error message or a job payload. | Tenancy and PHI rules; CAS-50 counts the decrypts. |
| D12 | ADR 0087: "A reconcile pass reads per pass, never per open line, and writes in the order the rules define." The pass's statements stay a bounded number per pass (CAS-50 enforces it); a new matching filter is written into the pass-level search and kept equal to the per-line definition CAS-49 holds. | A lasting constraint on every later change to the reconcile step (the matching rules will change again; a per-line query would bring the curve back). |
| D13 | CAS-49 to CAS-51 (section 7); the old per-line step is kept as test support (`apps/worker/src/reconcile/test-support/per-line.ts`) as the reference CAS-49 compares with, as SUITE-CAP-1a kept the whole read. | The proof is old against new, at generated sizes and shapes. |
| D14 | This item does not edit 1b's `reconcile.large.db.test.ts` or `tools/release-capacity`; whichever of 1b and this item merges second resets CAS-42.3's `PASS_BUDGET_MS` and default size and step 7b's expectation from section 8.4's numbers. | 1b is in Lane A's chain; its files are its own until it merges. |

---

## 4. Application changes, per file

### `apps/worker/src/reconcile/remittances.ts`
- Remove `CandidateRow`, `CANDIDATE_FILTERS`, `candidatesFor` (:165-204), `candidateClosure` (:722-741) and
  `chainOrdered` (:743-754); move their text unchanged into `test-support/per-line.ts` (D13).
- Add (beside where `candidatesFor` was):
  - `interface Candidate extends ClaimCandidate { remittanceId; paidOn; loadedAt: bigint }` (`claim.created_at` in
    microseconds, `(extract(epoch FROM c.created_at) * 1000000)::bigint::text`, exact: PostgreSQL 18's `extract`
    returns numeric and timestamps hold microseconds);
  - `inChainOrder(a, b)`: payment date text, then `loadedAt`, then the UUID's lower-case text, the order of
    `ORDER BY r.bpr16_date, c.created_at, c.id` (the reasoning `byPayment`, :449-458, already documents);
  - `controlCandidates(scope, practiceId, searched)`: one statement; the lines as `unnest($2::int[], $3::uuid[],
    $4::uuid[], $5::uuid[])` (index, service line, remittance, claim) and each line's known claims as pairs
    (`unnest($6::int[], $7::uuid[])`); per line, the claims a known claim's correction names or that carry a known
    claim's control number hash (through `claim_by_payer_claim_control_number`), filtered by exactly
    `CANDIDATE_FILTERS` with `$2`-`$5` replaced by the line's columns, `ORDER BY l.ix, r.bpr16_date, c.created_at, c.id`;
  - `patientCandidates(scope, cipher, practiceId, searched, matched)`: one statement returning each claim that some
    line's `byPatient` would have returned (the same filters, joined on the line's code and date: equality on both, or
    both dates null, which is `IS NOT DISTINCT FROM`), with its own lines' codes and dates; one statement for the lines'
    claims' `loadedAt`; each claim decrypted once; per line, the claims of its patient control number that pass its
    filters (the line's own remittance excluded, loaded no earlier than the line's claim, not known, never
    claim-matched to the line, a line of its code and date), sorted `inChainOrder`. `matched` is the set of
    `claim line` pairs of the context's claim matches (standing or reversed), read before any write;
  - `passCandidates(scope, cipher, practiceId, open, matched, lines)`: the rounds (section 5.1), extending `lines` by
    one `claimLines` call per round for the round's unread candidates.
- `matchClaims` (:705-719): build `open` (each open line with its `lineChain`, as today), the `matched` set and the
  pass's claim-line map (a copy of `context.lines`), call `passCandidates` once, then match each line's candidates in
  today's line order (`matchCandidate` gains the map as its last argument).
- `reprocessingOf` (:593-605): an optional last argument `read?: ReadonlyMap<string, readonly ClaimLine[]>`; it uses
  the map when it holds both the line's claim and the candidate, else reads `claimLines` as today.
- `lineChain` (:537-585): `const own = standingByLine(context.matches).get(line.serviceLineId) ?? []` (D5), with
  `standingByLine` and its `WeakMap` beside it.
- Nothing else: `claimLines`, `chainContext`, `practiceChains`, `chainContextFor`, `recoupReversals`,
  `providerAdjustments`, `claimInterest`, `recordInterest`, `hashesOf`, `Counts`, `RemittanceOutcome` and
  `reconcileRemittances` keep their text (the interest fix's hunks).

### `apps/worker/src/reconcile/stages.ts`
- `insertStage` (:60-70) becomes `insertStages(scope, practiceId, events, setBy)`: no statement for no events; else
  `INSERT INTO line_status (practice_id, service_line_id, stage, set_by, reason, reopened_from) SELECT $1,
  e.service_line_id, e.stage, $2, e.reason, e.reopened_from FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[])
  WITH ORDINALITY AS e (service_line_id, stage, reason, reopened_from, n) ORDER BY e.n`.
- `syncLineStages` (:72-110): the same reading and the same decisions, pushing events instead of inserting; one
  `insertStages` at the end; `forward` and `back` counted as today. `moveBackNote`, `notifyRecoupments` and
  `manualRecoupments` unchanged.

### `apps/worker/src/reconcile/postings.ts`
- `RemittanceClaims` (exported type); `claimsWithReference` (:72-90) and `postingDecision` (:111) take an optional
  last argument of that type; `matchPostings` (:142) creates one per pass and passes it (D7).
- `settleMatches` (:338-346): `checkPostedBefore: Map<remittanceId, bigint>` replaces the prefix filter (D6).
- `neverMatched(scope, practiceId, 'posting_row' | 'eft_row')` (new, private): the two ID reads and the comparison;
  `matchPostings` (:144-149) and `matchDeposits` (:191-196) read their rows by `p.id = ANY ($2::uuid[])` (`e.id`) with
  today's `ORDER BY` (D15).

### `apps/worker/src/reconcile/test-support/per-line.ts` (new)
- Today's `candidatesFor`, `candidateClosure`, `chainOrdered`, `matchClaims` and `syncLineStages` with `insertStage`,
  word for word, exported for CAS-49 (D13). Not imported by any production file (the lint rule on test-support
  imports already holds this).

### Not changed
`pass.ts`, `ledger.ts`, `manual.ts`, `responses.ts`, `patient-share.ts`, `shortfalls.ts`, `unmatched.ts`, the web's
reads, the report, every SQL function and trigger, `packages/ledger/src/**`, `packages/db/**`.

### Documents
- ADR 0087 (D12), new, with "Context" (this finding and its numbers), "Decision", "Consequences" (a per-line query in
  the pass fails CAS-50; a new filter goes in both the pass-level statement and the per-line reference CAS-49 holds) and
  "Measured" (section 8.3).
- `docs/runbooks/ci.md`: none (no new job or shard; CAS-51's default fits a test:db shard, section 8.2).
- `docs/product/test-matrix.md` and `packages/synth/src/cases/{matrix,registry}.ts`: CAS-49 to CAS-51 (section 7).
- `tools/screening-capacity/watched-paths.txt`: regenerated with `watched.ts --write` only if an import changes
  (`test-support/per-line.ts` is new but imported only by tests; the build checks).

---

## 5. Why the writes are the same

### 5.1 The candidate search, line by line

Today, for line L (in `caseLines` order: `case_id, claim_id, line_no`), before L's first write:
round r: `C_r = byControl(known_r)`, `P_r = byPatient(known_r)`; `cand_r = preferredCandidates([C_r, P_r])` less
`seen`; stop when empty; else read the candidates' lines, add each to `seen`, and each the line pairs with to `known`
and `found`; finally `chainOrdered(found)`.

The pass-level search computes the same per line:
1. **Nothing written in between changes L's filters.** Each filter names L itself or nothing: `c.id <> ALL(known_L)`,
   `c.remittance_id <> L.remittance`, `c.created_at >= L's claim's`, `NOT EXISTS ledger_match (claim, c, L's line)`,
   `NOT EXISTS case_line for c`, `r.status`, `claim_status_code`. Earlier lines' writes are ledger matches and entries
   on other service lines (`case_line_once` makes a service line one case line), payer responses and submissions; a
   pass never writes claims, remittances or case lines. So L's queries return the same rows whether run before any
   line is matched or just before L is.
2. **`byControl`** runs per round for the lines still searching, with each line's own `known_r`: the same rows per line
   in the same order (the statement's `ORDER BY l.ix, …` is each line's `ORDER BY` within its index).
3. **`byPatient`** differs between rounds only by `c.id <> ALL(known_r)`, and `known` only grows; so
   `P_r = P_1 less known_r`, which the search computes from one read. `P_1` per line is exactly the claims whose
   decrypted patient control number equals L's among those L's query returned: the statement returns the union over
   lines of what each line's query returned (the per-line filters are inside the statement's `EXISTS`), and TypeScript
   re-applies each line's filters to the claims of L's patient control number. The decrypt set is that union, each claim
   once.
4. **Rounds, `seen` and pairing**: per line as today; the round's `claimLines` read covers every line's new candidates
   (D2's map equals a two-claim read).
5. **Order**: `found` sorted by `inChainOrder`, the key of `chainOrdered`'s `ORDER BY`. Then the lines are matched in
   `caseLines` order and each line's candidates in that order: every `insertMatch`, `insertEntry` and
   `recordReprocessedNoChange` is issued in today's order with today's arguments (the baselines carried per line, as
   today, since each line reads only its own chain and ledger).

### 5.2 Order, locks and concurrency

- One transaction under `lockLedger`, as today; no new lock, no lock removed. The manual actions (`manual.ts`) take the
  same `ledger:` lock first, so they never interleave with a pass. The screens read committed rows only and see the
  pass whole or not at all.
- `ledger_entry.seq` (default `nextval`): the inserts are issued in today's order, so seq order is today's.
  `ledgerEntries` (`ORDER BY seq`) and `ledger_line_stage` (`max(seq)`) read the same.
- `ledger_match`: inserted in today's order (claims in line and chain order, then reversals, then WOs and L6s, then
  postings, then deposits). Today `ledgerMatches` orders by `matched_at, id`; after the interest fix by `seq`, which
  follows insertion: the same.
- The posted and deposited entries `settleMatches` writes follow `ledgerMatches`' order (`matched_at, id`); a pass's
  matches share one `matched_at` and their IDs are random, so that order differs between any two runs of today's code
  as well. It is unchanged (D6 keeps the loop's order); the probe and CAS-49 compare those entries as a set and check
  the rule on both sides.
- `line_status.seq`: the multi-row insert forms its rows in `n` order and draws each row's default `nextval` as it forms
  it, then runs its BEFORE triggers before forming the next; 1b's `line_status_rules()` draws its own `nextval` under the
  head row in the same interleaving. CAS-49.3 checks a line's payer approved then recovered in one statement under both
  bodies, and the probe compared `seq` values exactly (section 8.3).
- `case`: refreshed once per statement instead of once per event; the final row is the same (its state and totals are
  derived from the lines' latest events; `updated_at` and `closed_at` take `now()`, the transaction's time, either
  way). No trigger on `"case"` writes history or audit rows (`case_rules`, `case_updated_at`, `case_belongs`,
  `case_never_deleted` only), so the intermediate updates were not observable.
- The notification and audit rows are written by unchanged code in unchanged order.
- The pass returns no more PHI-bearing rows to the worker than today: every new statement is inside the practice
  scope and filters on `practice_id`; the patient search returns the union of the claims the per-line queries returned
  (each once); D15's reads return identifiers only, which today's anti-join read inside the server.

### 5.3 What a reader sees

Nothing. The pass writes the same rows; the summary counts (`RemittanceOutcome`, `StageSync`, `ReconcileSummary`) are
the same numbers; no screen, report, CSV, PDF, email or log line changes.

---

## 6. Every sentence a person reads

None changes. No message, label, note, email, notification text, error text, log line or document a person reads is
added, removed or reworded. The reopen notes (`REOPEN_NOTES`) are written by the same code into the same rows. No
ux-brand review is needed (LANES.md rule 1).

---

## 7. Tests

Every new test reads SYNTHETIC rows only (`packages/synth` twins, LED fixtures, or rows the test generates with
SYN-marked identifiers), logs no identifier, and runs in the `db` project unless marked unit.

### CAS-49: the pass writes what the per-line pass wrote

`apps/worker/src/reconcile/pass-equality.db.test.ts` (new), with `test-support/per-line.ts` (D13) as the reference.
1. **Generated passes, old against new.** A seeded generator (fast-check, fixed seeds in CI, 25 runs, 40 to 400 case
   lines each, two or three cases, two remittances to five) builds a practice's history and one pass of new evidence,
   covering together: corrections (superseded claims, chains of two and three), reversals with and without a
   correction in the same remittance, PLB WO recoupments, decreases taking an approval back, payer responses accepting
   an amount (confirmed, then paid), no-change reprocessings (the submission's response), lines matched by patient and
   by control number, a claim of the same code and date for another patient, a person's unmatch (never matched
   again), a written-off line and a closed case (not searched), claim-level and line-level postings, a partial
   check-level posting, EFT deposits alone and batched, patient share (claim-level PR), a recovered line moved back
   (reversal note and proof-level note) and a recoupment's reopen. Each case is built twice from the same template
   database (`CREATE DATABASE … TEMPLATE`), one pass run by today's step (the reference) and one by the new, and the
   test compares, with each row's new UUIDs replaced by their ordinal in insertion order: the ledger matches in
   insertion order; the ledger entries in `seq` order with their `seq` values, except the posted and deposited
   entries `settleMatches` writes, which follow the random match IDs and are compared as a set, with the rule that
   their `seq` order is `ledgerMatches`' order checked on both; the `line_status` rows in `seq` order with `seq`
   values; payer responses, submissions, notifications and audit events in insertion order; every case's state,
   totals, deadline and whether closed; and the summary counts. **Fails first** with D1 written without step 3 of 5.1
   (one round's patient read reused without taking off the known claims) and with D3 writing the events grouped by stage
   (every payer approved, then every recovered: the same rows, another `seq` order); both mutants are part of the test
   file's own self-check, run against a copy of the new code.
2. **LED fixtures.** For LED-01 to LED-18's own worlds (`ledger.db.test.ts`' `LedgerWorld`), the same comparison after
   each reconcile the LED test runs. LED-01 to LED-18 and `ledger-oracle.db.test.ts` themselves are unchanged and pass
   byte for byte.
3. **Stage events in one statement.** Under today's `line_status_rules()` and, in a database with 1b's section 5
   applied (the test applies it inside its own transaction when the base lacks it, and skips that half once 1b has
   merged and the base has it), one `insertStages` with a line's payer approved then recovered, and a recovered line's
   move back, writes both rows with ascending `seq`; reversed order is refused with today's message; another line's
   events between them change nothing. **Fails first** with the rows given out of order.

### CAS-50: a pass's statements and decrypts do not grow per line

`apps/worker/src/reconcile/pass-bounds.db.test.ts` (new). A step-7b-shaped practice at 200 and at 800 lines (LED-06's
SYNTHETIC segments, as CAS-42.3 seeds them), one pass each through `reconcilePractice` with a counting proxy over the
scope's client (the probe's method) and a counting wrapper over `PracticeCipher.decrypt`:
- the candidate statements (`controlCandidates`, `patientCandidates` and its `loadedAt` read) and `claimLines` calls
  are at most `2 + 2 × rounds` and do not change between 200 and 800 lines;
- `line_status` inserts: exactly one statement;
- decrypts of `claim.patient_control_number`: at most one per claim of the practice per pass phase (the search, the
  postings), plus `caseLines`' one per case line;
- the posting and EFT rows never matched: three statements each, whatever the size (D15);
- `insertMatch` and `insertEntry` are exactly as many as today's; the claims of a remittance are read once per
  remittance (D7), and the other per-row posting reads (`remittancesOf`, the named claim's lines) are as many as today's.
**Fails first** on the base: 2 candidate statements and 2 `claimLines` calls per line, 2 stage inserts per line, and
31 decrypts per line in the search.

### CAS-51: a real-size pass

`apps/worker/src/reconcile/pass.large.db.test.ts` (new): the step-7b shape (CAS-42.3's seeding, approvals and postings
in one pass) at `TP_LARGE_RECONCILE_LINES` (default 2,000), in the CI `db` shard, timed, with the advisory-lock sampler:
- the pass completes, writes N approved and N posted entries and 2N stage events, and every line reaches recovered;
- the pass's time stays under `PASS_BUDGET_MS`, and its own part (the pass less its ledger_entry insert statements,
  which the test's statement proxy times) under `OWN_BUDGET_MS` (section 8.4); the own part's time per line at N is
  at most 1.5 times its time per line at N/4 (both measured in the same test), so a per-line query returning fails it
  without a slow runner flaking it, while the ledger triggers' growth (Lane A's, 14.1) cannot;
- peak heap under 75% of the worker's limit.
The weekly release-capacity run (1b's step 7b) is its full-size form. **Fails first** on the base: its own part took 156.9 s at 2,000 in state (c)
against a 40 s budget, and its per-line time grew 2.3 times between 2,000 and 6,000 (measured; the ratio between 500 and
2,000 is the test's own).

### Tests updated, not added
None: `ledger.db.test.ts`, `chain.db.test.ts`, `payment-terms.db.test.ts`, `ledger-oracle.db.test.ts`,
`lines.db.test.ts`, the export tests and the report's tests (CAS-41's `streamed.db.test.ts` among them) pass unchanged on
the candidate (section 15, probe T1).

### Test matrix rows (`docs/product/test-matrix.md`, after CAS-48; `packages/synth/src/cases/matrix.ts` word for word)

| ID | Title | Expected |
| --- | --- | --- |
| CAS-49 | A reconcile pass writes what the per-line pass wrote | On generated passes with corrections, reversals, recoupments, payer responses, partial postings, EFT deposits, patient share and reopens, and on LED-01 to LED-18's worlds, the pass writes the same ledger matches, entries, stage events, payer responses, notifications and audit events, in the same order where order is observable, as the per-line pass; a line's payer approved and recovered written in one statement keep their order and checks |
| CAS-50 | A reconcile pass's reads do not grow per line | Between 200 and 800 lines the pass's candidate searches and claim-line reads stay a fixed number of statements, its stage events are one statement, and it decrypts each claim's patient control number at most once per phase |
| CAS-51 | A reconcile pass at real size | A step-7b pass of 2,000 lines (more on the weekly run) approves and posts every line within its time budget, its own part (the pass less the ledger's entry inserts) within its own budget and at most 1.5 times as slow a line at 2,000 as at 500, under 75% of the worker's heap |

`packages/synth/src/cases/registry.ts`, module 5 (CAS), no fixture files:
- `'CAS-49': none(8, 'Generated passes and LED worlds, compared with the per-line pass: no file.', ['apps/worker/src/reconcile/pass-equality.db.test.ts'])`;
- `'CAS-50': none(8, 'Generated at two sizes by the test: no file.', ['apps/worker/src/reconcile/pass-bounds.db.test.ts'])`;
- `'CAS-51': none(8, 'Generated at size by the test from LED-06\'s synthetic segments: no file.', ['apps/worker/src/reconcile/pass.large.db.test.ts'])`.

---

## 8. The measurement

### 8.1 Method

The probe of section 15 (SUITE-CAP-1a's method rebuilt): one reconcile pass through `reconcilePractice`, as the job
runs it, in a child process under `node --max-old-space-size=560 --expose-gc`; a proxy over the scope's client times
every statement by family; the heap sampled every 50 ms and at each statement; an advisory-lock monitor on its own
connection every 200 ms; `PracticeCipher`'s `decrypt` counted. Seeds: a database migrated from empty, SYNTHETIC release
900001, one practice, the original 835s through the parse job, a fixed-schedule contract signed off, priced and triaged
(all N lines actionable, one case per code, so a case holds N/5 lines), then step 7b's reprocessing 835s (each claim
reversed and corrected, checks of 20 claims) and the posting export (one line-level row per line). Spread R puts 20
claims on each date (16 share a code and date); spread A puts every line on 20 dates (N/100 per code and date).
States: (a) the base; (c) SUITE-CAP-1b's migration sections 3-6 applied by hand (its D15 among them); (m) state (c) plus
14.1's function. Shapes: 7b (approvals and postings in one pass) and P (a plain reconcile, the approvals, then the
export's reconcile, the postings). The base's 2,000-line runs were repeated in this session beside the candidate's
(`base2`), from the same seed templates, for the equality pairs; the base's 6,000 and 10,000 are the profile's.

### 8.2 What a CI shard can run

A `test:db` shard runs CAS-50 (two passes of 200 and 800 lines: seconds) and CAS-51 at its default 2,000 lines: the
candidate's step-7b pass takes 53-60 s on this 4-CPU container in either schema state, plus the setup (about 10 s of
seeding through the job code at 2,000), so CAS-51 fits a shard beside its other files. It does not need the 8-CPU
runner. 6,000 and 10,000 are for the weekly run (`TP_LARGE_RECONCILE_LINES`).

### 8.3 Before and after (seconds; 4 CPUs; spread R unless marked)

**Step 7b (approvals and postings in one pass):**

| N | state | base | candidate | candidate, pass less its ledger_entry inserts | + Lane A's 14.1 (m) |
| ---: | --- | ---: | ---: | ---: | ---: |
| 2,000 | (a) | 262.5 (base2 223.1) | 59.6 | 15.0 | |
| 2,000 | (c) | 208.4 (base2 190.3) | 60.2 | 11.3 | 21.6 |
| 6,000 | (a) | 1,653.3 | 411.2 | 71.8 | |
| 6,000 | (c) | 1,486.4 | 378.3 | 30.8 | 101.2 |
| 10,000 | (a) | (not run; 53200 on a default cluster) | 1,141.8 | 163.0 | |
| 10,000 | (c) | 3,412.1 | 1,058.4 | 57.4 | 263.3 |
| 2,000 spread A | (c) | 183.6 (base2 196.8) | 53.2 | 11.4 | |
| 6,000 spread A | (c) | 1,501.6 | 421.6 | 37.5 | |

**Shape P (approvals pass, then postings pass):**

| N | state | base pre / P | candidate pre / P |
| ---: | --- | ---: | ---: |
| 2,000 | (a) | 179.2 / 52.2 (base2 154.3 / 54.4) | 12.1 / 13.3 |
| 2,000 | (c) | 136.5 / 66.4 (base2 118.9 / 40.8) | 7.8 / 9.8 |
| 6,000 | (a) | - / 264.7 | 68.2 / 71.0 |
| 6,000 | (c) | 924.0 in (b) / 265.1 | 25.3 / 31.1 |
| 10,000 | (a) | - | 157.8 / 132.4 |
| 10,000 | (c) | - | 55.5 / 48.2 |

**What moved (state (c), 7b, 2,000 → 10,000 lines):**

| | base | candidate |
| --- | ---: | ---: |
| statements in the pass | 32,035 → 160,035 | 14,070 → 70,170 (the per-line inserts and posting reads that remain) |
| candidate searches | 4,000 statements, 58.6 s → 713.7 s | 4 statements, 0.2 s → 1.4 s |
| `claimLines` | 4,002 calls, 44.6 s → 824.6 s | 4 calls, 0.2 s → 1.2 s |
| `line_status` inserts | 4,000 statements, 36.8 s → 754.8 s | 1 statement, 0.9 s → 4.8 s |
| `claim.patient_control_number` decrypts | 144,000 → 720,000 | 3,500 → 17,500 (each claim once in the search, once in the postings) |
| TypeScript between statements | 7.0 s → 45.7 s | 2.4 s → 12.3 s |
| peak heap (limit 560 MiB) | 99 → 172 MiB | 107 → 157 MiB |
| advisory locks per backend | 1 (1b) | 1 (1b); about 3 per line in state (a), as the base: 1b's |
| ledger_entry inserts (Lane A's) | 51.6 s → 1,025.6 s | 48.9 s → 1,001.1 s (unchanged: the same inserts) |

- The candidate's own part grows linearly: 5.7, 5.1 and 5.7 ms a line at 2,000, 6,000 and 10,000 (state (c)). Of the
  1,058.4 s at 10,000, 1,001.1 s are the ledger_entry inserts, which no worker change reaches (1.5, 14.1).
- On the adverse spread the patient search took 0.3 s at 2,000 and 1.5 s at 6,000 (the base: 33.1 and 312.3 s), with
  7,500 decrypts at 6,000 against the base's 900,000.
- In state (a) the candidate's own part is larger (163.0 s at 10,000 against 57.4 s): its four practice-wide
  `claimLines` calls took 105.4 s without `claim_by_superseded`. That is D15's share, measured: 1b's index is what
  keeps those calls linear (cited, not added).
- Every run wrote the same counts (N approved, N posted at 3,000 cents each, 4N stage events in all), and the seven
  equality pairs at 2,000 were identical row for row (section 15, T2).

### 8.4 Budgets

- **CAS-51 (new):** step 7b at 2,000 lines. `PASS_BUDGET_MS` 150,000 for the whole pass (2.5 times the 60 s measured,
  SUITE-CAP-1's rule; it holds the ledger triggers' 45-49 s until Lane A's 14.1 lands, and then drops to 60,000, 2.5
  times 21.6 s, in Lane A's PR). `OWN_BUDGET_MS` 40,000 for the pass less its ledger_entry insert statements (2.5 times
  the 15.0 s measured in state (a)), and the per-line ratio of that part between 500 and 2,000 lines at most 1.5 (the
  candidate's is about 1.0; the base's is 2.3 between 2,000 and 6,000 in state (c), 156.9 s → 1,083.0 s for a tripled
  size). The own-part checks are what fail first if a per-line query returns; the whole-pass budget catches a trigger
  regression.
- **CAS-42.3 (1b's, shape P at 2,000):** with this item its pass takes 9.8 s (c) and 13.3 s (a) here. Whichever of 1b
  and this item merges second sets its `PASS_BUDGET_MS` from 150,000 to 35,000 (2.5 times 13.3 s), keeps its default
  2,000 lines, and rewrites its comment's "grows faster than its lines" paragraph to cite this design (D14).
- **Step 7b of the weekly release-capacity run (1b's):** each job waits up to 45 minutes. Fitted `aN + bN²` over 2,000,
  6,000 and 10,000: the candidate in state (c) projects 4,149 s at 20,000 actionable lines and passes 45 minutes at
  about 16,100; with Lane A's 14.1 it projects 923 s at 20,000 and passes 45 minutes at about 35,300. The base projected
  11,967 s at 20,000. So step 7b at full size needs this item and 14.1 both, and its expectation (an attempt check
  within 45 minutes) is set by whichever of 1b, this item and Lane A's PR lands last, from the actionable-line count
  the scenario produces (`practiceClaims(100,000, …)`; to be read off the first weekly run).
- **Memory:** peak heap 157 MiB at 10,000 against 560 (28%); live heap after the pass 37 MiB, as the base.

---

## 9. Files

| File | Change |
| --- | --- |
| `apps/worker/src/reconcile/remittances.ts` | D1, D2, D5 (section 4) |
| `apps/worker/src/reconcile/stages.ts` | D3 |
| `apps/worker/src/reconcile/postings.ts` | D6, D7, D15 |
| `apps/worker/src/reconcile/test-support/per-line.ts` | new: today's per-line step, the CAS-49 reference |
| `apps/worker/src/reconcile/pass-equality.db.test.ts` | new: CAS-49 |
| `apps/worker/src/reconcile/pass-bounds.db.test.ts` | new: CAS-50 |
| `apps/worker/src/reconcile/pass.large.db.test.ts` | new: CAS-51 |
| `docs/adr/0087-…md` | new (D12) |
| `docs/product/test-matrix.md` | CAS-49 to CAS-51 rows (shared document; LANES.md rule 6) |
| `packages/synth/src/cases/matrix.ts`, `registry.ts` | the same rows word for word; three `none(…)` entries |
| `tools/screening-capacity/watched-paths.txt` | regenerated only if `watched.ts --write` changes it |
| `fixtures/synthetic/**` | regenerated by `pnpm synth --all` only if the registry change requires it (no files are added) |

Not touched: `packages/ledger/src/**`, `packages/db/**` (no migration, no function file), `pass.ts`, `ledger.ts`,
`manual.ts`, `patient-share.ts`, the report, the web app, #42's freeze list (`runtime.ts`, `config.ts`,
`jobs/platform.ts`, `tools/screening-capacity/{run,report}.ts`), 1b's files.

---

## 10. Risks

| Risk | Guard |
| --- | --- |
| A filter of the pass-level search drifts from the per-line definition (a written-off line searched, a reversed unmatch matched again, a same-remittance claim taken). | CAS-49's generated passes cover each filter; the per-line reference is kept (D13); ADR 0087 says a new filter goes in both. |
| The chain's claim order sorted in TypeScript differs from `ORDER BY` on a tie (same date, same microsecond). | The tie-break is the UUID, compared as lower-case text, which is PostgreSQL's byte order; CAS-49 generates claims loaded in the same transaction (one `created_at`). |
| The multi-row stage insert reorders rows. | `ORDER BY e.n` over `WITH ORDINALITY`; the `seq` values were compared exactly against the base's (section 8.3); CAS-49.3. |
| One statement of a whole month's stage events is too big. | 20,000 rows at 10,000 lines took 4.8 s and the pass's peak heap stayed at 157 MiB (section 8.3); arrays are four parameters; no limit is near at 100,000. Chunking is the fallback (2.3 C). |
| The patient search's server-side join grows on an adverse spread (many lines on few dates). | Measured on spread A at 2,000 and 6,000 (section 8.3); it is a hash join on code and date, inside one statement, and no decrypt grows with it. A patient-control-number equality hash would remove it (section 14.3), not needed at the measured sizes. |
| Memory: the pass's claim-line map and candidate lists live for the pass. | Peak heap measured at each size (section 8.3), under 75% of 560 MiB at 10,000; CAS-51 asserts it. |
| The interest fix lands first and its `seq` order exposes an order difference. | The insert order is today's (5.2); whoever merges second re-runs CAS-49 with LED-23 to LED-25 (section 12). |
| The ledger triggers' part keeps a first large pass slow until Lane A acts. | Measured and handed on with its DDL (14.1); the budgets in 8.4 say which part is whose. |

---

## 11. The builders' slices, in order

1. `test-support/per-line.ts` (today's text moved) and CAS-49's harness against it, green on the base code (the new
   code still the old).
2. D3 (`insertStages`) with CAS-49.3; CAS-49 green.
3. D1 and D2 (`passCandidates`, the claim-line map, `reprocessingOf`'s argument); CAS-49 and LED-01 to LED-18 green.
4. D5 to D7; CAS-49, CAS-41 (`streamed.db.test.ts`) and the report's tests green.
5. CAS-50 and CAS-51; the matrix rows and the registry; `pnpm synth --all` if needed; ADR 0087.
6. The full local suite (the item prompt's list), then the draft PR; the payment-engine review, then the security
   review (tenancy, PHI reads, decrypt counts, logs, with SUITE-CAP-1a's concurrency-and-capacity lens).

---

## 12. Merge interplay

### With SUITE-CAP-1b (`co-001/suite-cap-1-triage-locks`, 358dc53f)
- In `reconcile/` 1b only adds `reconcile.large.db.test.ts` and `stage-head.db.test.ts`; no textual conflict.
- 1b's section 5 replaces `line_status_rules()`; D3's multi-row insert was measured under it (state (c)) and CAS-49.3
  covers both bodies.
- Whichever lands second resets CAS-42.3's `PASS_BUDGET_MS` and default size and step 7b's expectation (D14, 8.4), and
  adds `pass.large` to `vitest.config.ts`' SLOW_FIRST and `tools/test/db-shards.test.ts` if 1b's deferred CAS-42.1/.2
  work has put `reconcile.large` there.
- Shared documents (test-matrix, `matrix.ts`, `registry.ts`): keep both sides' rows, then `pnpm synth --all`.

### With the interest fix (`co-001/ledger-interest-once`, e0646746)
- Its `remittances.ts` hunks (imports, `RemittanceOutcome`, `ChainContext`'s doc and `CHAIN_ORDER`, `Counts`,
  `recoupReversals`, `providerAdjustments`, `recordInterest`, `claimInterest` removed, `hashesOf`,
  `reconcileRemittances`) and this item's (`candidatesFor`'s place, `reprocessingOf`, `lineChain`'s one line,
  `matchClaims` to `matchCandidate`) do not overlap; a three-way merge is expected clean and is checked by the second.
- `claimLines`' SQL is unchanged, so `CLAIM_LINES` in its `chain.large.db.test.ts` stays word for word.
- Its `ledgerMatches` and `CHAIN_ORDER` order by `ledger_match.seq`, which follows insertion; this item inserts in
  today's order, so the chain order is the same.
- Its `interestState` adds one practice-wide `ledgerEntries` read and its `recordInterest` an O(D·C·M) loop when PLB L6s
  exist; neither is touched here (proposal in 14.4).
- **If this item lands first:** the interest fix's merge keeps its interest path and re-runs its equality proof with
  LED-23 to LED-25; nothing of this item's needs changing.
- **If the interest fix lands first:** this item merges it in, keeps `interest-chains.ts` untouched, adds LED-23 to
  LED-25's worlds to CAS-49.2 and compares `ledger_match` by `seq` (values and order) instead of insertion order, and
  re-runs CAS-49 and the probe's 2,000-line equality.
- Its `ledger_entry_within_interest` trigger returns before any query for a non-interest entry, so it adds no growth
  term to section 1.5 (the profile's reading of its migration).

### Shared code (the report path)
`claimLines` and `chainContext` are unchanged; `lineChain`'s answer is unchanged (D5). CAS-41 (`streamed.db.test.ts`,
the whole read against the batched report) and the report's tests passed on the candidate (probe T1) and are in the
build's suite.

---

## 13. ADR

ADR 0087 is needed (D12): the rule "a reconcile pass reads per pass, never per open line, and writes in the order the
rules define" binds every later change to the matching step, and CAS-50 enforces it. Title: "Reconcile a practice with
reads per pass, never per open line, writing in the rules' order".

---

## 14. Handed on, and kept out (each with why)

### 14.1 For Lane A (needs a founder freeze exception: it changes a ledger table or function)

**What:** the ledger_entry triggers' per-line sums. `ledger_entry_within_line()` calls `ledger_line_net(line, …)` three
times per approved, posted or deposited entry; its body LEFT JOINs `ledger_entry` twice on conditions that only apply
to reversals and adjustments (`e.stage IN ('reversed', 'adjusted') AND t.id = e.evidence_id`), which the planner can
only use as join filters. Planned on a ledger without statistics (a fresh deployment, a first large practice, and
always within the pass's own transaction, whose rows `ANALYZE` cannot see), each join is a sequential scan of the
practice's whole ledger per call (auto_explain: `Seq Scan on ledger_entry t … rows=3995.00 loops=1` twice per call,
12.8 ms a call at 2,000 lines; `cap3-results/diag/cap3_r_2000_c_diag.plans.txt`). After this item's worker fix it is
90-95% of a step-7b pass.

**Recommended DDL (a new migration; a ledger function, so it needs a founder freeze exception):**

```sql
CREATE OR REPLACE FUNCTION public.ledger_line_net(line uuid, counted text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(sum(e.amount_cents), 0)::bigint
    FROM ledger_entry e
   WHERE e.service_line_id = line
     AND CASE WHEN e.stage IN ('reversed', 'adjusted')
              THEN (SELECT CASE WHEN t.stage = 'adjusted' THEN (SELECT r.stage FROM ledger_entry r WHERE r.id = t.evidence_id) ELSE t.stage END
                      FROM ledger_entry t WHERE t.id = e.evidence_id)
              ELSE e.stage END = counted
$function$;
```

The same answer for every line and stage: a reversal or adjustment counts as the stage of the entry it finally
corrects (its target, or the target's target when the target is an adjustment), and one whose target is missing counts
as none, exactly as the two LEFT JOINs gave (each target is unique by its primary key). Ownership, grants and
`SECURITY` are kept by `CREATE OR REPLACE`. `ledger_line_stage()` has the same two joins
(`ledger_line_stage.sql:15-16`) and takes the same rewrite in the same migration (proposal 14.4, item 7); its cost
after D3 is 1-5 s a pass, so it was not measured apart.

**Measured gain** (state (m): state (c) plus this function, applied by hand in the probe's copy; the worker fix in
place; step 7b, spread R):

| N | worker fix, state (c) | + this function, state (m) | ledger_entry inserts (c) → (m) |
| ---: | ---: | ---: | ---: |
| 2,000 | 60.2 s | 21.6 s | 48.9 → 11.5 s |
| 6,000 | 378.3 s | 101.2 s | 347.5 → 71.4 s |
| 10,000 | 1,058.4 s | 263.3 s | 1,001.1 → 206.7 s |

The writes were identical to the base's at 2,000 (dump compared row for row, `seq` values included). What remains of
the inserts (206.7 s at 10,000, 10.3 ms an entry; 2.9 ms at 2,000) still grows: the `e.service_line_id = line` scan and
`within_evidence`'s sums are sequential on an unanalyzed ledger. They are linear per call and small next to the joins;
a later look, with the `fillx` control (populated ledger) as the measure, is Lane A's.

**Measured and rejected:** `CREATE INDEX ledger_entry_by_service_line ON ledger_entry (service_line_id, stage);`
(state (l)): no gain (55.7 s against 53.7 s at 2,000, inserts 44.0 against 42.6 s), because the cost is the two joins,
not the line's own scan, and a planner that sees an empty ledger keeps its sequential scans anyway. Adding
`practice_id` to `ledger_line_net`'s predicate (so `ledger_entry_by_line` leads) would not reach the joins either (by the same reading of the plan; not measured).

**Also for Lane A (no freeze exception; measured in section 1.4):** nothing beyond 1b's D15, which this item cites.

**Also for Lane A, measured upper bound only:** the populated-ledger control (`fillx`) bounds what any trigger change
can give on a running multi-tenant deployment: 47.6 → 6.6 s at 2,000, 382.1 → 48.7 s at 6,000 for the base's
inserts.

### 14.2 Kept out of this item
- **The three practice-wide `claimLines` calls per pass (`chainContext` at :707, :806 and `shares`).** Linear with D15;
  in state (a) each is 1.4 s at 2,000 and 10.4 s at 6,000 (quadratic without the index). D15 is 1b's.
- **`manualRecoupments` (`stages.ts:149`, `pass.ts:46-48`):** three statements per manual recouped entry ever written,
  every pass, growing with history. Skipping entries already notified would change who is told when a person joins
  later (the `ON CONFLICT` is per user), a behaviour change; a proposal for the notifications' owner.
- **`namedLines` (O(PA·C·M)) and `recordInterest`:** inside the interest fix's hunks; changing them now would fight it.
  After it merges, an index of approving matches by line removes the loop (proposal 14.4).
- **`approveFromResponses`' `rows.some` (`responses.ts:57`), O(RL·C):** small at measured sizes; a `Set` keyed by case
  and line is a one-line follow-up (proposal 14.4).
- **The manual actions' practice-wide work per click** (`matchClaimByHand` decrypts every case line through
  `caseLines` to find one; every manual `finish()` runs `syncLineStages` over every line with entries): not the pass;
  proposal 14.4.
- **The web's Reconciliation page and `unmatchedItems`** (three `claimLines` calls and two practice-wide chain reads per
  view; `unmatched.ts:187`'s `EXISTS` on `superseded_by_claim_id`, O(K²) without D15, then two queries per unmatched
  claim): reads, not the pass; proposal 14.4.

### 14.3 Considered and not needed
- A patient-control-number equality hash on `claim` (a remittance-table column; no freeze exception, but a
  migration): the pass-level search decrypts each claim once and its statement took 0.2 s at 2,000, 0.9 s at 10,000 (spread R) and 1.5 s at 6,000 on the adverse spread; not
  needed now.

### 14.4 Proposals found outside the item
Each is outside SUITE-CAP-3's claim; the orchestrator decides where it goes.
1. **The manual actions' practice-wide work per click** (`manual.ts`): `matchClaimByHand` reads and decrypts every
   case line of the practice (`caseLines`) to find one, then the practice's matches, entries and `chainContext`; every
   action's `finish()` runs `settleMatches` and `syncLineStages` over every line with entries. A `caseLines` by line ID
   and a stage sync of the lines the action touched would make a click O(1) in the practice's size. Lane B, after this
   item (it reuses D3's `insertStages`).
2. **The Reconciliation page and the dashboard's reads**: `approvalShortfalls` plus `lineCorrections`
   (`apps/web/src/lib/reconciliation/queries.ts:488-490`) run three `claimLines` calls and two practice-wide chain reads
   per view; `unmatchedItems` (`unmatched.ts:187`) uses `EXISTS (… o.superseded_by_claim_id = c.id)` (O(K²) without
   D15) and two statements per unmatched claim. Lane B, a reads item measured like this one.
3. **`manualRecoupments`** (`stages.ts:149`, `pass.ts:46-48`): three statements per manual recouped entry ever
   written, on every pass. A per-entry "told" marker (or reading only entries newer than the practice's last notice)
   needs a decision on who is told when a person joins later. The notifications' owner.
4. **`approveFromResponses`** (`responses.ts:57`): `rows.some` per response line, O(RL·C); a `Set` of `case line`
   keys. One line; Lane B, with the next change to that file.
5. **After the interest fix merges**: `namedLines` (O(PA·C·M)) and `recordInterest`'s `lines.flatMap(matches.filter)`
   (O(D·C·M), only with PLB L6s) can read D5's per-line index; `interestState`'s extra `ledgerEntries` read can take the
   pass's entries. Whoever touches `providerAdjustments` next.
6. **The three practice-wide `claimLines` calls per pass** (`chainContext` at :707 and :806, `shares` at
   `postings.ts:252`) could share the pass's claim-line map (D2) instead of re-reading; measured at 0.2-0.7 s at 6,000
   with D15, so not worth touching shared code now; worth it if a later profile shows them.
7. **`ledger_line_stage`** has the same two whole-ledger LEFT JOINs as `ledger_line_net` (`ledger_line_stage.sql`
   :15-16); it runs once per stage event (`line_status_ledger_rules`) and once per line in `syncLineStages`' read. With
   D3 its cost was 0.9-2.9 s a pass, so it is listed with 14.1's rewrite for Lane A to do together, not measured apart.
8. **The probe's `fillx` control should become a CAS-42 variant**: a seeded database's ledger is empty, so every
   real-size test measures the trigger plans of an empty ledger; a variant with another tenant's committed ledger rows
   would measure what production sees. Lane A, with 14.1.

---

## 15. Probes run for this design

All on SYNTHETIC rows; scripts and results in the session scratchpad
(`/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad`): `cap3-probe/` (scripts and
README), `cap3-results/` (the profile), `cap3-results-base2/` (the base, re-run for the equality pairs),
`cap3-results-try/` (the candidate), `cap3-results-seeds/`, `cap3-try/` (the candidate's scratch clone of 83d71fd6;
`cap3-src/cap3-try.diff` is its diff), `progress/cap3-*.md` (the run logs). Nothing tracked was changed, committed or
pushed; the private cluster `/tmp/laneb-suitecap3-pg-2` (port 5494) was removed at the end.

| Probe | What | Result |
| --- | --- | --- |
| P0 | The profile (the scout phase): the base in states (a), (b), (c), shapes 7b and P, 2,000 / 6,000 / 10,000 lines, spreads R and A, the `statsx` and `fillx` controls, auto_explain of the trigger bodies | Sections 1.2-1.5 (`cap3-results/profile.md`) |
| T1 | The candidate's tests: `vitest --project db` on `apps/worker/src/reconcile` and `apps/worker/src/report` (chain, exports, ledger-oracle, ledger (LED-01 to LED-18), lines, payment-terms, settings, vendor-exports, report, streamed (CAS-41), report-ledger, documents, unattested-report), on the shared PG18 cluster; `--project unit` on `reconcile` and `packages/ledger`; `tsc --noEmit` and eslint on the worker | 13 files, 175 tests pass; 16 files, 239 unit tests pass; typecheck and lint clean (both before and after D15) |
| T2 | Equality: the base and the candidate from the same seed template, each pass's writes dumped (`dump.py`: ledger matches in insertion order, entries and stage events in `seq` order with their `seq` values, payer responses, submissions, notifications, audit events, source documents, posting rows, cases; new UUIDs by ordinal; ciphertext as set or not; timestamps out; settle's posted entries as a set, with their order rule checked on both) and compared (`compare.py`) | Identical in all seven pairs at 2,000: step 7b in states (a) and (c), spread R; step 7b in state (c), spread A; shape P's approvals pass and postings pass in states (a) and (c) (20,635 rows a 7b or P database, 12,634 after the approvals pass: 4,000 matches, 4,000 entries, 8,000 stage events with identical `seq` values). State (m) (14.1) identical to the base's (c). These shapes exercise corrections, reversals beside their correction, approvals, line-level postings and stages; reversals alone, WOs, payer responses, deposits, partial postings, patient share and reopens are covered by T1's LED-01 to LED-18 and oracle runs and by CAS-49's generated passes in the build |
| T3 | The candidate's sizes: 2,000 / 6,000 / 10,000 lines, states (a) and (c), shapes 7b and P, spread R; spread A at 2,000 and 6,000 | Section 8.3 |
| T4 | Lane A candidates on top of the candidate: (l) an index on `ledger_entry (service_line_id, stage)`; (m) `ledger_line_net` rewritten | Section 14.1: (l) no gain; (m) 1,058.4 → 263.3 s at 10,000, writes identical at 2,000 |
| T5 | Plans: the trigger bodies under auto_explain (P0's), read for 1.5 and 14.1 | `ledger_line_net`'s two whole-ledger joins per call |

Dropped, with why: the base at 6,000 and 10,000 was not re-run for the equality pairs (1,500 to 3,400 s a run; the
2,000-line pairs in both states and shapes, CAS-49's design and LED-01 to LED-18 cover the equality, and the profile
holds the base's times); 20,000 lines (projected, section 8.4); state (b) for the candidate ((a) and (c) bracket it,
and D15's effect is measured in (a) against (c)); state (l) at 6,000 and 10,000 (no gain at 2,000).
