# SUITE-CAP-3: a reconcile pass at real size (no migration)

Design contract, written 2026-11-02 against `claude/build-platform` at 83d71fd6; **updated for the review 2026-11-06
against `claude/build-platform` at cc3dd7f6**, where SUITE-CAP-1b has merged (#110, f7d609cc: `claim_by_superseded`,
`line_status_head`, the practice ledger lock, the worker pool resize, `reconcile.large.db.test.ts` (CAS-42.3) and
`stage-head.db.test.ts`; the loader fix 978891a3 is also on the base). The design's "state (c)" (1b applied by hand) is
now simply the base. `remittances.ts`, `stages.ts` and `postings.ts` did not change on the base since 83d71fd6.
**Revised after the design review, 2026-11-06 (section 16):** both reviews returned no report; their recorded draft
findings were checked against the candidate and by probe, and four are taken (D15's form, D11's scope, CAS-49's
comparison of settle's partial postings, CAS-50's array bound), one is already in the design. **Completeness check,
2026-11-06 (section 17):** gaps closed in the tests, the slices, the #126 interplay and the sizes; the hand-off to Lane
A re-measured on F (the review's `ledger_line_net` form gave nothing there; a corrected form with `ledger_entry_rules`'
lookup takes A's month from 1,653 to 310 s, writes identical), and the freeze-exception ask rewritten to match. **Review rounds 1-4 (section 18) and completeness check 2
(section 19, 2026-11-07):** the founder's grant and the D14 ruling recorded from the status file; section 0, D16's
fallback, CAS-50's bound, 8.2 and the slices made consistent.
- Candidate code (the design's probe, not the build): WIP ref `co-001/wip-suite-cap-3`, head **0b6e90eb** (a merge of
  the 83d71fd6 candidate 956b32ef with cc3dd7f6; clean, no fixes; against the base it differs only in `postings.ts`,
  `remittances.ts` and `stages.ts`, +333 −105). On 0b6e90eb: worker typecheck and eslint clean; unit 243/243 (17 files);
  db 179/179 (16 files: LED-01 to LED-18, the ledger oracle, CAS-41, 1b's CAS-42.3 and `stage-head`).
- The interest fix is draft PR #126 (`co-001/ledger-interest-once`, head **c49367c5**, Lane A's schema work with
  migration 20261110090000); read, not checked out; it merges on its own schedule (section 12.2).
- Worktree `/home/user/suite-cap-3-reconcile`, branch `co-001/suite-cap-3-reconcile` (still at 83d71fd6, no commits;
  the build merges cc3dd7f6 first). Claim: LANES.md (line 211 at the 2026-11-06 check). Item prompt:
  `lanes/lane-b-item-prompts-2026-11-01/suite-cap-3.md`. Finding: `approval-summaries/lane-a-schema-chain-status.md`
  lines 86-93; 1b's hand-off `approval-summaries/lane-a-to-lane-b-sc1b-reconcile-time-2026-11-05.md` (section 1.7). Run
  by the item session under Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW), from 2026-11-01.

**How to read the figures.** The 83d71fd6 figures (sections 1.2-1.5, 8.3, 14.1's table; states (a), (b), (c), (m)) are
kept as the design's history. The figures measured on cc3dd7f6 for this review (base against the candidate 0b6e90eb;
1b's practice F, spreads R and A, and A's full month) are in section 1.7 and 8.3a and stand beside them; where they
differ, the cc3dd7f6 figures decide (8.4's budgets are set from them).

Reserved and used: test-matrix CAS-49 to CAS-51; `packages/synth` cases CAS-49 to CAS-51 (module 5, the CAS module; no
fixture files); ADR 0087 (section 3, D12: the design makes one decision of lasting kind). No migration, index, table or
fixture release. Nothing under `packages/ledger/src` changes. No sentence a person reads changes, except the weekly
run's Known gap line, a line of an operators' capacity summary (D14, section 6).

Every number below was measured on SYNTHETIC rows only (this item's probe, `cap3-probe/`, rebuilt from SUITE-CAP-1a's
method; section 15), on a private PostgreSQL 18 cluster (port 5494, `max_locks_per_transaction` 4096, outside
`/tmp/claude-0`, removed at the end), 4 CPUs, the pass in a child process under `node --max-old-space-size=560`. The
cc3dd7f6 re-measure (section 1.7, 8.3a) used the same cluster settings plus `pg_stat_statements` and autovacuum off,
each pass on a fresh TEMPLATE copy; the worker was not held to the 0.5 vCPU that `run.ts` gives it (the pass is
database-bound: 2-8 s of TypeScript between statements in a pass).

---

## 0. In fourteen lines

1. On the base a step-7b pass (an 835 reprocessing every actionable line plus a posting export, approved and posted in
   one pass) grows close to N squared. At 83d71fd6: 262.5 s at 2,000 lines, 1,653.3 s at 6,000; with 1b's migration
   208.4 s, 1,486.4 s, and 3,412.1 s at 10,000. On cc3dd7f6 (1b merged), 1b's own step-7b practice F (one case of
   2,000 lines) takes **620 s, 69% of the reconcile job's 900 s attempt** (1b measured 526-731 s), spread R 159 s.
2. Every statement family's call count is linear; the time per call grows. Four families do it: the per-line candidate
   queries (`candidatesFor`, two per open line per round), the per-candidate `claimLines` reads (two per line), the
   one-row stage inserts that each refresh the whole case (`syncLineStages`), and the ledger_entry triggers. On F the
   first is 1b's finding: `byPatient`'s correlated `NOT EXISTS` on `ledger_match` (422 s at 138.7 M buffer hits), and
   the third is the per-event case refresh (79 s for one 2,000-line case).
3. The first three are orchestration, in the worker. The fix keeps every rule, filter, comparison and write, and the
   order of every write, and changes only how often the pass reads: every open line's candidates found in one search
   for the pass (one statement per round by control number, two per pass by patient, each claim decrypted once), each
   claim's lines read once, and the pass's stage events written in one statement in today's order (D1-D4).
4. The `ledger_match` exclusion ("never claim-matched to this line") is taken from the pass's own set of claim matches,
   read before any write, never as a predicate on `ledger_match` (D16, 1b's ask): its cost cannot depend on that table's
   statistics. The control search drops matched pairs in TypeScript; the patient search excludes them inside its two
   statements ((a) and `patientPairs`, review round 3) against parameter arrays, so it decrypts no claim today's queries did not. The TypeScript form measured the
   same time and writes as the candidate's SQL form; the array form is a build gate, and its fallback is the candidate's
   correlated `NOT EXISTS` once per pass, never a TypeScript-only patient exclusion (that would widen decrypts; review
   round 1, section 18).
5. Three small quadratic loops in TypeScript and one quadratic read of the export's rows go the same way (D5-D7,
   D15; D15 reads the never-matched rows with a server-side `EXCEPT`, so the worker never holds the practice's history
   of row IDs, section 16).
6. Measured on cc3dd7f6, base against the candidate (section 1.7, 8.3a): F 620 → 21.5 s (2.4% of the attempt);
   F without the other tenants 179 → 21 s; spread R 159 → 46 s; spread A 165 → 47 s. On F the case refresh goes from
   4,000 statements (79 s) to one (0.7 s), D3. Decrypts on F 89,136 → 5,680. The writes equal the base's row for row in
   every pair compared, the recovered totals equal.
7. The fourth family (the ledger_entry triggers) is in the database and frozen: handed to Lane A with its DDL and its measured gain (section 14.1), behind #126, under a founder freeze exception (the ask:
   `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`; **granted 2026-11-06 22:40 UTC** on the ask's
   pre-review text, as the item's status file records; the two bodies are unchanged since, completeness check 2). At A's full month (30,795 lines in one case) the
   candidate's pass takes 1,653 s, of which 1,469 s are those triggers: `ledger_line_net` 716 s and, new in this review,
   `ledger_entry_rules`' match lookup 581 s. The candidate's own part is linear, 5.6-6.0 ms a line. **Completeness
   check:** the review's `ledger_line_net` form gave no gain on F; a corrected form (the line's entries read through
   `ledger_entry_by_line`) with the lookup by primary key, both with exact DDL in 14.1, measured F 219.1 → 84.9 s at
   10,000 and **1,653.1 → 309.9 s at A's month (34% of the attempt)**, writes identical.
8. **This item needs no index, no table and no migration** (D9, section 14.0). `claim_by_superseded` is 1b's D15, now
   on the base.
9. No lock added or removed, no transaction or write-order change: the pass stays one transaction under `lockLedger`,
   and every insert happens in today's order (the one stage statement takes its row locks in another order, every event
   line's head then the cases, which D3's savepoint retry absorbs; D4, 5.2, review round 1), so `ledger_entry.seq`, `line_status.seq` and (after #126) `ledger_match.seq` draw the same order.
10. Shared code: `claimLines`' SQL is unchanged word for word (#126's `CLAIM_LINES` copy stays valid, checked on
    c49367c5); `chainContext` is unchanged; `lineChain` and `reprocessingOf` keep their answers, so the report path is
    re-proved by CAS-41 and the manual actions by LED-01 to LED-18.
11. Tests: CAS-49 (the same writes as today's code on generated passes), CAS-50 (the pass's statements and decrypts do
    not grow per line, and no candidate statement reads `ledger_match`), CAS-51 (a real-size pass within its budget).
12. D14, now this item's since 1b has landed: it resets CAS-42.3's `PASS_BUDGET_MS` (150,000 → 60,000, default 2,000
    lines kept) and step 7b's expectation (F at 10,000 lines, attempt 1 within 360 s, a sizing bound no check enforces: the weekly run fails only on a second
    attempt at 900 s; measured 220 s). It does **not**
    move step 7b back to A's full month: measured, that pass is 1,653 s, 184% of the attempt, held by Lane A's two
    trigger fixes (with both, measured in the completeness check: 310 s, inside the 360 s bound). The Known gap line
    stays, reworded to that figure; the move back becomes the acceptance step of Lane A's trigger PR (section 8.4; a deviation from 1b's hand-off and ADR 0083, put to the orchestrator). **Ruling (completeness check 2):**
    the item's status file records the orchestrator's ruling of 2026-11-06 22:31 UTC accepting this split (step 7b moves
    back to A's month once Lane A's two trigger fixes merge); it predates the review rounds, which changed none of D14's
    figures, so it needs only the orchestrator's confirmation when the reviewed design is committed (8.4).
13. Merge: no function is changed by both this item and #126; a three-way merge of 0b6e90eb with c49367c5 is clean and
    typechecks. Whichever merges second re-runs CAS-49 (with LED-23 to LED-25 and the `seq` order if #126 is first),
    section 12.2.
14. Not in this item, with why: section 14.

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

### 1.7 On cc3dd7f6: SUITE-CAP-1b's practice F, and what 1b's hand-off asks (review re-measure, 2026-11-06)

1b's CAS-42.5 found step 7b's practice F (harness `tools/release-capacity`: 2,000 actionable lines in **one** case, 560
reprocessed claims of 1,680, one posting export, approvals and postings in one pass) taking 526-731 s of the reconcile
job's 900 s attempt (hand-off and full record: `approval-summaries/lane-a-to-lane-b-sc1b-reconcile-time-2026-11-05.md`,
`approval-summaries/lane-a-wip/sc1b-pool/reconcile-time-record.md`). Its profile: `byPatient` ~403 s, because its
correlated `NOT EXISTS (… ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.service_line_id = $5)` is
planned on a `ledger_match` never analyzed, whose every row is the pass's own uncommitted write, so each call re-reads
every match the pass has written: O(lines × claims × matches); and the per-event case refresh 90-115 s
(`case_rules()` re-counting all 2,000 lines of F's one case for each of 4,000 stage events). It asks three things of
this item: D1 written so the exclusion's cost cannot depend on `ledger_match`'s statistics; D3 removing the case-refresh
family; D14's reset by whichever lands second (1b has landed, so this item).

Re-measured here (`cap3-probe/seedF.mts`: the scenario's own `reconcileClaims`, `FIXED_RATE` and `reprocessing()`;
statistics as the harness leaves them, the ledger tables never analyzed; the other tenants' claims (A, D, E 100,000
lines each, B 20,000) inserted, because without them `byPatient` never takes 1b's plan; results
`cap3-results-rev/summary.md`):

| shape | base r1 / r2 s (% of 900 s) | candidate r1 / r2 s (%) | `byPatient` base → cand | `byControl` | `claimLines` | `line_status` insert + case refresh | ledger_entry inserts (`ledger_line_net`) | decrypts | heap peak MiB |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
| F, other tenants present | 619.8 / 620.2 (69%) | 21.8 / 21.3 (2.4%) | 422.4 s, 4,000 calls, 138.7 M hits → 0.1 s, 1 call | 75.8 → 0.3 s (2 calls) | 7.9 → 0.2 s | 84.8 s (UPDATE `"case"` ×4,000 78.5 s; `case_rules` 76.2 s) → 0.7 s (1 INSERT, 1 UPDATE 24 ms, 1 `case_rules` 21 ms) | 11.2 (3.4) → 10.3 (3.3) | 89,136 → 5,680 | 102 → 113 |
| F alone | 179.1 / 179.8 | 20.6 / 21.2 | 17.2 (8.2 M hits) → 0.05 | 11.3 → 0.1 | 39.1 → 0.2 | 84.8 → 0.7 | 10.7 → 10.0 | same | same |
| R (realistic spread) | 158.7 / 159.2 (18%) | 46.0 / 45.2 (5.1%) | 22.7 → 0.2 | 22.4 → 0.1 | 32.1 → 0.2 | 29.4 → 0.8 | 35.9 (27.3) → 34.8 (26.8) | 146,000 → 5,500 | 105 → 103 |
| A (adverse spread, one run each) | 164.9 | 46.6 | 27.9 → 0.2 | 22.1 → 0.1 | 31.7 → 0.2 | 30.0 → 0.8 | 35.5 → 35.1 | 182,000 → 5,500 | 103 → 106 |

- Base F at 620 s is inside 1b's local 538-731 s, with `byPatient` 422 s at 138.7 M hits (1b: 403 s at 137.2 M) and
  the case refresh 79 s (1b: 84-90 s): 1b's finding is reproduced. Every run peaked at one advisory lock per backend.
- **D3 on F, confirmed:** one `INSERT INTO line_status` of 4,000 rows (0.7 s), one UPDATE of F's case (24 ms) and one
  `case_rules` call (21 ms), against 4,000 of each (76-79 s).
- **D1's exclusion (D16):** the candidate at 0b6e90eb still wrote the exclusion as a correlated `NOT EXISTS` on
  `ledger_match`, inside its two pass-level statements (`remittances.ts` lines 231 and 280 at 0b6e90eb). Because each
  is now one statement per pass (per round), run before any of the pass's own writes, it costs nothing measurable
  today; but its plan would still depend on `ledger_match`'s statistics. The statistics-proof form (both SQL predicates
  dropped; the pass's `matched` set, read before any write, applied in TypeScript, as the patient search already did;
  `cap3-results-rev/d1-ts-exclusion.diff`, 51 lines, clone `cap3-d1`; a measured reference, not a patch: its patient hunk
  is the TypeScript-only patient exclusion D16 rejects, so the build takes only its control-search hunk, section 4,
  review round 4) measured the same:

  | case | patient search, candidate vs TypeScript set (whole pass) |
  | --- | --- |
  | 7b, `ledger_match` never analyzed | 54 vs 54 ms (21.8 / 21.8 s) |
  | 7b, `ledger_match` analyzed empty | 54 vs 115 ms (21.1 / 21.3 s; the set form does not read `ledger_match`, so the 115 ms is run noise) |
  | 7b, 100,000 other-tenant matches, analyzed | 60 vs 53 ms (19.5 / 19.2 s) |
  | postings pass P, 2,000 of the practice's own matches unanalyzed | 39 vs 36 ms (17,358 vs 17,311 hits) |
  | P, `ledger_match` analyzed empty before those matches were written | 37 vs 36 ms |

  Decrypts equal in every case; writes identical (below). D16 adopts the set form for the control search, and for the
  patient search keeps the exclusion inside the statement against parameter arrays of the pass's set (not
  `ledger_match`), so the decrypt set stays exactly today's: these shapes hold no reversed claim match, which is why the
  TypeScript-only form's decrypts were equal here; with a person's unmatch it could decrypt, once, a claim no line's
  query returned.
- **Equality** (`compare2.py`; settle's posted entries compared as a set, their ordering rule true on both sides):
  F with the other tenants, base = candidate = D16 form (20,619 rows); F alone, base = candidate (20,607); R, base =
  candidate = D16 form (20,635); A, base = candidate (20,635). Recovered totals equal in every pair (F: 2,000 approved,
  2,000 posted, 31,760,000 cents).
- **A's full month (D14):** see 8.3a. 30,795 lines (A's actionable lines in 1b's run) in one case: the candidate's pass
  1,653.1 s, 184% of the attempt; 89% of it is the ledger_entry triggers (Lane A's, 14.1).

---

## 2. The options

The founder's standing rule (2026-10-18) judges each: accuracy, quality, user experience, reliability, security and
privacy, cost to serve, maintainability, resilience to change; never build effort.

### 2.1 Candidate search (`candidatesFor`, `candidateClosure`, `chainOrdered`)

- **A. One search for the pass (recommended, D1).** Before any line is matched, find every open line's candidates
  with the same rounds: per round one statement by control number for all lines still searching (each line's known
  claims passed as pairs), and once per pass one statement by patient that returns each claim some line's own query
  would have returned (same filters, joined on code and date), each decrypted once and given to the lines whose patient
  control number it carries, then (review round 3) one statement over only those patient-equal (claim, line) pairs
  keeping the ones that pass the line's filters, code and date included; the chain's claim order sorted in TypeScript
  by the query's own key. Accuracy: identical filters, rounds and order (section 5.1 proves the equivalence; CAS-49
  tests it). Privacy: the search's decrypts fall from 31 per line (62,000 at 2,000 lines) to one per claim (500), never
  a claim no line's query would have decrypted. Cost: about six statements per pass (the patient search's two statements once, a control
  search and a claim-line read per round, two rounds in the probe's shapes) instead of two to eight per line. Resilience: the same
  `CANDIDATE_FILTERS` predicates, written once per statement, except the `ledger_match` exclusion, which is applied
  from the pass's own set of claim matches (D16): in TypeScript for the control search, and for the patient search
  against parameter arrays of the few matched pairs `known` does not already exclude, so no candidate statement reads
  `ledger_match`, no plan of the search depends on that table's statistics (1b's ask), and the patient search still
  decrypts only claims some line's query would have decrypted. Rejected forms of that exclusion: the
  correlated `NOT EXISTS` (1b's 403 s on F at the base; harmless once per pass today but still statistics-bound);
  1b's uncorrelated InitPlan `c.id <> ALL (ARRAY(SELECT m.claim_id …))` (per line, it does not fit a pass-level
  statement, and it still reads `ledger_match` each call); an index `ledger_match (practice_id, claim_id,
  service_line_id) WHERE kind = 'claim'` (1b measured it: never used).
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
- **`matchPostings` and `matchDeposits`: the rows never matched found by one set difference in the server,
  `SELECT r.id FROM posting_row r WHERE r.practice_id = $1 EXCEPT SELECT m.posting_row_id FROM ledger_match m WHERE
  m.practice_id = $1 AND m.posting_row_id IS NOT NULL` (and `eft_row` / `eft_row_id`) (D15, revised in the review),**
  then reading those rows' columns by ID in today's order. A set operation has no parameterized plan (PostgreSQL runs it
  as `HashSetOp` or a sorted `SetOp`, never a per-row loop), so it is linear whatever the statistics, and it returns
  only the never-matched IDs. Rejected, measured in the review (section 16, probe R7): the candidate's form (both ID
  lists read into the worker and compared in TypeScript), whose transient heap grows with the practice's whole history
  of rows and matches (278 MiB at 1,000,000 rows, half the worker's 560 MiB, and slower than `EXCEPT`); an index on
  `ledger_match (posting_row_id)` and `(eft_row_id)` (a ledger-table migration, Lane A, and it still depends on the
  planner seeing statistics on a just-loaded table); `NOT IN` with a hashed subplan (the plan flips to a per-row
  subplan when the estimate passes `work_mem`).
- **`matchPostings`: each remittance's claims read and decrypted once a pass (D7),** through an optional map passed to
  `postingDecision`; the manual posting match passes none and reads as today.

### 2.5 The ledger triggers

No worker option exists: the inserts are the ledger's writes, one per owed line, and their checks are the database's.
For Lane A (section 14.1), under a founder freeze exception: rewrite `ledger_line_net` so a line's entries are read
through `ledger_entry_by_line` and a correction's target by primary key, and look `ledger_entry_rules`' match up by
primary key alone (completeness check, measured on F: 1,468.9 → 141.5 s of inserts at A's month, the same writes; the
review's first form, measured on spread R at 83d71fd6 at 1,001.1 → 206.7 s, gives nothing on F). An index leading with
`service_line_id` was measured and gives nothing (14.1).

---

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | `matchClaims` finds every open line's candidates for the pass before matching any (`passCandidates`): per round, one statement by payer claim control number for every line still searching (`controlCandidates`), and once per pass the search by patient control number, code and date (`patientCandidates`: one statement returning the claims, each decrypted once, and, review round 3, one `patientPairs` statement over only the (claim, line) pairs equal by patient control number, section 4); rounds, filters (the `ledger_match` exclusion as D16 writes it), `preferredCandidates`, the seen and known sets and the chain's claim order exactly as `candidateClosure` and `chainOrdered` had them. `candidatesFor`, `candidateClosure` and `chainOrdered` go. | Section 2.1 A; equivalence in 5.1. Statements per pass instead of per line; decrypts at most one per claim. |
| D2 | Each claim's lines are read once a pass: the context's map, extended by one `claimLines` call per search round for the round's new candidates; `reprocessingOf` gains an optional last argument, the map, and reads `claimLines` only when the map lacks the line's claim or the candidate. `claimLines`' SQL does not change. | Section 2.2 A. `claimLines` reads stored rows only, which the pass never writes. |
| D3 | `syncLineStages` collects its events and writes them in one `INSERT … SELECT … FROM unnest(…) WITH ORDINALITY … ORDER BY n` (`insertStages`), in today's order (by `service_line_id`, a line's payer approved before its recovered); the move-back notes are read first. | Section 2.3 A. One case refresh per statement; same rows, same `seq` order, same checks. Removes 1b's case-refresh family: on F (one case of 2,000 lines) 4,000 refreshes, 79 s, become one, 0.7 s (section 1.7). The same locks are taken in another order (every event line's head row, then the cases; 5.2, review round 1): `insertStages` runs under a savepoint and re-issues the same statement on a deadlock (SQLSTATE `40P01`), at most twice, so a person's reopen crossing the pass never costs the pass. |
| D4 | No new lock, no lock removed, no change to transactions or write order. The pass stays one transaction under `lockLedger`; every `insertMatch`, `insertEntry`, `recordReprocessedNoChange` and stage event is issued in today's order. **Corrected in review round 1:** the order in which the stage write takes its row locks does change (D3: all event lines' heads, then their cases, where today each event took its head and then its case); 5.2 says what that means and D3's savepoint retry absorbs it. | Section 5.2. `ledger_entry.seq`, `line_status.seq` and, after the interest fix, `ledger_match.seq` draw the same order, so every reader that orders by them reads the same. |
| D5 | `lineChain` reads a line's standing matches from an index built once per context's matches array (a module `WeakMap`), in the array's order. `ChainContext` keeps its shape. | Section 2.4. O(C+M) per context instead of O(C·M); every caller (pass, report, screens) unchanged in answer. |
| D6 | `settleMatches` keeps a running sum of each check's check-level postings in the standing matches' order instead of re-filtering the prefix. | Section 2.4. Same `before` for each match. |
| D7 | `matchPostings` passes `postingDecision` a map of each remittance's claims with their patient control numbers decrypted, filled on first use; `postingDecision` and `claimsWithReference` take it as an optional last argument (the manual match passes none). | Section 2.4. One read and one decrypt per claim a pass instead of one per row. |
| D16 (1b's hand-off; reviewed 2026-11-06) | No search statement names `ledger_match`. The "never claim-matched to this line" exclusion comes from the pass's `matched` set (every `claim`-kind match of the practice, standing or reversed, whose service line is an open line's (review round 4: bounded by the open lines, not the match history; the same answer for every searched line), as `claim line` pairs, from the context's matches read before any write): `controlCandidates` drops matched pairs in TypeScript; `patientCandidates` excludes them inside its statements ((a) and `patientPairs`, review round 3) against two parameter arrays (claim, line index) holding only the matched pairs whose claim is not already in that line's known set (a reversed match, a person's unmatch, a standing match with no line of the code and date), so it decrypts exactly the claims today's per-line queries decrypted, and also drops them in TypeScript. | 1b's ask: the exclusion's cost cannot depend on `ledger_match`'s statistics, by construction. The binding limit: decrypts never widened (a TypeScript-only patient exclusion would decrypt, once, a claim excluded from every line only by such a match). The TypeScript form was measured equal in time, decrypts and writes in five statistics states (section 1.7); the patient statement's parameter-array form is a build gate (slice 3). **Its fallback (review round 1) is the candidate's own correlated `NOT EXISTS` on `ledger_match` inside the patient statement's per-line `EXISTS` (once per pass; measured 37-60 ms in all five statistics states, 1.7), never the TypeScript-only patient exclusion, which the security review does not accept: it would decrypt claims no line's query returned.** If the fallback is taken, the patient search alone stays bound to `ledger_match`'s statistics (once per pass), the PR says so, and CAS-50's text check excludes the patient search's two statements, (a) and `patientPairs` (b), which both carry it (section 4; completeness check 2). The control search's TypeScript drop stays in either case (it decrypts nothing). Equal by 5.1 step 1a. |
| D15 (found in the probe phase; numbered last; revised in the review, section 16) | `matchPostings` and `matchDeposits` find the rows no match was ever made for with one practice-scoped `EXCEPT` statement in the server (the practice's row IDs less its matched `posting_row_id`s, or `eft_row_id`s; identifiers only), then read those rows by `id = ANY ($2)` with today's `ORDER BY`. | Section 1.6 and 2.4. The same rows in the same order; linear on an unanalyzed table (a set operation has no per-row plan); the worker holds only the never-matched IDs, never the practice's history (the candidate's TypeScript comparison held 278 MiB at 1,000,000 rows). |
| D8 | `claim_by_superseded` is SUITE-CAP-1b's D15 (`designs/suite-cap-1-triage-locks.md` line 475, migration `20261109090000` section 4). This item cites it and adds nothing to the schema. | The orchestrator's limit. After D1-D2 it serves the three practice-wide `claimLines` calls and the report. |
| D9 | No migration, index or table (section 14.0). The ledger triggers' part is handed to Lane A (section 14.1) with its DDL and measured gain; it is a ledger function change, needs a founder freeze exception (the ask is written: `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`; granted 2026-11-06 22:40 UTC, as the item's status file records; completeness check 2) and queues behind #126 (one schema PR at a time). This item's build is worker-side only (the co-founder's scope, 2026-11-06): no Lane A part is in its PR. | The ledger freeze; the orchestrator's limit. |
| D10 | Nothing under `packages/ledger/src` changes; no matching rule, amount, stage, outcome or recovered total changes. | The freeze; CAS-49 and LED-01 to LED-18 prove it. |
| D11 | Every new statement is practice-scoped (`c.practice_id = $1`, `o.practice_id = $1`, inside the pass's practice scope with forced RLS), on every table it reads, not only on its output: the patient search's `named` read of `service_line` carries `s.practice_id = $1` in both branches and the control search's `probe` reads of `claim q` carry `q.practice_id = $1` (the candidate relied on RLS and the output's `c.practice_id` there; taken in the review, section 16); and (review round 1, section 18) every other table alias in every search statement too: `r.practice_id = $1` on `remittance r`, `o.practice_id = $1` in the correlated `claim o` load-time subqueries, and `x.practice_id = $1 AND xl.practice_id = $1` in the `case_line` exclusion (the D16 fallback's `ledger_match m`, if taken, `m.practice_id = $1`); the candidate's two `ARRAY(…)` reads of `service_line` (every line's code and date of each returned claim) are removed, not scoped (review round 2; review round 3: the patient search's statement (a) selects no `service_line` column and its statement (b), `patientPairs`, returns only (claim, line index) pairs for pairs already equal by decrypted patient control number, every alias of both carrying `practice_id = $1`, section 4, 5.2); CAS-50 checks each alias; decrypts happen only in the worker, once per claim, never logged; no identifier reaches a log line, an error message or a job payload. | Tenancy and PHI rules; CAS-50 counts the decrypts. |
| D12 | ADR 0087: "A reconcile pass reads per pass, never per open line, and writes in the order the rules define." The pass's statements stay a bounded number per pass (CAS-50 enforces it); a new matching filter is written into the pass-level search and kept equal to the per-line definition CAS-49 holds. | A lasting constraint on every later change to the reconcile step (the matching rules will change again; a per-line query would bring the curve back). |
| D13 | CAS-49 to CAS-51 (section 7); the old per-line step is kept as test support (`apps/worker/src/reconcile/test-support/per-line.ts`) as the reference CAS-49 compares with, as SUITE-CAP-1a kept the whole read. | The proof is old against new, at generated sizes and shapes. |
| D14 (revised 2026-11-06) | 1b has landed, so this item is second and resets them, from section 8.4: CAS-42.3 keeps its default 2,000 lines, `PASS_BUDGET_MS` 150,000 → 60,000, and its comment's "grows faster than its lines" paragraph is rewritten; step 7b stays on F, a practice of its own, at **10,000** lines at full size (`FULL_SIZE.reconcileLines`; the smoke size keeps 600), expected to complete on attempt 1 within 360 s; the Known gap line stays, with its fixed words rewritten to A's month's measured figure and to who closes it (Lane A's trigger fixes). Moving step 7b back to A's full month is **not** in this item: measured, it fails the attempt (1,653 s against 900 s, 8.3a); it becomes the acceptance step of Lane A's trigger PR, re-measured within 360 s. ADR 0083 gets a dated note pointing to ADR 0087. | 1b's hand-off and ADR 0083 named the move back as this item's acceptance; the measurement shows no worker change can meet it (89% of that pass is the ledger triggers). Building a step that fails every weekly run would hide every other signal of that run. Put to the orchestrator in the review (section 8.4); the status file records its ruling of 2026-11-06 22:31 UTC accepting the split, for confirmation with the reviewed design (8.4, completeness check 2). |

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
    `ORDER BY r.bpr16_date, c.created_at, c.id` (the reasoning `byPayment`, :449-458, already documents); both search
    statements select the date as `to_char(r.bpr16_date, 'YYYY-MM-DD') AS paid_on`, not `r.bpr16_date::text`, so the
    new sort holds under any `DateStyle` (review round 1; identical text under the ISO style every connection uses today,
    so `recordNoChange`'s `receivedOn`, which takes this `paidOn`, is unchanged; pinning `DateStyle` for the base's other
    `::text` dates is 14.4 item 13);
  - `controlCandidates(scope, practiceId, searched, matched)`: one statement; the lines as `unnest($2::int[], $3::uuid[],
    $4::uuid[], $5::uuid[])` (index, service line, remittance, claim) and each line's known claims as pairs
    (`unnest($6::int[], $7::uuid[])`); per line, the claims a known claim's correction names or that carry a known
    claim's control number hash (through `claim_by_payer_claim_control_number`), filtered by exactly
    `CANDIDATE_FILTERS` with `$2`-`$5` replaced by the line's columns, less the `ledger_match` predicate, `ORDER BY l.ix,
    r.bpr16_date, c.created_at, c.id`; each returned row whose `claim line` pair is in `matched` is dropped in
    TypeScript before it is added to the line's list (D16); both `claim q` reads in its `probe` CTE carry
    `q.practice_id = $1` (D11, review), and `remittance r`, `claim o`, `case_line x` and `service_line xl` carry
    `practice_id = $1` (D11, review round 1);
  - `patientCandidates(scope, cipher, practiceId, searched, matched)`: one statement returning each claim that some
    line's `byPatient` would have returned (the same filters less the `ledger_match` predicate, joined on the line's
    code and date: equality on both, or
    both dates null, which is `IS NOT DISTINCT FROM`; both branches of its `named` CTE read `service_line s` with
    `s.practice_id = $1`, D11, review; `remittance r`, `claim o`, `case_line x` and `service_line xl` carry
    `practice_id = $1`, D11, review round 1). **Review round 2 (PHI read):** the statement selects no `service_line`
    column. The candidate's `ARRAY(SELECT s.procedure_code …) AS codes` and `ARRAY(SELECT s.service_date::text …) AS
    dates` (cap3-rev `remittances.ts:272-273`: every line of every returned claim, other patients' included, in the
    worker before the patient filter) and its separate `loaded_at` statement for the lines' claims (:287-290) go.
    **Review round 3 (volume):** round 2 put an `ixs` array of the passing line indexes in their place; that form is
    withdrawn, because `named` pairs every searched line with every claim of its code and date whatever the patient,
    so `ixs` evaluated the full per-line predicate for all g × g' pairs of a code-date group and returned them all to
    the worker (Σ g × g', the base's per-line volume; on spread A at A's month about 9.5 M elements), and a
    skeptic's probe of it on a reduced schema took 8.0 s at 2,000 and 181.5 s at 6,000 lines against the candidate
    form's 0.09 and 0.71 s. The patient search is instead **two statements, once per pass**:
    (a) the outer statement exactly as the candidate has it less the two arrays: the same outer `EXISTS` (stopping
    at the first passing line, so the same claim rows), selecting only `c.id`, `c.remittance_id`, the `to_char`
    payment date, the load time and `c.patient_control_number`; each claim decrypted once;
    (b) `patientPairs`: after decrypting, the worker sends only the (claim, line index) pairs whose decrypted patient
    control number equals the line's, as two parameter arrays (`unnest($n::uuid[], $m::int[]) AS p (claim_id, ix)`,
    no statement when there are none), and the statement returns the pairs that pass the per-line predicate, word
    for word the outer `EXISTS`'s (a line of the claim of the line's code and date, `IS NOT DISTINCT FROM` on the
    date; own remittance excluded; `c.created_at >= (SELECT o.created_at …)`; the `k` known exclusion; D16's array
    exclusion; with D11's `practice_id = $1` on every alias), selecting `p.claim_id, p.ix` only, `ORDER BY p.ix,
    p.claim_id`. Its input and output grow with the pairs that match by patient (linear in the open lines), never
    with a code-date group's size; no code or service date reaches the worker, and the decrypts are (a)'s, equal to
    the base's union.
    Per line, the candidates by patient are the claims (b) returned for the line's index, less (in later rounds) the
    line's known claims and `matched` (D16's TypeScript drop), sorted `inChainOrder`; the line's `seen` claims are
    taken off **after** `preferredCandidates([control, patient])`, as the base's `candidateClosure` and the candidate
    (`remittances.ts:356`) do, never from either list before it (review round 3: a control-number candidate that
    paired with no line comes back each round and, kept, hides the patient list; dropped first, the search would fall
    through to a patient claim and write a match; CAS-49.1's fifth mutant). The TypeScript re-checks of `since`,
    remittance and code and date (:301-311) go: (b) applies them per pair in SQL, exactly the per-line `byPatient`
    query's predicate, so the returned rows, the decrypts and the writes are the same, and the worker holds no code or
    service date of a claim no line's decrypted number named (as the base's `claimLines`, read only for such claims).
    Inside both statements' per-line predicate, `ledger_match`'s `NOT EXISTS` becomes `NOT EXISTS (SELECT 1 FROM
    unnest($8::uuid[], $9::int[]) AS x (claim_id, ix) WHERE x.claim_id = c.id AND x.ix = l.ix)` (in (a)'s outer
    `EXISTS` and in (b) alike), the arrays holding the
    matched pairs whose claim is not in that line's known set (D16; numbering as the build lays out the parameters).
    If slice 3's gate fails, the candidate's correlated `NOT EXISTS (SELECT 1 FROM ledger_match m …)` stays there
    instead, in (a) and (b) alike (D16's fallback, with `m.practice_id = $1`); never a TypeScript-only patient exclusion.
    `matched` is the set of `claim line` pairs of the context's `claim`-kind matches (standing or reversed; the
    context's `chainMatches` reads both) whose service line is an open line's (review round 4: a `Set` of `open`'s
    service-line IDs first, then the filter; the candidate's set, `remittances.ts:915`, holds the practice's whole
    claim-match history, 5.0 MiB at 61,590 pairs and about 65 MiB at 740,000, about a year at A's rate; every lookup is
    by a searched line, and only open lines are searched, so the exclusion is the same), built once in `matchClaims`
    before any write of `matchClaims`. No search
    statement (the control search, the patient search's (a) and (b)) names `ledger_match` (CAS-50 checks the text). From
    `cap3-results-rev/d1-ts-exclusion.diff` (a measured reference, not a patch) the build takes only the control-search
    hunk (`controlCandidates`' `matched` argument, its TypeScript drop and the removal of that statement's `ledger_match`
    predicate) and `passCandidates`' call-site change; never its patient-search hunk (@@ -276), which deletes the patient
    statement's `NOT EXISTS` and puts nothing in its place, the TypeScript-only patient exclusion D16 rejects (it would
    decrypt claims no line's query returned; review round 4). The patient statements (a) and (b) get D16's
    parameter-array predicate as above, or, if slice 3's gate fails, the correlated fallback;
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
  WITH ORDINALITY AS e (service_line_id, stage, reason, reopened_from, n) ORDER BY e.n`, issued between `SAVEPOINT
  stage_events` and `RELEASE SAVEPOINT stage_events`; on SQLSTATE `40P01` (deadlock) it runs `ROLLBACK TO SAVEPOINT
  stage_events` (which releases the head-row locks the statement took) and issues the same statement with the same
  arrays again, at most twice more, then rethrows; any other error is rethrown at once, as today (D3, 5.2; review
  round 1; `price/create.ts:168-198` is the codebase's savepoint precedent). The events are never split or reordered.
- `syncLineStages` (:72-110): the same reading and the same decisions, pushing events instead of inserting; one
  `insertStages` at the end; `forward` and `back` counted as today. `moveBackNote`, `notifyRecoupments` and
  `manualRecoupments` unchanged.

### `apps/worker/src/reconcile/postings.ts`
- `RemittanceClaims` (exported type); `claimsWithReference` (:72-90) and `postingDecision` (:111) take an optional
  last argument of that type; `matchPostings` (:142) creates one per pass and passes it (D7).
- `settleMatches` (:338-346): `checkPostedBefore: Map<remittanceId, bigint>` replaces the prefix filter (D6).
- `neverMatched(scope, practiceId, 'posting_row' | 'eft_row')` (new, private): one statement, `SELECT r.id FROM
  <table> r WHERE r.practice_id = $1 EXCEPT SELECT m.<column> FROM ledger_match m WHERE m.practice_id = $1 AND
  m.<column> IS NOT NULL` (the table and column from a closed two-value map, never from input); `matchPostings`
  (:144-149) and `matchDeposits` (:191-196) read their rows by `p.id = ANY ($2::uuid[])` (`e.id`) with today's
  `ORDER BY` (D15). The candidate's two ID reads and TypeScript comparison are replaced (review, section 16).
- D6's running sum is a small pure function (`checkPostedBefore(standing, amountOf)`: each standing match's `before`,
  in the list's order), exported for a unit property test (`apps/worker/src/reconcile/settle-order.test.ts`, new):
  for any standing list (any order, any mix of kinds, levels and checks, generated with fast-check), it gives each
  match the same `before` as today's `standing.slice(0, position).filter().reduce()` (CAS-49's settle rule, section 7).

### `apps/worker/src/reconcile/test-support/per-line.ts` (new)
- Today's text, word for word, of **every function this item changes** (completeness check: the first list held only
  the claim side, so D5, D7 and D15 would have been compared new against new): `candidatesFor`, `candidateClosure`,
  `chainOrdered`, `matchClaims`, `matchCandidate`, `reprocessingOf` and `lineChain` (the filter form) from
  `remittances.ts`; `syncLineStages` with `insertStage` from `stages.ts`; `matchPostings`, `matchDeposits`,
  `postingDecision`, `claimsWithReference` and `settleMatches` (the prefix filter) from `postings.ts`; each calling the
  copies, never the new functions; and `referencePass(scope, cipher, practiceId)`, today's `reconcilePractice` body
  (`pass.ts:35-51`) with those copies in its order and the unchanged steps (payer responses, recoupment notices)
  imported. Exported for CAS-49 (D13). Not imported by any production file. **Corrected in review round 3:** no lint rule or
  test holds this today (`eslint.config.js` restricts imports only for the model SDKs and Google fonts, and
  `packages/packets/src/role-examples.ts` already imports a `./test-support` module unflagged), so slice 1 adds the
  guard: the `per-line` module joins `restrictedImports`' patterns (`**/test-support/per-line`, with a message
  naming ADR 0087), and a test-file override (`**/*.test.ts`, `**/test-support/**`) re-declares the rule with the
  existing patterns only, since a later flat-config block replaces a rule's options; a lint fixture test, as
  `packages/model-gateway/src/lint.test.ts` does for the SDK rule, shows a production file importing it through
  `./`, `../` and the package path fails and a test file passes. The rule is scoped to `per-line`, not to every
  `test-support` path, so existing imports (`role-examples.ts`, the package's exported test subpaths) are untouched. Once #126 is on the base the copies are taken from the merged base's text (its `remittances.ts`
  hunks included), so the reference is always "the base this PR merges into".

### Not changed
`pass.ts`, `ledger.ts`, `manual.ts`, `responses.ts`, `patient-share.ts`, `shortfalls.ts`, `unmatched.ts`, the web's
reads, the report, every SQL function and trigger, `packages/ledger/src/**`, `packages/db/**`.

### Documents
- ADR 0087 (D12), new, with "Context" (this finding and its numbers), "Decision", "Consequences" (a per-line query in
  the pass fails CAS-50; a new filter goes in both the pass-level statement and the per-line reference CAS-49 holds) and
  "Measured" (section 8.3).
- `docs/runbooks/ci.md`: no new job or shard (CAS-51's default fits a test:db shard, section 8.2); its Known gap
  paragraph (lines 72-73) is reworded with D14 (completeness check: it names CAS-42.3's 2,000 lines and SUITE-CAP-3
  moving step 7b back).
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
1a. **The `ledger_match` exclusion (D16).** Today's predicate reads the claim matches as they stand when L's query
   runs. Every claim match standing or reversed at that moment either was there before the pass's first write (it is in
   `matched`, read then) or was written by the pass for another line (its line is not L, so it never excludes a claim
   from L). So `(c, L) ∈ matched` is the predicate, for every line, whenever L's query would have run. A pair whose
   claim is in L's known set is already excluded by `c.id <> ALL(known_L)`, so the patient statement's arrays need
   only the rest; the TypeScript check of the whole set is the same predicate again.
1. **Nothing written in between changes L's filters.** Each filter names L itself or nothing: `c.id <> ALL(known_L)`,
   `c.remittance_id <> L.remittance`, `c.created_at >= L's claim's`, `NOT EXISTS ledger_match (claim, c, L's line)`,
   `NOT EXISTS case_line for c`, `r.status`, `claim_status_code`. Earlier lines' writes are ledger matches and entries
   on other service lines (`case_line_once` makes a service line one case line), payer responses and submissions; a
   pass never writes claims, remittances or case lines. So L's queries return the same rows whether run before any
   line is matched or just before L is. **Other writers (review round 1):** a pass runs at READ COMMITTED, and the 835
   load (`intake`, `parse_835`) and `loadExports` run outside the `ledger:` lock, so a claim another transaction commits
   mid-pass could be found by a later line's query today; the pass-level search reads once up front, so such a claim is
   reconciled by the next pass instead. The next pass is guaranteed: each load queues a reconcile keyed by its own
   subject (`monitor/job.ts:86` by document when nothing is priced, `triage/job.ts:35` by pricing run after a priced
   load, `intake.ts:224` for a stored export, and the daily one, `platform/monitoring-schedule.ts:51`; singleton keys
   `jobs/registry.ts:95`), which waits on `lockLedger` until this pass commits and then sees the claim. No amount, rule
   or recovered total changes; lines today's pass had already matched never saw such a claim either. CAS-49 runs with
   no concurrent writer, so its equality is unaffected.
2. **`byControl`** runs per round for the lines still searching, with each line's own `known_r`: the same rows per line
   in the same order (the statement's `ORDER BY l.ix, …` is each line's `ORDER BY` within its index).
3. **`byPatient`** differs between rounds only by `c.id <> ALL(known_r)`, and `known` only grows; so
   `P_r = P_1 less known_r`, which the search computes from one read. `P_1` for line L is exactly the claims that
   statement (b) (`patientPairs`, section 4) returns for L's index (review round 3; round 2's `ixs` text and the
   earlier "TypeScript re-applies each line's filters" are withdrawn): (a)'s outer `EXISTS` holds L's own per-line
   predicate, so every claim L's query returned is among (a)'s rows and is decrypted; the worker pairs it with L when
   its decrypted patient control number equals L's (the patient equality of L's query); and (b) keeps the pair when it
   passes L's per-line predicate, the same predicate as L's own `byPatient` query, D16's arrays included (which leave
   out only pairs whose claim is in `known_L`, which `c.id <> ALL(known_L)` already excludes). So `P_1` is L's
   query's rows, no more and no fewer. The decrypt set is (a)'s rows, the union over lines of what each line's query
   returned, each claim once.
4. **Rounds, `seen` and pairing**: per line as today; `seen` is taken off after `preferredCandidates([C_r, P_r])`,
   never from `C_r` or `P_r` before it (review round 3: a control-number candidate that paired with no line stays in
   `C_r`, so the round empties and the search stops, as today); the round's `claimLines` read covers every line's new candidates
   (D2's map equals a two-claim read).
5. **Order**: `found` sorted by `inChainOrder`, the key of `chainOrdered`'s `ORDER BY`. Then the lines are matched in
   `caseLines` order and each line's candidates in that order: every `insertMatch`, `insertEntry` and
   `recordReprocessedNoChange` is issued in today's order with today's arguments (the baselines carried per line, as
   today, since each line reads only its own chain and ledger).

### 5.2 Order, locks and concurrency

- One transaction under `lockLedger`, as today; no new lock, no lock removed. The manual actions (`manual.ts`) take the
  same `ledger:` lock first, so they never interleave with a pass; they run in web requests, which wait for the pass
  (on the base as well; handed to the web owner, 14.4 item 14, review round 6). The screens read committed rows only and see the
  pass whole or not at all.
- **Lock order (corrected in review round 1).** `line_status_rules()` (BEFORE ROW) takes each event line's
  `line_status_head` row (`line_status_rules.sql:21-28`); `line_status_refresh_cases()` (AFTER STATEMENT) then updates
  the touched `"case"` rows (`line_status_refresh_cases.sql:14-15`). Today each event is its own statement: head(L1),
  case(C1), head(L2), … With D3 one statement takes every event line's head, then the cases. Two writers outside the
  `ledger:` lock take case then head: the web's `reopenLineAction` (`apps/web/src/lib/routes/triage.ts:536-548`:
  `UPDATE case_line`, whose `case_line_refresh_*` trigger updates the case, then `INSERT line_status`) and a triage job
  (case lines, then `advanceStages`; the `triage:` lock only). Today a deadlock needs the other writer to cross the
  pass at the first event line of a case; with D3 it can cross at any event line of a case while the statement runs
  (0.7 s on F at 2,000, 4.8 s at 10,000). It is rare (a reopen of a written-off line, or a triage of a line, that the
  same pass moves) and never corrupts data: PostgreSQL aborts one side. Taking the cases first (`SELECT … FOR UPDATE`
  on `"case"`, case-then-head like the other two writers) would remove it, but `tp_app` holds only `INSERT` on `"case"`
  (migration `20261019160000`:717) and this item adds no grant. So: `insertStages` runs under a savepoint and re-issues
  the same statement on `40P01` (section 4; rolling back to the savepoint releases the heads it took, the other side
  proceeds, and a reopen leaves the head at the same stage, so the same events pass the same checks; if a concurrent
  stage change makes one fail its check, the pass fails and retries as today's would). If the deadlock detector picks
  the person's reopen instead, the reopen gets a retryable error (`40P01`), as it can today. CAS-49.6 tests it. The
  lasting fix, the reopen taking the `ledger:` lock with `pg_try_advisory_xact_lock` and refusing at once (retryable,
  no identifier) while a pass holds it, never the blocking `lockLedger`, which would hold a shared web connection for
  the length of a pass (review round 4), is handed to the web owner (14.4 item 14).
- `ledger_entry.seq` (default `nextval`): the inserts are issued in today's order, so seq order is today's.
  `ledgerEntries` (`ORDER BY seq`) and `ledger_line_stage` (`max(seq)`) read the same.
- `ledger_match`: inserted in today's order (claims in line and chain order, then reversals, then WOs and L6s, then
  postings, then deposits). Today `ledgerMatches` orders by `matched_at, id`; after the interest fix by `seq`, which
  follows insertion: the same.
- The posted and deposited entries `settleMatches` writes follow `ledgerMatches`' order (`matched_at, id`); a pass's
  matches share one `matched_at` and their IDs are random, so that order differs between any two runs of today's code
  as well. It is unchanged (D6 keeps the loop's order). **Not only the order (review, section 16):** when two or
  more allocated check-level postings of one check are matched in the same pass, each one's `before` is the sum of
  those ahead of it in that random order, and `partialShare` rounds half up on the cumulative share, so the split of a
  line's share between those postings can differ by a cent between two runs of today's code (share 5 of a 10-cent
  check, two postings of 3: 2 then 1, or 1 then 2; the line's total is the same unless a row's or a line's cap bites).
  That is the base's behaviour, not changed here, and #126's `ORDER BY m.seq` makes it deterministic (insertion order,
  which follows the export's `ORDER BY`). So the probe's shapes (line-level postings only) compare those entries as a
  set, and CAS-49 compares them by the rule in section 7.
- `line_status.seq`: the multi-row insert forms its rows in `n` order and draws each row's default `nextval` as it forms
  it, then runs its BEFORE triggers before forming the next; 1b's `line_status_rules()` draws its own `nextval` under the
  head row in the same interleaving. CAS-49.3 checks a line's payer approved then recovered in one statement under both
  bodies, and the probe compared `seq` values exactly (section 8.3). **Gaps (review round 3):** a statement rolled back
  (D3's savepoint retry, a reopen aborted by the deadlock detector) does not return the values it drew, both the rows'
  defaults and the head rows' `nextval`, so `line_status_seq_seq` then has gaps; that is correct, as no reader depends
  on gap-free values (every reader takes a line's latest event by `ORDER BY s.seq DESC LIMIT 1`, e.g. `stages.ts:95`,
  `triage/actionable-now.ts:26`, the web's queries, or reads `line_status_head`; none compares values). CAS-49.1 compares exact `seq` values (no concurrent writer, nothing rolled back); CAS-49.6 compares `seq`
  order only.
- `case`: refreshed once per statement instead of once per event; the final row is the same (its state and totals are
  derived from the lines' latest events; `updated_at` and `closed_at` take `now()`, the transaction's time, either
  way). No trigger on `"case"` writes history or audit rows (`case_rules`, `case_updated_at`, `case_belongs`,
  `case_never_deleted` only), so the intermediate updates were not observable.
- The notification and audit rows are written by unchanged code in unchanged order.
- The pass returns no more PHI-bearing rows to the worker than today: every new statement is inside the practice
  scope and filters on `practice_id`; the patient search returns the union of the claims the per-line queries returned
  (each once; D16's parameter arrays keep the `ledger_match` exclusion inside the statement, so the union is exact),
  and per claim no more columns than the base's `byPatient` returned (id, remittance, payment date, the encrypted
  patient control number; plus its load time): neither patient statement selects a `service_line` column, so no code
  or service date of another patient's claim reaches the worker (review round 2; the candidate's `codes`/`dates`
  arrays did, section 4), and statement (b) receives and returns only (claim, line index) pairs already equal by
  patient control number, so its volume follows the patient matches, not a code-date group's size (review round 3);
  D15's `EXCEPT` returns only the never-matched rows' identifiers, which today's anti-join also computed inside the
  server, so the worker receives no more identifiers than it then reads rows for. The arrays D16 passes are
  identifiers of the practice's own matches, never logged.

### 5.3 What a reader sees

Nothing. The pass writes the same rows; the summary counts (`RemittanceOutcome`, `StageSync`, `ReconcileSummary`) are
the same numbers; no screen, report, CSV, PDF, email or log line changes.

---

## 6. Every sentence a person reads

None in the product changes. No message, label, note, email, notification text, error text, log line or document a
customer reads is added, removed or reworded. The reopen notes (`REOPEN_NOTES`) are written by the same code into the
same rows; D3 moves when `moveBackNote` runs (before every insert, not between them), so CAS-49.1 compares each note by
its decrypted text and its sixth mutant gives a proof-level move-back the reversal note (review round 4). No ux-brand review is needed (LANES.md rule 1).

One operators' line changes (D14): the weekly release-capacity summary's Known gap line (`tools/release-capacity/
checks.ts` `KNOWN_GAP`, `KNOWN_GAP_REVISIT`), read by the founder and the lanes, not by a customer. Its fixed words
today name "10,000 lines in 3,412 s" and "moving step 7b back to A's full month is its acceptance step"; the new words
say what 8.4 says: step 7b reconciles F at 10,000 lines; the reconcile at A's full month is measured at 30,795 lines in
1,653 s, held by the ledger triggers, which are Lane A's; revisit when Lane A's trigger fixes land, whose PR moves step
7b back to A. The build drafts the exact sentence in plain words, no identifier, and the orchestrator approves it with
the draft PR.

---

## 7. Tests

Every new test reads SYNTHETIC rows only (`packages/synth` twins, LED fixtures, or rows the test generates with
SYN-marked identifiers), logs no identifier, and runs in the `db` project unless marked unit. No test compares
encrypted text by whether it is set: an encrypted column is compared by the SHA-256 of its decrypted plaintext, taken
in memory and never logged (CAS-49.1; review round 4).

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
   (reversal note and proof-level note) and a recoupment's reopen; and (completeness check) each of
   `CANDIDATE_FILTERS`' predicates biting alone: a candidate in the line's own remittance, one loaded before the line's
   claim, one of a remittance not `loaded` (an 835 held for review, ADR 0060), a reversal (`claim_status_code` 22), one
   already a case line; a line with no service date (the patient search's `IS NOT DISTINCT FROM` branch); claims loaded
   in one transaction (one `created_at`, so the UUID breaks the tie); a second practice in the same database with
   claims of the same code, date and patient control number (D11: never a candidate); interest as the base pays it
   (AMT I and a PLB L6; LED-23 to LED-25's worlds join once #126 lands); posting and EFT rows of an earlier export never
   matched, and a posting match a person reversed (D15: its row is never matched again, as `NOT EXISTS` had it); a
   claim-level posting row whose claim reference names a claim of another remittance (D7); and (review round 3) a
   case line with a control-number candidate that pairs with no line (a correction that changed the procedure code)
   beside a patient-number claim of the same code and date that would pair, so that the base's stop (the control
   candidate returns, `seen` empties the round, the patient claim is never matched) is in every run's world. Each case is built twice
   from the same template
   database (`CREATE DATABASE … TEMPLATE`), one pass run by `referencePass` (today's every changed function, section 4)
   and one by `reconcilePractice`, and the
   test compares, with each row's new UUIDs replaced by their ordinal in insertion order (taken as the paragraph
   below says, never by `ctid`): the ledger matches in insertion order; the ledger entries in `seq` order with their `seq` values, except the posted and deposited
   entries `settleMatches` writes, which follow the random match IDs: compared as a set, with the rule that their
   `seq` order is `ledgerMatches`' order checked on both, **except** for a check with two or more allocated
   check-level postings matched in that pass, whose entries' amounts depend on that random order (5.2): for those,
   each side's entries are checked against `partialShare` and the caps replayed in that side's own `ledgerMatches`
   order, and the two sides' totals per line and stage and per posting row are compared (equal unless a cap bites, in
   which case the replay alone decides); the generator makes such a check in at least one run, and D6 itself is proved
   order for order by `settle-order.test.ts` (section 4). Once #126 is on the base (`ORDER BY m.seq`), these entries
   are compared exactly in `seq` order instead (12.2); the `line_status` rows in `seq` order with `seq`
   values; payer responses, submissions, notifications and audit events in insertion order; every case's state,
   totals, deadline and whether closed; the summary counts; and the set of claims whose patient control number each
   side decrypted in the search (counted by claim ID through the test's wrapper over `PracticeCipher.decrypt`, never
   logged): **for the search phase the new side's set must equal the reference's union** (D16 and 5.1 step 3 claim
   exactly that union; review round 1: a subset check would pass a search that drops claims), and for the postings
   phase each claim at most once and within the reference's set (D7 removes repeat decrypts there). The generator
   includes a person's unmatch of a claim of the same code and date that no other line would take, and (review round 1)
   a reversed claim match on a case line whose claim no other line names, so the equality bites in both directions and
   would fail a TypeScript-only patient exclusion (D16).
   **How insertion order is taken (review round 2).** On the base `ledger_match`, `payer_response`, `submission`,
   `notification` and `audit_event` have no `seq`, and a pass's rows share one `created_at`; the probe's `dump.py`
   ordered them by `ctid` (`cap3-probe/dump.py:10, 24`), which is physical position, not insertion order, and the
   build does not copy it. The test's statement proxy (the one CAS-50 and CAS-51 use) records, on each side, every
   write statement to those tables in issue order with its parameters. (a) A single-row insert that returns its id
   (`insertMatch`, `ledger.ts:141-144`; the payer response and submission inserts, `packets/services.ts:702-704,
   767-769`) gives that id its ordinal in issue
   order, and the rows are compared in that order. (b) A multi-row insert without `RETURNING` (`audit_event`'s
   `INSERT … SELECT FROM unnest(…)`, `packages/db/src/authz/audit.ts:49`; the recoupment `notification`'s
   `INSERT … SELECT … ON CONFLICT DO NOTHING`, `stages.ts:155`): the two sides' sequences of such statements are
   compared in issue order (text and parameters, new UUIDs by ordinal), and the rows each wrote are compared as a
   multiset of canonical rows (own id and timestamps out); no other row refers to these rows' ids, so they need no
   ordinal; any other insert into these tables without `RETURNING` falls under (b). The template database's written tables are set `autovacuum_enabled = false` before the clones are taken,
   so neither side is vacuumed during the run. Once #126 is on the base, `ledger_match` is compared by `seq` (12.2).
   **How encrypted text is compared (review round 4).** Never by presence. Every encrypted column the pass writes
   (`line_status.reason`, the move-back and recoupment notes; and any other column the test's wrapper over
   `PracticeCipher.encrypt` sees written in the run, e.g. a payer response's or notification's encrypted text, and in
   CAS-49.4 `ledger_entry.reason` and `ledger_match.reversal_reason`) is decrypted in memory on each side with the test
   practice's cipher and compared as the SHA-256 of its plaintext, in the row's place in the comparison; a `null` stays
   `null`. The ciphertext itself differs on every run (AES-256-GCM with a fresh nonce, `packages/db/src/crypto/cipher.ts`),
   so comparing it byte for byte fails spuriously and comparing it as set or not (the probe's `dump.py:12`, section 15
   T2) would pass a wrong note: `REOPEN_NOTES.reversal`, `.proofLevel` and `.recoupment` all look alike as "set". The
   plaintext and its hash are never logged or printed; a failure names the table, the row's ordinal and the column
   only. **The proof level is split across the runs (review round 5).** The level is one setting for the whole practice
   (`setLedgerSettings`, `settings.ts:27-35`), read for every line by `ledger_line_stage` (`ledger_proof_level`,
   `ledger_line_stage.sql:15`), so a world that raises it computes every stage of its pass at deposited, and the
   product default is posted (`packages/ledger/src/stages.ts:18`). The level is therefore fixed by the run's index,
   never drawn: the 13 even-indexed runs keep posted through history and pass, so claim-level, line-level and partial
   check-level postings matched in the pass move lines to recovered, among them a line's payer approved and recovered
   from a posted entry in one `insertStages` (D3's order), and the posted-level recovered total is compared; the 12
   odd-indexed runs raise the level from posted to deposited through `setLedgerSettings` after the history and before
   the pass, and each such world moves a recovered line back both ways: one line with no reversal (the proof-level
   note) and one whose deposit match a person reversed while its posting stood, so it stayed recovered at posted (the
   reversal note; `reverseMatch`, `manual.ts:180-215`, then `finish()`'s sync), since D3 moves `moveBackNote` ahead of
   every insert (`stages.ts:118`, one `insertStages` at :123 at 0b6e90eb). The harness asserts, after the 25 runs, that
   both levels ran, that some posted run moved a line to recovered from a posted entry matched in the pass, and that
   run index 1 (a fixed CI seed) holds both move-backs written by the pass; the sixth mutant below is checked against
   that run.
   **Fails
   first** with D1 written without step 3 of 5.1
   (one round's patient read reused without taking off the known claims), with the patient search's `created_at`
   filter narrowed from `>=` to `>` (a dropped claim that pairs with no line: only the decrypt equality sees it),
   and with D3 writing the events grouped by stage
   (every payer approved, then every recovered: the same rows, another `seq` order), and with D16's exclusion dropped
   from both searches (an unmatched claim matched again), and (review round 3) with `seen` taken off the
   control-number list before `preferredCandidates` (the patient claim above matched: a new match and entry), and
   (review round 4) with `moveBackNote` returning `REOPEN_NOTES.reversal` for every recovered line moved back (the
   proof-level move-back gets the reversal note: the same rows, stages and `seq`; only the decrypted comparison sees
   it; a full swap of the two notes is not used, as LED-07 already fails it, `ledger.db.test.ts:632`); all six
   mutants are part of the test file's own self-check, run against a copy of the new code.
2. **LED fixtures.** For LED-01 to LED-18's own worlds (`ledger.db.test.ts`' `LedgerWorld`), the same comparison after
   each reconcile the LED test runs (encrypted text by its decrypted hash, as in 1; review round 4). LED-01 to LED-18 and `ledger-oracle.db.test.ts` themselves are unchanged and pass
   byte for byte.
3. **Stage events in one statement.** Under the base's `line_status_rules()` (1b's head-row body, #110; the pre-1b body
   is gone from the base, so the test has one half only, 12.1), one `insertStages` with a line's payer approved then
   recovered, and a recovered line's move back, writes both rows with ascending `seq` and `line_status_head` holding
   the last; reversed order is refused with today's message; another line's events between them change nothing; and
   the same with `set_by` a person (the manual actions' `finish()`, 4 below). **Fails first** with the rows given out
   of order.
4. **The manual actions (completeness check).** `manual.ts` is unchanged but calls changed code: `finish()` and
   `adjustEntry` call `syncLineStages` (D3), `matchPostingByHand` calls `postingDecision` (D7) and, with
   `matchDepositByHand`, `settleMatches` (D6), `matchClaimByHand` calls `lineChain` (D5) and `reprocessingOf` (D2's optional argument, none passed). A second
   file, `apps/worker/src/reconcile/pass-equality-manual.db.test.ts` (new; `vi.mock` is per file), runs LED-02's and
   LED-07's worlds and each manual action (`matchClaimByHand`, `matchPostingByHand`, `matchDepositByHand`,
   `reverseMatch`, `adjustEntry`) twice from one template: once as shipped, once with `./stages`, `./postings` and the
   changed `./remittances` exports mocked to `per-line.ts`' copies; it compares the writes as in 1 (with `set_by`, the
   audit event and the actor; `ledger_entry.reason` and `ledger_match.reversal_reason` by their decrypted hash, review round 4), and the refusals (`ReconciliationError` codes) for the same bad inputs. **Fails first**
   with D3 grouping a person's events by stage.
5. **`lineChain`'s index (D5), unit (completeness check).** `apps/worker/src/reconcile/line-chain-index.test.ts`
   (new, fast-check, fixed seeds): for generated `ChainContext`s (matches in any order, standing and reversed, lines
   with none, a `null` line, claim and recoupment kinds), `lineChain` equals `per-line.ts`' filter form for every line
   asked, and two contexts with equal but distinct `matches` arrays each get their own index. `lineChain`'s other
   callers (`shortfalls.ts`, `patient-share.ts`, the report's `whole-read.ts`) read it only through this function, so
   CAS-41 (which runs the new `lineChain` on both of its sides) plus this test cover them. The index assumes no caller
   changes a context's `matches` after the first `lineChain`: the field is `readonly StoredMatch[]` (`remittances.ts:356`)
   and nothing on the base, 0b6e90eb or c49367c5 writes it (#126's `interest.matches.push` is a copy of its own,
   `interestState`).
6. **A person's reopen crossing the stage write (review round 1; two sessions).** In
   `apps/worker/src/reconcile/pass-deadlock.db.test.ts` (new): a written-off case line L whose ledger entries move it in
   the pass, in a case C with other event lines ordered before L. Session B runs `reopenLineAction`'s two statements
   with a hook between them: its `UPDATE case_line` (taking C), then holds. Session A runs the pass; its `insertStages`
   takes L's head and waits on C. B then runs its `INSERT line_status` (waits on L's head): a deadlock. Asserted: when
   PostgreSQL aborts A's statement, the savepoint retry re-issues it, B commits, the pass completes and its rows equal
   those of the **reference interleaving** (as in 1, encrypted text by its decrypted hash included); when it aborts B, B gets `40P01` and the pass's rows equal the
   pass alone. **`seq` by order, not value (review round 3):** here `line_status` rows and `line_status_head.seq` are
   compared by their ordinal in `seq` order, not by `seq` value, because a rolled-back statement keeps the sequence
   values it drew (5.2): when A is the victim, its aborted attempt drew a default for every row it formed and a head
   `nextval` for each existing head, so its retried rows carry higher values than the reference's; when B is the
   victim, B's lost default is drawn after A's statement has drawn all of its own (the case lock is taken AFTER
   STATEMENT), so only stage rows the pass writes later would shift. The order is the same in both cases. CAS-49.1
   keeps exact `seq` values. **The reference interleaving (review round 2).** Not "the pass run after B alone": the retried pass's
   reads (`caseLines`' `open`, `remittances.ts:142`, and the responses, unmatched and patient-share reads) were all
   taken while L was written off, so it never searched L, where a pass run after B would search L and could match a
   new claim to it (correct either way: the next pass reconciles L, 5.1 step 1). The reference is the same pass from
   the same template with B's two statements committed from session B at a hook placed after the stage sync's read and
   before its first stage insert (in `referencePass`, before `per-line.ts`' first `insertStage`), so B's
   `line_status` row stands ahead of the pass's event for L in `seq` order; B blocks on nothing there (the pass holds
   neither C nor L's head yet: the world writes no payer response or submission on C in the pass, since
   `payer_response_refresh_case` and `submission_refresh_case` update the case, which the deadlock setup needs free as
   well), and the test fails if B waits more than its `lock_timeout`. The world also holds a
   new claim that pairs with L, so that a retry which re-read L as open would differ from the reference and fail; in neither case is a stage event written twice or out of `n` order. The victim is forced each way with
   `deadlock_timeout` set per session. **Fails first** with `insertStages` without the savepoint (the pass's
   transaction aborts).

### CAS-50: a pass's statements and decrypts do not grow per line

`apps/worker/src/reconcile/pass-bounds.db.test.ts` (new). A step-7b-shaped practice at 200 and at 800 lines (LED-06's
SYNTHETIC segments, as CAS-42.3 seeds them), one pass each through `reconcilePractice` with a counting proxy over the
scope's client (the probe's method) and a counting wrapper over `PracticeCipher.decrypt`:
- the candidate statements (`controlCandidates` and the patient search's (a) and (b); the candidate's separate
  `loadedAt` read is gone, review round 2) and the search's own `claimLines` calls (`passCandidates`, one per round with unread candidates) are at most
  `2 + 2 × rounds` (review round 3) and do not change between 200 and 800 lines; the pass's other `claimLines` calls are
  exactly the base's three practice-wide ones (`chainContext` in `matchClaims` and in `recoupReversals`, `remittances.ts:907` and :978 at 0b6e90eb, and in
  `shares`, `postings.ts:285`, through `settleMatches` at :335), counted apart and
  asserted equal to 3 at both sizes (completeness check 2: a test that bounded every `claimLines` call by
  `2 + 2 × rounds` would fail the build's correct code; the candidate measured 4 calls in all, 3 + 1 round with
  candidates, against the base's 2N + 3). **How the calls are told apart (review round 5).** Every caller issues the
  same `claimLines` text (`remittances.ts:425-435`), and `passCandidates` calls it inside its own module, so neither
  the text nor a spy on the export can attribute a call; the proxy attributes by position in the issued statements.
  Each round of `passCandidates` issues `controlCandidates` and then, if it has unread candidates, `claimLines`
  (:351, :363), and the loop ends on a round with no candidates (:377), so the search's own calls are exactly those
  issued between the first and the last `controlCandidates` statement; `rounds` is the count of `controlCandidates`
  statements; `matchClaims`' `chainContext` comes before the first, and `recoupReversals`' and `shares`' after the
  last, where a per-line fallback in `reprocessingOf` (:797) would also land and fail the count of 3. The count of 3
  holds because the world holds a standing approved claim match when `recoupReversals` runs (the step-7b shape writes
  the approvals in the pass, and its matches are re-read after `matchClaims`, :1190-1192): without one,
  `recoupReversals` returns before its `chainContext` (:974-977) and the correct count is 2, on the base as well; the
  test asserts that precondition (a standing approved claim match after `matchClaims`) before it asserts 3, so a
  later change of world fails on the precondition, not on correct code;
- the patient search's statement selects no `service_line` column (review round 2: the test parses its outer select
  list, which names only `c.id`, `c.remittance_id`, the `to_char` payment date, the load time and
  `c.patient_control_number`; no `ARRAY(…)` over `service_line`); `patientPairs` selects only the pair's claim and
  index, and its parameter pairs are only pairs whose decrypted patient control numbers are equal (review round 3);
- `line_status` inserts: exactly one statement;
- decrypts of `claim.patient_control_number`: at most one per claim of the practice per pass phase (the search, the
  postings), plus `caseLines`' one per case line;
- the posting and EFT rows never matched: two statements each (the `EXCEPT` and the read by ID), whatever the size,
  and the `EXCEPT` returns exactly as many IDs as rows the second reads (D15: no history of IDs reaches the worker);
- no candidate statement's text names `ledger_match` (D16: the exclusion's cost cannot depend on that table's
  statistics; if slice 3 takes D16's fallback, the patient search's two statements, (a) and `patientPairs`, are excepted by name and the PR
  says so; completeness check 2),
  every table alias in every search statement ((a) and (b) included) carries a `practice_id = $1` predicate (D11, review round 1: the test
  parses each `FROM`/`JOIN` alias of a table, not of `unnest`, from the statement text), and the patient search's parameter arrays hold at most the practice's claim matches whose claim is not
  in that line's chain (`lineChain`'s claims): reversed matches (a person's unmatch among them) and standing matches
  whose claim has no line paired with the case line (corrected in the review: "non-standing" missed the last kind);
- `insertMatch` and `insertEntry` are exactly as many as today's; the claims of a remittance are read once per
  remittance (D7), and the other per-row posting reads (`remittancesOf`, the named claim's lines) are as many as today's.
**Fails first** on the base: 2 candidate statements and 2 `claimLines` calls per line, 2 stage inserts per line, and
31 decrypts per line in the search.

### CAS-51: a real-size pass

`apps/worker/src/reconcile/pass.large.db.test.ts` (new): the step-7b shape (CAS-42.3's seeding, approvals and postings
in one pass) at `TP_LARGE_RECONCILE_LINES` (default 2,000), in the CI `db` shard, timed, with the advisory-lock sampler:
- the pass completes, writes N approved and N posted entries and 2N stage events, and every line reaches recovered;
- the pass's time stays under `PASS_BUDGET_MS` (120,000), and its own part (the pass less its ledger_entry insert
  statements, which the test's statement proxy times) under `OWN_BUDGET_MS` (40,000; section 8.4); the own part's time
  per line at N is
  at most 1.5 times its time per line at N/4 (both measured in the same test), so a per-line query returning fails it
  without a slow runner flaking it, while the ledger triggers' growth (Lane A's, 14.1) cannot;
- peak heap under 75% of the worker's limit.
- the shape: one case per code as CAS-42.3 seeds it, and a second pass of the same test on F's shape (all 2,000 lines
  in one case, the scenario's `reconcileClaims`/`FIXED_RATE`/`reprocessing()`), since the case refresh and the
  `ledger_match` exclusion bite hardest there (section 1.7). F's form shares the budgets.
- (review round 3) a third pass on **spread A's shape** (the probe's `seed.mts`: 20 dates, so a code-date group grows
  with N, at N/4 and N): the patient search's elements (statement (a)'s rows, (b)'s parameter pairs and returned
  pairs) per open line at N at most 1.5 times those at N/4, and the own part's per-line ratio at most 1.5. Spread R's
  group size is a constant 16 and F spreads its dates over the year, so neither shape sees a term that grows with a
  code-date group; this one does. **Fails first** with round 2's `ixs` form (its elements grow with the group, about
  4 times between 500 and 2,000). Spread A's form shares the budgets (the candidate's spread A at 2,000: 47 s on
  cc3dd7f6, 1.7).
The weekly release-capacity run (1b's step 7b, F at 10,000 lines after D14) is its full-size form. **Fails first** on the
base: on cc3dd7f6 its own part took 122.8 s on spread R at 2,000 against a 40 s budget (the pass 158.7 s less its
inserts 35.9 s), and on F 609 s (619.8 less 11.2); its per-line time grew 2.3 times between 2,000 and 6,000 at 83d71fd6
(measured; the ratio between 500 and 2,000 is the test's own).

### Tests updated, not added
D14's three (section 8.4): `apps/worker/src/reconcile/reconcile.large.db.test.ts` (CAS-42.3: `PASS_BUDGET_MS` 60,000,
its comment's paragraph about growing faster than its lines and the `candidatesFor` reference in `lineOf`'s comment);
`tools/release-capacity/checks.test.ts` (the Known gap line's new fixed words, `KNOWN_GAP` and `KNOWN_GAP_REVISIT`);
`tools/release-capacity/scenario.test.ts`: its `FULL_SIZE` assertion (line 91: `reconcileLines: 10_000`) **and**
(completeness check) its test "seeds F, not A, at CAS-42.3's 2,000 lines" (lines 366-384 at cc3dd7f6), which holds
`FULL_SIZE.reconcileLines` equal to CAS-42.3's `TP_LARGE_RECONCILE_LINES` default "so the two cannot drift apart" and
names 2,000 four more times (`toBe(2_000)`, `lines` and `built.lines` lengths, `practiceClaims(2_000, …)`): with
D14 the two sizes part on purpose (CAS-42.3 keeps 2,000, F goes to 10,000), so the test's title says F at its own
full size, the coupling becomes `FULL_SIZE.reconcileLines` is 10,000 and at least CAS-42.3's default (read by the same
regex: the weekly step is the full-size form of CAS-42.3's and CAS-51's 2,000), and the literals become
`FULL_SIZE.reconcileLines`.
`checks.test.ts`' `PASSING` fixture (line 110: `postedLines` and `reconcileLines` 2,000) and its numbered examples
(lines 505-533) are a report's inputs, not the scenario's size, and stay as they are.
New unit test (not a CAS row; it backs CAS-49's settle rule): `apps/worker/src/reconcile/settle-order.test.ts`
(D6's `checkPostedBefore` against today's prefix filter, fast-check, fixed seeds). Unchanged and passing:
`ledger.db.test.ts`, `chain.db.test.ts`, `payment-terms.db.test.ts`, `ledger-oracle.db.test.ts`,
`lines.db.test.ts`, the export tests and the report's tests (CAS-41's `streamed.db.test.ts` among them) pass unchanged on
the candidate (section 15, probe T1). **The screens share the changed code too (completeness check):** the web's
Reconciliation routes run the manual actions through `@tp/worker/ledger` (`apps/worker/src/reconcile/public.ts`;
`apps/web/src/lib/routes/reconciliation.ts:3`), and the Reconciliation and dashboard queries read `unmatchedItems`,
`casePatientBalance` and the ledger totals from it (`apps/web/src/lib/reconciliation/queries.ts:19`,
`apps/web/src/lib/dashboard/queries.ts:5`), which reach `lineChain` (D5); so
`apps/web/src/lib/routes/reconciliation-routes.db.test.ts` and the web's reconciliation and dashboard tests are in the
build's suite (slices 4 and 6), unchanged and passing, beside CAS-49.4 and the `lineChain` index test above. Not run in
the review (T1 and R1 ran the worker's); run in the completeness check on 0b6e90eb against the shared cluster:
`reconciliation-routes.db.test.ts`, `dashboard.db.test.ts`, `home-figures.db.test.ts`, 3 files, 18 tests pass.

### Test matrix rows (`docs/product/test-matrix.md`, after CAS-48; `packages/synth/src/cases/matrix.ts` word for word)

| ID | Title | Expected |
| --- | --- | --- |
| CAS-49 | A reconcile pass writes what the per-line pass wrote | On generated passes at the posted and at the deposited proof level with corrections, reversals, recoupments, payer responses, partial postings, EFT deposits, patient share and reopens, and on LED-01 to LED-18's worlds, the pass writes the same ledger matches, entries, stage events, payer responses, notifications and audit events, in the same order where order is observable and with the same text in every encrypted note, as the per-line pass; a line's payer approved and recovered written in one statement keep their order and checks |
| CAS-50 | A reconcile pass's reads do not grow per line | Between 200 and 800 lines the pass's candidate searches and claim-line reads stay a fixed number of statements, none of them reads the ledger's matches, its stage events are one statement, and it decrypts each claim's patient control number at most once per phase |
| CAS-51 | A reconcile pass at real size | A step-7b pass of 2,000 lines, spread over cases, in one case and on few service dates (more on the weekly run) approves and posts every line within its time budget, its own part (the pass less the ledger's entry inserts) within its own budget and at most 1.5 times as slow a line at 2,000 as at 500, under 75% of the worker's heap |

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
candidate's step-7b pass takes 53-60 s on this 4-CPU container in either schema state at 83d71fd6 (46 s on spread R
and 22 s on F at cc3dd7f6), plus the setup (about 10 s of
seeding through the job code at 2,000), so CAS-51 fits a shard beside its other files. It does not need the 8-CPU runner. **Completeness check 2:** since
review round 3 CAS-51 runs three shapes (spread R, F, spread A), each at N and N/4 for its per-line ratio: by the
measured 2,000-line passes (46 + 22 + 47 s on cc3dd7f6), about a quarter of that again at 500, and about 10 s of
seeding per 2,000-line world, the file is about 3 to 3.5 minutes on 4 CPUs, estimated, not measured. A private
repository's db shards run on 2-CPU runners under a 20-minute job timeout (`.github/workflows/ci.yml:301`) and already
hold CAS-41's and CAS-42's real-size files (5 to 11 minutes each locally, `vitest.config.ts`' `SLOW_FIRST` comment); a
shard is chosen by the hash of a file's path, so `pass.large` may land beside one of them. Slice 5 records the file's
time on CI from the shard's results and, if its shard nears the timeout, says so in the PR for the orchestrator (the
shapes are not cut without a ruling: each guards a different term, section 7). 6,000 and 10,000 are for the weekly run (`TP_LARGE_RECONCILE_LINES`).

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

### 8.3a On cc3dd7f6 (review re-measure, 2026-11-06): step 7b on F, and A's full month

Shape F with the other tenants present, the candidate 0b6e90eb, one case (`cap3-results-rev/summary.md`; one run each
above 2,000):

| lines | pass s | % of 900 s | ledger_entry inserts s | pass less those inserts s (ms a line) | `ledger_line_net` s | heap peak MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2,000 | 21.8 | 2.4% | 10.3 | 11.4 (5.7) | 3.3 | 113 |
| 6,000 | 94.5 | 10.5% | 61.1 | 33.5 (5.6) | 27.2 | 123 |
| 10,000 | 220.2 | 24.5% | 161.2 | 59.1 (5.9) | 74.3 | 138 |
| 30,795 (A's month) | 1,653.1 | 184% | 1,468.9 | 184.2 (6.0) | 715.6 | 271 |

- 30,795 is practice A's actionable lines in 1b's run (its record), the size step 7b reconciled before it moved to F.
  The fit `aN + bN²` over 2,000 / 6,000 / 10,000 projected 1,641 s; the run took 1,653 s (61% of the 45-minute job
  wait, 184% of the reconcile job's 900 s attempt).
- 89% of that pass is the ledger_entry triggers: `ledger_line_net` 716 s (14.1), and, new, `ledger_entry_rules`' match
  lookup 581 s at 857 M buffer hits (9.4 ms a call): with `ledger_match` never analyzed its generic plan is an Index Scan
  on `ledger_match_standing` with `id` as a Filter, so each call reads every standing match of the practice, quadratic
  (1.7 s at 2,000, which is why 14.1 did not show it). For Lane A (14.1).
- The candidate's own part is linear: 5.6-6.0 ms a line from 2,000 to 30,795.
- **Every growth term at A's month, by owner (completeness check, from the run's `functions.tsv` and `pss.tsv`):** of
  the 1,468.9 s of ledger_entry inserts, `ledger_entry_within_line` 718.8 s (all but 3 s of it `ledger_line_net`,
  715.6 s; 14.1), `ledger_entry_rules` 603.2 s (581 s its match lookup; 14.1), `ledger_entry_within_evidence` 81.1 s,
  `ledger_line_stage` (through `line_status_ledger_rules`, D3's one statement) 8.4 s, the rest (`ledger_match_rules`
  18.6 s on the match inserts, the RLS and key checks) linear. `within_evidence` grows: its posted-so-far sum
  (`SELECT coalesce(sum(x.amount_cents), 0) … ledger_entry p WHERE p.evidence_id = row_id …`, once per posted entry)
  took 0.47, 0.47, 0.77 and 2.41 ms a call at 2,000, 6,000, 10,000 and 30,795 lines (92 to 401 buffer hits a call),
  so 0.9 / 2.8 / 7.7 / 74.1 s: about N^1.5 past 10,000, small next to the two above, handed to Lane A with them
  (14.1, measured, plan not yet read). The pass's own families (searches 4.8 s, `claimLines` 3.4 s, the one stage
  insert 11.8 s, the match inserts 63.2 s, TypeScript 37 s) are each linear (per line within 10% of 2,000's).
- **A's real month, not F at A's size (basis).** The 30,795-line run is F's shape at A's actionable count: one case,
  F's fixed rate, F's reprocessing, the other tenants' claims present. Step 7b moved back to A would differ in two
  ways, neither measured: A's 30,795 actionable lines sit in A's cases by pattern (several cases; after D3 a case
  refreshes once per statement, so the count of cases adds one `case_rules` call each, 0.3 s for one case of 30,795
  lines), and A holds 100,000 lines of claims of its own, not 30,795, which the two search statements and `claimLines`
  read practice-wide: linear (D1, D2, 8.3), so at most about 3.3 times their 9.9 s here, under 35 s more. The ledger
  triggers' part depends on the practice's ledger and its entries, which are the actionable lines' either way. So A's
  month is bounded by the 1,653 s measured plus about 35 s; the build's step-7b move (Lane A's trigger PR) measures it.
- `candidates.passControl`'s two statements took 0.3, 2.2, 5.8 s at 2,000 / 6,000 / 10,000 but 2.7 s at 30,795: small
  and noisy, no risk to the attempt; the build EXPLAINs it at 10,000 (slice 3).
- Every figure is one run on the 4-CPU container (two at 2,000); a CI runner may differ.
- **Every shape and size, measured or extrapolated, with its basis (completeness check).** On cc3dd7f6: F at 2,000,
  6,000, 10,000 and 30,795 (above); spread R and spread A at 2,000 (1.7); shape P at 2,000 (F's, `cap3_fx_2000_*_p`:
  approvals 8.1 s, postings 13.5 s on the candidate). Not re-run on cc3dd7f6, taken from 8.3 at 83d71fd6 state (c),
  which is 1b's migration applied by hand and so the base's schema (1b changed no worker file the pass runs except the
  lock and pool, 12.1): R at 6,000 and 10,000 (candidate 378.3 and 1,058.4 s; own part 30.8 and 57.4 s), spread A at
  6,000 (421.6 s; own part 37.5 s), P at 6,000 and 10,000 (31.1 and 48.2 s). Spread A at 10,000 and above, and P above
  10,000, were not run anywhere: spread A's own part is linear (5.7 and 6.3 ms a line at 2,000 and 6,000, so about
  63 s at 10,000) and its ledger-trigger part is R's (the same inserts per line, 421.6 against 378.3 s at 6,000), so A at
  10,000 is about R's 1,058 s on the candidate, with 14.1's fixes not measured on it (R at 2,000: 43.7 → 19.2 s); P's
  whole pass is linear on the candidate (4.9, 5.2 and 4.8 ms a line at 2,000, 6,000 and 10,000), so it extrapolates by
  the line. None of them is a weekly step. A's real month is bounded above (basis above).

### 8.4 Budgets (reset by this item, D14: 1b has landed)

SUITE-CAP-1's rule: a budget is 2.5 times the measured figure, so a step whose attempt is 900 s must measure at most
360 s.
- **CAS-51 (new):** step 7b at 2,000 lines. `PASS_BUDGET_MS` **120,000** for the whole pass (2.5 times spread R's 46 s
  on cc3dd7f6; F measures 22 s). `OWN_BUDGET_MS` **40,000** for the pass less its ledger_entry insert statements (2.5
  times the 15 s measured at 83d71fd6; 11-13 s on cc3dd7f6), and the per-line ratio of that part between 500 and 2,000
  lines at most 1.5. The own-part checks fail first if a per-line query returns; the whole-pass budget catches a
  trigger regression. When Lane A's 14.1 lands, its PR lowers `PASS_BUDGET_MS` from its own measurement.
  (Was, at 83d71fd6: 150,000 from 60 s.)
- **CAS-42.3 (1b's, shape P's postings pass at 2,000, merged):** keeps its default 2,000 lines; `PASS_BUDGET_MS`
  150,000 → **60,000** (2.5 times the 22.8 s measured when the candidate was merged onto cc3dd7f6, rounded up; 15.9 s on
  the candidate merged with #126); its comment's paragraph that the pass "grows faster than its lines" and `lineOf`'s
  `candidatesFor` reference are rewritten to cite ADR 0087. (Was, at 83d71fd6: 35,000 from 13.3 s in state (a); the
  merged base's figure decides.)
- **Step 7b of the weekly release-capacity run (`tools/release-capacity`, 1b's):** stays on F, a practice of its own,
  at **10,000** lines at full size (`FULL_SIZE.reconcileLines` 2,000 → 10,000; `SMALL_SIZE` keeps 600): measured 220 s,
  24.5% of the attempt, 4.1 times inside it; by the fit the 360 s bound is reached at about 13,300 lines. Its
  expectation: attempt 1 completes within 360 s. What enforces it (completeness check, `checks.ts` at cc3dd7f6): the
  run's existing red check on a measured job completed on a later attempt than its first (`checks.ts:446-452`) stays the
  only failing condition, at 900 s; the 360 s is the sizing bound this design chose F's size by, not a new red check (a
  runner's speed varies by about 1.2 times between 1b's two CI runs, and a red check at 40% of the attempt would flake
  on it); `knownGap` keeps printing the run's time, share and seconds to spare, so a run past 360 s shows in the line.
  The build measures F's added setup at 10,000 (seeding, parse and triage at the worker's 0.5 vCPU) on the first weekly
  run and records it. Basis (completeness check): the probe seeded F at 10,000 through the same job code in 33 s on 4
  CPUs (original 835s 2.6 s, price 10.1 s, triage 4.8 s, the two reprocessing 835s 15.7 s; `cap3-results-crit/queue.log`)
  against 7 s at 2,000 (`cap3-results-rev/queue2.log`): about linear. The worker is one Node process, so its 0.5 vCPU
  at most doubles the worker's own share of that (an upper bound of about 70 s), far inside each job's 45-minute wait
  (`run.ts` `JOB_WAIT_MS`). The pass itself: its TypeScript between statements is 11 s at 10,000 (8.3a's run), so the
  0.5 vCPU adds at most about that, 220 → about 231 s, inside the 360 s bound; the first weekly run's figure decides,
  and the Known gap line prints it.
- **The Known gap line stays, reworded** (`checks.ts` `KNOWN_GAP` and `KNOWN_GAP_REVISIT`, and `checks.test.ts`): the
  reconcile at A's full month is measured at 30,795 lines in 1,653 s, held by the ledger triggers (`ledger_line_net` and
  `ledger_entry_rules`' match lookup), which are Lane A's; revisit when Lane A's trigger fixes land: moving step 7b back
  to A's full month is that PR's acceptance step (ADR 0087). The build writes the exact words and puts them to the
  orchestrator with the draft PR (an operators' line; no customer reads it).
- **Why not move step 7b back to A's month in this item (D14):** 1b's hand-off and ADR 0083 named it this item's
  acceptance step, but measured it would fail every weekly run's attempt check (1,653 s against 900 s) whatever the
  runner, and no worker change reaches the 89% that is the ledger triggers. The candidate's own part at A's month is
  184 s. **With both of Lane A's trigger fixes as 14.1 now writes them (completeness check), measured on the
  candidate: 309.9 s at A's month in F's shape (34.4% of the attempt, 2.9 times inside it; 50 s inside the 360 s bound),
  writes identical at 10,000.** A's real month adds at most about 35 s (8.3a's basis: A's 100,000 lines of claims
  read by the linear searches), so about 345 s, inside 360 s with little to spare; `ledger_entry_within_evidence`
  (75.6 s of the 310, growing; 14.4 item 12) is the next term to take, and Lane A's PR re-measures A's month on its own
  base (after #126) before the move. (The review's figure "1,001 to 207 s at 10,000 on 83d71fd6" was spread R's and
  its form gives nothing on F, 14.1.) **For the orchestrator to rule in the
  review:** accept this split (recommended), or hold this item's merge until Lane A's trigger PR, or move step 7b
  back now and accept a red weekly run. **Recorded ruling (completeness check 2):** the item's status file records the
  orchestrator's ruling of 2026-11-06 22:31 UTC: the split, step 7b on F at 10,000 lines for now, and the condition that
  step 7b moves back to A's month once Lane A's corrected `ledger_line_net` and `ledger_entry_rules` lookup merge (in
  ADR 0083's dated note and the hand-off to Lane A). The ruling predates review rounds 1-4, which changed none of the
  figures it rests on (1,653 s at A's month, 220 s at F 10,000, 310 s with both fixes); the orchestrator confirms it
  when the reviewed design is committed, and the build writes it into D14 and ADR 0087's text as ruled.
- **Memory:** peak heap 157 MiB at 10,000 against 560 (28%) at 83d71fd6; 138 MiB at 10,000 and 271 MiB at 30,795 on
  F (48%); live heap after the pass 37 MiB, as the base.
- **Which form these figures are of (review round 3).** Every time and heap figure above, and the about 345 s bound,
  were measured on the candidate's patient search (one statement, the outer `EXISTS`, linear in what it returns).
  Round 2's `ixs` form was never measured by this design and is withdrawn (section 4: it returned Σ g × g' elements,
  about 9.5 M on spread A at A's month, and a skeptic's reduced-schema probe took 181.5 s at 6,000 lines). The build's
  two-statement form keeps the candidate's statement (a) and adds (b), whose input and output are the pairs equal
  by patient control number (linear), so the budgets are expected to hold; they are not restated until slice 3
  re-measures heap and search time on spread A at 10,000 and on F at A's month size (30,795) with the build's form.
  If either differs from the candidate's by more than 10% in search time or 25 MiB in peak heap, 8.3a, this section
  and the ask's "about 35 s more" are restated from the new run before the draft PR.
---

## 9. Files

| File | Change |
| --- | --- |
| `apps/worker/src/reconcile/remittances.ts` | D1, D2, D5 (section 4) |
| `apps/worker/src/reconcile/stages.ts` | D3 (with its savepoint and `40P01` retry) |
| `apps/worker/src/reconcile/postings.ts` | D6 (as `checkPostedBefore`), D7, D15 (the `EXCEPT` form) |
| `apps/worker/src/reconcile/settle-order.test.ts` | new (unit): D6's `before` equals today's prefix filter for any standing order |
| `apps/worker/src/reconcile/test-support/per-line.ts` | new: today's text of every function this item changes and `referencePass`, the CAS-49 reference (section 4) |
| `eslint.config.js` | `**/test-support/per-line` added to `restrictedImports`' patterns (message citing ADR 0087), and a test-file override (`**/*.test.ts`, `**/test-support/**`) re-declaring the rule with the existing patterns only (review round 3; section 4) |
| `apps/worker/src/reconcile/per-line-import.test.ts` | new (unit): the ESLint API on fixture text, as `packages/model-gateway/src/lint.test.ts`: a production file importing `per-line` by `./`, `../` or the package path fails, a test file passes (review round 3) |
| `apps/worker/src/reconcile/pass-equality.db.test.ts` | new: CAS-49 |
| `apps/worker/src/reconcile/pass-bounds.db.test.ts` | new: CAS-50 |
| `apps/worker/src/reconcile/pass.large.db.test.ts` | new: CAS-51 (spread R, F and, review round 3, spread A) |
| `docs/adr/0087-…md` | new (D12; and D14's split: step 7b stays on F at 10,000 until Lane A's trigger PR moves it back) |
| `docs/adr/0083-…md` | a dated note under "The weekly run's memory line and step 7b, 2026-11-04": step 7b's move back to A is now Lane A's trigger PR's acceptance step, F at 10,000, see ADR 0087 (an accepted ADR takes dated notes, never a rewrite) |
| `apps/worker/src/reconcile/reconcile.large.db.test.ts` | CAS-42.3 (1b's, merged): `PASS_BUDGET_MS` 150,000 → 60,000; its comment's "grows faster than its lines" paragraph and `lineOf`'s `candidatesFor` reference rewritten (D14) |
| `tools/release-capacity/scenario.ts` | `FULL_SIZE.reconcileLines` 2,000 → 10,000; F's comment (lines 72-79, 103, 110) to say step 7b stays on F until Lane A's trigger PR (D14) |
| `tools/release-capacity/run.ts` | step 7b's comment (lines 94-96, 714) to the same; no change to what it runs (D14) |
| `tools/release-capacity/checks.ts` | `KNOWN_GAP`, `KNOWN_GAP_REVISIT` and the comment above `knownGap` (D14, section 6); `knownGap`'s margin print unchanged |
| `tools/release-capacity/checks.test.ts`, `scenario.test.ts` | the new fixed words; `FULL_SIZE`'s `reconcileLines: 10_000` (line 91); the "seeds F" test's coupling to CAS-42.3's default and its 2,000 literals (lines 366-384, section 7) |
| `docs/runbooks/ci.md` | lines 72-73, the Known gap paragraph ("step 7b reconciles F … at CAS-42.3's 2,000 lines, not A's month, until SUITE-CAP-3 lands and moves it back"): F at 10,000 lines, the move back now Lane A's trigger PR's (D14; completeness check) |
| `vitest.config.ts` | `SLOW_FIRST`: `pass\.large\.db\.test\.ts` beside `reconcile\.large` (line 47 at cc3dd7f6); `tools/test/db-shards.test.ts` re-run (12.1) |
| `apps/worker/src/reconcile/pass-equality-manual.db.test.ts`, `line-chain-index.test.ts` | new: CAS-49.4 (the manual actions, twin worlds) and CAS-49.5 (unit, D5's index against the filter form) |
| `apps/worker/src/reconcile/pass-deadlock.db.test.ts` | new: CAS-49.6 (a person's reopen crossing `insertStages`, two sessions; review round 1) |
| `docs/product/test-matrix.md` | CAS-49 to CAS-51 rows (shared document; LANES.md rule 6) |
| `packages/synth/src/cases/matrix.ts`, `registry.ts` | the same rows word for word; three `none(…)` entries |
| `tools/screening-capacity/watched-paths.txt` | regenerated only if `watched.ts --write` changes it |
| `fixtures/synthetic/**` | regenerated by `pnpm synth --all` only if the registry change requires it (no files are added) |

Not touched: `packages/ledger/src/**`, `packages/db/**` (no migration, no function file), `pass.ts`, `ledger.ts`,
`manual.ts`, `patient-share.ts`, `public.ts`, `statement-html.ts`, `statements.ts`, the report, the web app, #42's
freeze list (`runtime.ts`, `config.ts`, `jobs/platform.ts`, `tools/screening-capacity/{run,report}.ts`), 1b's other
files (`stage-head.db.test.ts`, migration 20261109090000), and every file #126 changes except `remittances.ts`
(section 12.2).

---

## 10. Risks

| Risk | Guard |
| --- | --- |
| A filter of the pass-level search drifts from the per-line definition (a written-off line searched, a reversed unmatch matched again, a same-remittance claim taken). | CAS-49's generated passes cover each filter; the per-line reference is kept (D13); ADR 0087 says a new filter goes in both. |
| The chain's claim order sorted in TypeScript differs from `ORDER BY` on a tie (same date, same microsecond). | The tie-break is the UUID, compared as lower-case text, which is PostgreSQL's byte order; CAS-49 generates claims loaded in the same transaction (one `created_at`). |
| The multi-row stage insert reorders rows. | `ORDER BY e.n` over `WITH ORDINALITY`; the `seq` values were compared exactly against the base's (section 8.3); CAS-49.3. |
| One statement of a whole month's stage events is too big. | 20,000 rows at 10,000 lines took 4.8 s and the pass's peak heap stayed at 157 MiB (section 8.3); arrays are four parameters; no limit is near at 100,000. Chunking is the fallback (2.3 C). |
| The patient search's server-side join grows on an adverse spread (many lines on few dates). | Measured on spread A at 2,000 and 6,000 (section 8.3); it is a hash join on code and date, inside one statement, and no decrypt grows with it. A patient-control-number equality hash would remove it (section 14.3), not needed at the measured sizes. |
| The per-line predicate is evaluated, or its results returned to the worker, for every (claim, line) pair of a code-date group (g × g'), as round 2's `ixs` form did (review round 3). | Statement (a) stops at the first passing line per claim; statement (b) takes only pairs equal by decrypted patient control number (section 4); CAS-51's spread-A pass bounds the elements per open line between N/4 and N, and fails on the `ixs` form; slice 3 re-measures spread A at 10,000 and F at 30,795 before the budgets are restated (8.4). |
| A production file imports the per-line reference (`test-support/per-line.ts`), bringing back per-line decrypts and the quadratic search with no failing check (review round 3). | Slice 1's `no-restricted-imports` pattern on `**/test-support/per-line` for non-test files and its lint fixture test (section 4). |
| Memory: the pass's claim-line map and candidate lists live for the pass. | Peak heap measured at each size (section 8.3), under 75% of 560 MiB at 10,000; CAS-51 asserts it. D16's `matched` set is filtered to the open lines' pairs (review round 4), so it does not grow with the practice's claim-match history (the measured runs had none; unfiltered it would hold about 65 MiB after a year at A's rate). |
| The interest fix (#126) lands first and its `seq` order exposes an order difference. | The insert order is today's (5.2); the merged tree already passes LED-23 to LED-25 and the oracle (R5); whoever merges second re-runs CAS-49 with LED-23 to LED-25 and the `seq` order (section 12.2). |
| D16's patient-search arrays grow with a practice's reversed claim matches and get a poor plan. | They hold only the matched pairs `known` does not already exclude; slice 3's gate measures 2,000 of them; the fallback is the candidate's correlated `NOT EXISTS`, once per pass (37-60 ms in all five statistics states, 1.7), never a TypeScript-only patient exclusion, which would widen decrypts (review round 1). |
| D3's one statement takes all event lines' head rows before their cases, the reverse of the web reopen and triage, which take case then head outside the `ledger:` lock (review round 1). | A savepoint around `insertStages` re-issues the same statement on `40P01` (section 4, 5.2); CAS-49.6 crosses a reopen with the pass both ways; the reopen taking the `ledger:` lock by `pg_try_advisory_xact_lock` and refusing while a pass holds it (the reopen never makes a blocking wait, review round 4) is handed to the web owner (14.4 item 14); other web writers of rows a running pass locks, the line's write-off among them, still can wait for the length of a pass (on the base as well), handed on with it (review round 5); so can the web's five manual reconciliation actions, which take the blocking `ledger:` lock in the request (`manual.ts` `begin()`), handed on with the same remedy and a `55P03` mapping wherever `lock_timeout` is the floor (review round 6); the floor is set only in those writers, around the statement that waits, never in `withPracticeScope`, which the gateway, the capacity harness and the worker's test worlds also use, and the try-lock's refusal is worded generally, since another person's manual action also holds the key (review round 7). |
| The chain's claim order compares the payment date as text, which sorts as the date only under an ISO `DateStyle` (review round 1). | The two search statements select `to_char(r.bpr16_date, 'YYYY-MM-DD')` (section 4); the base's other `::text` dates share the assumption, handed on (14.4 item 13). |
| Step 7b at F 10,000 adds setup time and disk to the weekly run. | Measured on the first weekly run and recorded; F at 10,000 is 220 s of the pass, 24.5% of the attempt; the smoke size keeps 600. |
| The weekly run's step 7b stays off A's full month after this item, against ADR 0083's "acceptance step". | Measured (8.3a): A's month fails the attempt whatever the worker does; the Known gap line says so with the figure, and Lane A's trigger PR carries the move back; the orchestrator rules on the split in the review (8.4). |
| CAS-49 flakes or passes wrongly on settle's partial postings, whose amounts follow random match IDs on the base (5.2). | The settle rule of section 7 (replay in each side's own order, totals compared), `settle-order.test.ts` for D6, and exact `seq` comparison once #126 lands. |
| D15's never-matched read grows with the practice's history. | It runs in the server as one `EXCEPT` and returns only the never-matched IDs (R7: 1.2-1.6 s at 1,000,000 rows of history, no worker heap); CAS-50 checks it returns no more IDs than rows it reads. |
| The ledger triggers' part keeps a first large pass slow until Lane A acts. | Measured and handed on with its DDL (14.1); the budgets in 8.4 say which part is whose. |
| Lane A's two fixes bring A's month to 310 s, but A's real month (more claims, several cases) and `ledger_entry_within_evidence`'s growth leave little of the 360 s bound (completeness check). | 8.3a's basis bounds the real month at about 345 s; 14.4 item 12 hands `within_evidence` to Lane A with its figures; Lane A's PR re-measures A's month on its own base before the move back, and the Known gap line keeps printing the margin. |
| A `ChainContext`'s `matches` changed after D5's index is built would give a stale chain. | The field is `readonly`; nothing writes it on the base, 0b6e90eb or c49367c5 (section 7, CAS-49.5); the index test holds two equal arrays apart. |

---

## 11. The builders' slices, in order

1. `test-support/per-line.ts` (today's text of every function the item changes, copied, and `referencePass`, section
   4) and CAS-49's harness against it, green on the base code (the new code still the old), with section 7's settle rule (the replay in each side's order for a check with two or more
   allocated check-level postings in one pass; the generator must produce one) run 20 times on the base against
   itself without a failure, which proves the rule absorbs the base's random order. CAS-49.1's generator includes the
   control-number candidate that pairs with nothing beside a pairing patient claim (review round 3), and the harness's
   six self-check mutants are written here, with the comparison of encrypted text by decrypted hash (review round 4: never by presence; the generator's proof-level and reversal move-backs; the sixth mutant gives the proof-level move-back the reversal note), with the proof level fixed by run index (review round 5: even runs at posted, odd runs raised to deposited before the pass; the harness checks that both levels ran, that a posted run moved a line to recovered from a posted entry matched in the pass, and that run 1 holds both move-backs). The import guard on `per-line` (`eslint.config.js` and
   `per-line-import.test.ts`, section 4; review round 3), `pnpm lint` green.
2. D3 (`insertStages`, under its savepoint with the `40P01` retry, section 4; review round 1) with CAS-49.3 and
   CAS-49.6 (the two-session reopen, both victims; `seq` compared by order there, review round 3); CAS-49 green.
3. D1, D2 and D16 (`passCandidates`, the claim-line map, `reprocessingOf`'s argument; the exclusion from the pass's
   set: TypeScript in the control search, parameter arrays plus TypeScript in the patient search); CAS-49 and LED-01 to
   LED-18 green. Of `d1-ts-exclusion.diff` (a measured reference, not a patch) only the control-search hunk and
   `passCandidates`' call site are taken; its patient-search hunk never is (review round 4): the patient statements get
   D16's arrays or the correlated fallback. "The TypeScript form" below is that diff's measured time, a baseline only.
   (Review round 4, nit) `matched` is built only from the claim matches whose `serviceLineId` is an open line's: a `Set`
   of the open lines' service-line IDs first, then the filter, so the set is bounded by the open lines, not the
   practice's match history; every lookup of it is by a searched (open) line, so the exclusion is the same. Gate for D16's array form: the probe's 1.7 D16 matrix re-run on it (F with the other tenants, 7b and P,
   `ledger_match` unanalyzed, analyzed empty, 100,000 other-tenant matches) plus F with 2,000 reversed claim matches,
   each within 10% of the TypeScript form's time with equal writes; if not, the candidate's correlated `NOT EXISTS` in
   the patient statement (D16's fallback, review round 1: never the TypeScript-only patient exclusion), with CAS-50's
   text check excepting the patient search's two statements ((a) and `patientPairs`, which both carry it) and the PR saying so. EXPLAIN `controlCandidates` at 10,000 lines (8.3a).
   D11's predicates added to the candidate's statements (`s.practice_id = $1` in both `named` branches,
   `q.practice_id = $1` in `probe`, and, review round 1, `practice_id = $1` on `remittance r`, `claim o`, `case_line x`,
   `service_line xl`), and `to_char(r.bpr16_date, 'YYYY-MM-DD')` for `paid_on` in both statements; (review rounds 2 and 3)
   the patient statement's `codes` and `dates` arrays and its separate `loaded_at` statement removed, and the second
   statement `patientPairs` (b) added (section 4; never round 2's `ixs` array, withdrawn in round 3), with the
   TypeScript re-check of since, remittance, code and date removed, `seen` kept after `preferredCandidates`, and
   CAS-50's select-list check and `2 + 2 × rounds` bound; then heap and search time re-measured on spread A at 10,000
   and F at 30,795 with this form, and 8.3a, 8.4 and the ask's "about 35 s more" restated if they differ (8.4); the gate's runs include them: F and R at 2,000 within 10% of the candidate's
   21.8 / 46.0 s, and the EXPLAIN at 10,000 shows no plan regression from the added predicates; decrypts (the search
   phase's set equal, CAS-49) and writes equal.
4. D5 to D7 and D15's `EXCEPT` form (replacing the candidate's two ID reads), with `checkPostedBefore` and
   `settle-order.test.ts`; CAS-49, CAS-41 (`streamed.db.test.ts`) and the report's tests green, and the web's tests that reach the changed code
   (`reconciliation-routes.db.test.ts`, `dashboard.db.test.ts`, `home-figures.db.test.ts` and the web's reconciliation and
   dashboard tests, section 7; completeness check 2); the probe's P shape at
   2,000 and 6,000 re-run with the `EXCEPT` form in the pass's own trap state (the candidate's TypeScript form took
   `postings.rows` 0.6 / 5.6 s on the base's anti-join, 1.6, and the candidate's TypeScript form 8-10 ms at 2,000 and
   34 ms at 10,000; the `EXCEPT` form must stay linear and within twice the candidate's figures, writes equal).
5. CAS-50 (its `claimLines` calls attributed by position between the `controlCandidates` statements, with the standing approved claim match asserted before the count of 3; review round 5) and CAS-51 (all three shapes: spread R, F and spread A, review round 3), `pass.large` in `SLOW_FIRST` with `tools/test/db-shards.test.ts` re-run (12.1; completeness check 2); CAS-49.4 (manual actions) and CAS-49.5 (`lineChain`'s
   index); the matrix rows and the registry; `pnpm synth --all` if needed; ADR 0087 and ADR 0083's dated note.
5a. D14 (1b has landed): CAS-42.3's `PASS_BUDGET_MS` and comment in `reconcile.large.db.test.ts`; in
   `tools/release-capacity`, `FULL_SIZE.reconcileLines` 10,000 and the comments in `scenario.ts` and `run.ts`, the Known
   gap words in `checks.ts` with `checks.test.ts` (and `scenario.test.ts`: the `FULL_SIZE` assertion at line 91 and the
   "seeds F" test's coupling and literals at lines 366-384, section 7); `docs/runbooks/ci.md`' Known gap paragraph;
   `checks.test.ts`, `scenario.test.ts` and CAS-42.3 green; the release-capacity smoke size run locally once (it runs F
   at 600).
6. The full local suite (the item prompt's list), then the draft PR; the payment-engine review, then the security
   review (tenancy, PHI reads, decrypt counts, logs, with SUITE-CAP-1a's concurrency-and-capacity lens).

---

## 12. Merge interplay

### 12.1 With SUITE-CAP-1b (merged: #110, f7d609cc, on the base cc3dd7f6)
- Done: the candidate merged cc3dd7f6 cleanly (0b6e90eb, no conflicts, no fixes); 1b's `reconcile.large.db.test.ts`
  (CAS-42.3) and `stage-head.db.test.ts` pass on it.
- 1b's section 5 replaced `line_status_rules()`; D3's multi-row insert runs under it on the base now (CAS-49.3 keeps the
  per-body check only for the body on the base; its "apply 1b's section 5 when the base lacks it" half is not built).
- D14 is this item's (1b landed first): section 8.4's resets, built in slice 5a. `vitest.config.ts`' `SLOW_FIRST`
  holds `reconcile\.large\.db\.test\.ts` (line 47 at cc3dd7f6), so `pass\.large\.db\.test\.ts` goes beside it, and
  `tools/test/db-shards.test.ts` is re-run (slice 5).
- Shared documents (test-matrix, `matrix.ts`, `registry.ts`): keep both sides' rows, then `pnpm synth --all`.

### 12.2 With the interest fix (draft PR #126, `co-001/ledger-interest-once`, head c49367c5; Lane A's schema work)
Read on c49367c5 (its merge base with the base is f7d609cc): it changes `remittances.ts`, `ledger.ts`, `public.ts`,
`statement-html.ts`, the chain, ledger, payment-terms and ledger-oracle db tests, `chain.large.db.test.ts` (new, with
its `CLAIM_LINES` copy), `interest-chains.ts` (new), `packages/ledger/src/{stages,interest}.ts` and migration
20261110090000 (`ledger_match.seq` and `ledger_match_by_seq`, `ledger_match_rules()`, the new BEFORE INSERT trigger
`ledger_entry_within_interest`, `ledger_entry_sign`). Of its code this item changes only `remittances.ts`; #126 does not
touch `postings.ts` or the worker's `stages.ts`. **Shared files besides (completeness check, from `git diff --name-only`
cc3dd7f6...c49367c5):** `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts` (both add
rows: the second to merge keeps both sides' rows, then `pnpm synth --all`), `tools/screening-capacity/watched-paths.txt`
(#126 adds `interest-chains.ts` and `packages/ledger/src/interest.ts`: the second regenerates it with `watched.ts
--write`, never by hand); and #126 changes `apps/worker/src/report/streamed.db.test.ts` (CAS-41, which this item relies on
for the report path, 12.3) and `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` and its `ledger-world.ts`
(section 7's screens tests): if #126 is first, this item's suite runs #126's versions of both; this item changes
neither. #126 does not touch `vitest.config.ts`, `stryker/shards.json`'s worker files or `tools/release-capacity`.

**`remittances.ts`, function by function.** #126's hunks: the imports, the header comment, `RemittanceOutcome`,
`CHAIN_ORDER` (now `ORDER BY m.seq`), `Counts`, `AdjustmentRow` (moved to `interest-chains.ts`), `namedLines`,
`providerAdjustments`, `claimInterest` (removed) and `reconcileRemittances`. This item's: `CandidateRow`,
`CANDIDATE_FILTERS`, `candidatesFor` (replaced by `Candidate`, `inChainOrder`, `controlCandidates`,
`patientCandidates`, `passCandidates`), `standingByLine` (new, beside `reversalRule`), `lineChain` (one line),
`reprocessingOf` (its optional argument), `candidateClosure` and `chainOrdered` (removed), `matchClaims` and
`matchCandidate`. **No function is changed by both.** Checked: `git merge-tree` of 0b6e90eb with c49367c5 is clean,
and the merged tree (scratch clone `cap3-rev`, detached 8ad075a1, never pushed) typechecks (worker `tsc` exit 0), and its reconcile and report db tests pass, 18 files, 206 of 206, among them
`interest.db.test.ts` (LED-23 to LED-25), `chain.large.db.test.ts` (LED-25 at size, `CLAIM_LINES` planned),
`ledger.db.test.ts` (LED-01 to LED-18), the ledger oracle, CAS-41 and CAS-42.3 (pass 15.9 s; probe R5). That is not
yet the CAS-49 equality proof, which the build adds. The semantic touch points, each resolved by the second to merge as follows:
- `chainMatches` (`CHAIN_ORDER`, #126's) feeds `context.matches`, which this item's `matched` set (D16) and
  `standingByLine` (D5) read. Neither depends on the order (the set is a set; D5 keeps the array's order, whatever it
  is), so either order of landing needs no edit; CAS-49 re-run proves it.
- `ledgerMatches` (`ledger.ts`, #126's: `ORDER BY m.seq`; `NewMatch` split into an interest variant): this item calls
  `insertMatch` with claim matches only, unchanged; `settleMatches` (D6) keeps the loop's order, which after #126
  follows `seq` (the posted entries then follow insertion, not random IDs, so CAS-49 may compare them in `seq` order
  instead of as a set once #126 is on the base, and the partial check-level amounts become deterministic too, 5.2;
  CAS-49's replay rule then becomes an exact comparison; whoever merges second makes that switch).
- `Counts` gains `interestTakenBack` (#126's); this item never builds a `Counts`.
- `claimLines`: **its SQL is unchanged** in this item; #126's `CLAIM_LINES` (in `chain.large.db.test.ts`) equals the
  statement in `remittances.ts` on the base and on 0b6e90eb word for word (compared; only the closing delimiter
  differs), so `CLAIM_LINES` stays valid whichever lands first. If a later change to either side alters `claimLines`'
  SQL, that PR updates `CLAIM_LINES` too.

**Who resolves what.**
- **If this item lands first:** #126 merges the base in; its `remittances.ts` merge is textual-clean (above); it re-runs
  its own equality proof and LED-23 to LED-25 on top of this item's search, and `chain.large.db.test.ts` as is. Nothing
  of this item's needs changing; Lane A owns that merge.
- **If #126 lands first:** this item merges the base in (a merge commit, never a rebase), keeps #126's hunks whole and
  `interest-chains.ts` untouched, and re-runs the equality proof: CAS-49.2 adds LED-23 to LED-25's worlds; CAS-49
  compares `ledger_match` by `seq` values and order (not insertion order), and the posted and deposited entries in
  `seq` order (no longer as a set); the probe's 2,000-line equality pairs (F, R, A) are re-run base against candidate
  on the merged base with the dumps ordered by `ledger_match.seq`; LED-01 to LED-18, LED-23 to LED-25 and the ledger
  oracle pass byte for byte. Lane B owns that merge.
- **The schema queue:** Lane A's trigger fixes (14.1) are a second schema change and go after #126 (one schema PR at a
  time); this item adds none, so it never waits on #126 and #126 never waits on it.
- Its `ledger_entry_within_interest` trigger returns before any query for a non-interest entry, so it adds no growth
  term to 1.5 or 8.3a (re-read on c49367c5 in the completeness check: `root := NEW`, then `IF root.stage <> 'interest'
  THEN RETURN NEW`; a correction reads its target and the target's target by primary key first).
- **Its `ledger_match_rules()` (completeness check).** Its new interest branch reads `ledger_match` for a standing claim
  or interest match of the line and claim (`c.practice_id = NEW.practice_id AND c.service_line_id = … AND c.claim_id = …
  AND c.kind IN ('claim', 'interest') AND c.reversed_at IS NULL`) once per interest match: on a `ledger_match` the
  planner has never seen analyzed (every pass's own rows, 1.7) it has the same plan risk as `ledger_entry_rules`' match
  lookup (14.1; `ledger_match_standing` is partial on `reversed_at IS NULL` and leads with `kind`). It runs once per
  interest match, not per line, and none of this item's shapes has a PLB L6, so it is not measured here; for #126's
  owner (Lane A), proposal 14.4 item 11. Its claim, posting, deposit and recoupment branches read by primary key only,
  as on the base.
- **Its `ledger_match_by_seq` (completeness check).** A second index leading with `practice_id` on `ledger_match`
  (`(practice_id, seq)`, unique). `ledger_entry_rules`' match lookup (14.1) was measured on the base, where its generic
  plan took `ledger_match_standing`; on #126's base it has one more index to choose by the RLS qual alone, so Lane A's
  trigger PR (after #126) measures 14.1's two fixes on #126's base, not on these figures. The lookup fix (14.1, by
  primary key alone) does not depend on which index the old form chose.
- Its `interestState` adds one practice-wide `ledgerEntries` read and its `recordInterest` an O(D·C·M) loop when PLB L6s
  exist; neither is touched here (proposal 14.4).

### 12.3 Shared code (the report path)
`claimLines` and `chainContext` are unchanged; `lineChain`'s answer is unchanged (D5). CAS-41 (`streamed.db.test.ts`,
the whole read against the batched report) and the report's tests pass on 0b6e90eb and are in the build's suite.

---

## 13. ADR

ADR 0087 is needed (D12): the rule "a reconcile pass reads per pass, never per open line, and writes in the order the
rules define" binds every later change to the matching step, and CAS-50 enforces it. It also records D16 (no candidate
statement reads `ledger_match`; the exclusion comes from the pass's set) and D14's split (step 7b stays on F at 10,000
lines until Lane A's trigger PR moves it back to A's full month, with the figures of 8.3a); ADR 0083 takes a dated note
pointing here. Title: "Reconcile a practice with
reads per pass, never per open line, writing in the rules' order".

---

## 14. Handed on, and kept out (each with why)

### 14.0 Index or table: none in this item
This item needs **no index, no table, no column and no migration**. Its gain comes from reading per pass and writing in
one statement; D16 removes the search's dependence on `ledger_match`'s statistics without an index; D15 finds unmatched
export rows without one. `claim_by_superseded` is 1b's D15, on the base since #110. Measured and rejected as indexes:
`ledger_entry (service_line_id, stage)` (no gain, 14.1) and 1b's `ledger_match (practice_id, claim_id,
service_line_id) WHERE kind = 'claim'` (never used, 1b's record). What remains is two ledger **function** bodies, not
an index or table: `ledger_line_net` and `ledger_entry_rules`' two match lookups, both measured with exact DDL in the
completeness check (14.1: F at 10,000 lines 219.1 → 84.9 s, F at A's month 1,653.1 → 309.9 s, writes identical). Both
are for Lane A, queue behind #126, and need a founder freeze exception (14.1). `ledger_line_stage` is no longer asked
(14.1).

### 14.1 For Lane A (needs a founder freeze exception: it changes a ledger table or function)

**What:** the ledger_entry triggers' per-line sums. `ledger_entry_within_line()` calls `ledger_line_net(line, …)` three
times per approved, posted or deposited entry; its body LEFT JOINs `ledger_entry` twice on conditions that only apply
to reversals and adjustments (`e.stage IN ('reversed', 'adjusted') AND t.id = e.evidence_id`), which the planner can
only use as join filters. Planned on a ledger without statistics (a fresh deployment, a first large practice, and
always within the pass's own transaction, whose rows `ANALYZE` cannot see), each join is a sequential scan of the
practice's whole ledger per call (auto_explain: `Seq Scan on ledger_entry t … rows=3995.00 loops=1` twice per call,
12.8 ms a call at 2,000 lines; `cap3-results/diag/cap3_r_2000_c_diag.plans.txt`). After this item's worker fix it is
90-95% of a step-7b pass.

**Completeness check (2026-11-06): the first form below does not reach F; the recommended DDL is now this.** Measured
on cc3dd7f6, shape F with the other tenants, the candidate 0b6e90eb, 10,000 lines, the first form (state (m)) left
`ledger_line_net` at 87.1 s against 74.6 s without it (no gain). F's cost is not the two joins (F has no reversal or
adjustment entry, so they never match) but the line's own read: `EXPLAIN (GENERIC_PLAN)` of the body as the trigger
runs it (role `tp_app`, `app.practice_ids` set, a copy of the F seed whose ledger was never analyzed) reads
`ledger_entry e` through `ledger_entry_by_date` with only the RLS practice qual as Index Cond and `service_line_id = $1`
as a Filter, so every call reads every entry of the practice (650 M index tuples fetched at 10,000 lines). On an empty,
never-analyzed table every index the practice qual can use costs the same and the planner takes `ledger_entry_by_date`;
the first form's "service_line_id scan … linear per call" (below) was wrong on F. The recommended form gives the read the
line's practice as an equality and an `ORDER BY e.seq` that `ledger_entry_by_line (practice_id, service_line_id, seq)`
returns for free, so that index (both its leading columns as Index Cond) is the cheaper path whatever the statistics
(the same EXPLAIN shows it), and keeps the first form's primary-key reads of a correction's target:

```sql
CREATE OR REPLACE FUNCTION public.ledger_line_net(line uuid, counted text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(sum(x.amount_cents), 0)::bigint
    FROM (SELECT e.amount_cents, e.stage, e.evidence_id
            FROM ledger_entry e
           WHERE e.practice_id = (SELECT l.practice_id FROM service_line l WHERE l.id = line)
             AND e.service_line_id = line
           ORDER BY e.seq) x
   WHERE CASE WHEN x.stage IN ('reversed', 'adjusted')
              THEN (SELECT CASE WHEN t.stage = 'adjusted' THEN (SELECT r.stage FROM ledger_entry r WHERE r.id = t.evidence_id) ELSE t.stage END
                      FROM ledger_entry t WHERE t.id = x.evidence_id)
              ELSE x.stage END = counted
$function$;
```

The same answer for every line and stage: every entry of a line carries the line's practice (an entry is of a case of
its practice and of a line of that case, `ledger_entry_rules` lines 35-40, for every entry written in scope; review round
4: an entry outside `app.practice_ids` skips those checks only because `ledger_entry_tenant`'s `WITH CHECK` then refuses
it, migration `20261023120000`:731-735 and `practice_in_scope`'s comment, `20261016090000`:119-120, and every role, the
owner included, is `NOBYPASSRLS`, `migrate.test.ts`:138-148, so only a superuser, who could as well disable the
triggers, could store a mismatched row; a case line is of its case's practice and of a
priced line of its own service line and practice, `case_line_belongs`), so the added equality drops no entry; the sum of
integers does not depend on the order; a correction counts as the stage of the entry it finally corrects, as in the
first form. A line not visible under the scope gives no practice and so 0, as the base gives 0 for a line whose entries
are not visible.

**What the plan rests on, and its guard (review round 1).** The practice equality and the nested `ORDER BY e.seq`
change no answer; they are there only so the planner takes `ledger_entry_by_line` on an unanalyzed ledger, and the
lookups below rest on `reversed_at IS NULL` staying out of the query. A later "simplification" would bring back the
716 s (A's month) or 581 s term, and no correctness test and no per-PR budget would fail (CAS-51 at 2,000 has the room).
So Lane A's PR (a) says this in the migration's comment above each body, and (b) adds a db test: `EXPLAIN
(GENERIC_PLAN)` of `ledger_line_net`'s inner read and of both `ledger_entry_rules` lookups, as `tp_app` with
`app.practice_ids` set, on a ledger with rows that was never analyzed, asserting the index each uses (`ledger_entry_by_line`
with both leading columns as Index Cond; `ledger_match_pkey`), not the plan's text, so it holds across planner versions
(PostgreSQL 18; `GENERIC_PLAN` exists since 16). **Tied to the deployed bodies (review round 4).** EXPLAIN takes
statement text, so a copy kept in the test would keep planning well after a later migration changed the body. The test
therefore takes each statement from `pg_get_functiondef` of the installed function: the migration writes a marker comment
before each of the three statements (`-- plan-guard: line-net-read`, `-- plan-guard: correction-match`,
`-- plan-guard: reversal-match`), the test cuts the statement that follows each marker, replaces the plpgsql variables
and the function's argument by `$1`, `$2` (`GENERIC_PLAN` plans those), and fails if a marker is missing, so a body
edited without its guard fails as surely as a slow plan. (Rejected: auto_explain on a real insert, which tests the
trigger as it runs but needs a superuser's `LOAD` and the server log, which the db project has neither of.) **The
no-statistics state is made and checked, not assumed:** before seeding, `ALTER TABLE ledger_entry SET
(autovacuum_enabled = false)` and the same on `ledger_match`, in the test's own database from the template; before
planning, it asserts `pg_class.reltuples = -1` for both and `pg_stat_user_tables.last_analyze` and `last_autoanalyze`
null, so autoanalyze (50 rows plus 10%) cannot make the old and new bodies plan alike and the test pass vacuously.
**Fails first:** the PR runs the same assertions once on #126's base against today's bodies' statements (marked the same
way in a test-only copy of today's bodies) and records that the line read takes `ledger_entry_by_date` and the lookups
`ledger_match_standing` (C1), i.e. the test fails there. Also (review round 1, nit) a cross-tenant case: `ledger_line_net`
is granted to `tp_app` and callable directly, so the same PR's test calls it as `tp_app` with another practice's line
and asserts 0, written on #126's base so it passes before and after the migration.

**And `ledger_entry_rules`' two match lookups by primary key alone** (the full function is the base's,
`packages/db/functions/ledger_entry_rules.sql`, with exactly these two changes; script
`cap3-probe-crit/state-k.sql`):
- line 49 (a correction's match): `NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.id = NEW.match_id AND
  m.reversed_at IS NULL)` becomes `(SELECT m.reversed_at IS NULL FROM ledger_match m WHERE m.id = NEW.match_id) IS NOT
  TRUE`: no row, or a reversed match, raises as before;
- line 77 (an entry's match): `SELECT * INTO matched FROM ledger_match m WHERE m.id = NEW.match_id AND m.practice_id =
  NEW.practice_id AND m.reversed_at IS NULL; IF NOT FOUND THEN` becomes `SELECT * INTO matched FROM ledger_match m
  WHERE m.id = NEW.match_id; IF NOT FOUND OR matched.practice_id IS DISTINCT FROM NEW.practice_id OR
  matched.reversed_at IS NOT NULL THEN`, raising the same error.
Same rows refused with the same errors (a match of another practice is invisible under RLS either way, or present and
refused by the practice test). Cause, by the same EXPLAIN: with `m.reversed_at IS NULL` in the query the planner can
take the partial `ledger_match_standing (kind, evidence_id, service_line_id) WHERE reversed_at IS NULL` with `id` as a
Filter, a scan of every standing match; without it, only `ledger_match_pkey` fits (`Index Cond: (id = $1)`).

**Measured, both together and apart** (state nk = both; k = the lookups alone; m = the first form with k; F with the
other tenants, the candidate 0b6e90eb; `cap3-results-crit/`):

| shape, lines | pass, candidate | k | m | m + k | n | **n + k (recommended)** | `ledger_line_net` cand → nk | `ledger_entry_rules` cand → nk | ledger_entry inserts cand → nk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| F 10,000 | 219.1 s (24.3%) | 160.0 s | 229.6 s | 172.1 s | 128.1 s | **84.9 s (9.4%)** | 74.6 → 2.0 s | 58.4 → 4.0 s | 161.3 → 29.1 s |
| F 30,795 (A's month) | 1,653.1 s (184%) | | | | | **309.9 s (34.4%)** | 715.6 → 6.2 s | 603.2 → 14.4 s (lookup 581 → 0.4 s) | 1,468.9 → 141.5 s |
| R 2,000 | 43.7 s | | | | | **19.2 s** | 26.0 → 2.5 s | 1.8 → 1.3 s | 33.3 → 8.6 s |

(n is the recommended `ledger_line_net` alone; m, the review's first form, is worse than nothing on F.) Writes
identical to the candidate's at F 10,000 in k, m + k and n + k (`compare2.py`, 102,907 rows: 20,000 matches, 20,000
entries, 40,000 stage events with their `seq` values) and at R 2,000 in n + k (20,635 rows; encrypted text compared by
presence only, `dump.py:12`, harmless here as F and R write no note, review round 4). One run each, 4 CPUs, the
private cluster as 8.3a. At A's month, n + k is 310 s, inside the 360 s
bound; what remains of its inserts is mostly `ledger_entry_within_evidence`, 75.6 s (its posted-so-far sum, 2.3 ms and
about 400 buffer hits a call; its generic plan on an empty ledger reads `ledger_entry_by_evidence` by `evidence_id`, so
the growth is not that plan choice; cause not found here: Lane A reads it under auto_explain in its PR, proposal 14.4
item 12).

**First form (the review's; measured on spread R at 83d71fd6; superseded on F, above):**

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
(`ledger_line_stage.sql:15-16`); its cost after D3 is 1-8 s a pass (8.2 s at A's month), so it is no longer asked
(completeness check; proposal 14.4, item 7).

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
not the line's own scan, and a planner that sees an empty ledger keeps its sequential scans anyway. Adding `practice_id` to `ledger_line_net`'s predicate (so `ledger_entry_by_line` leads) would not reach the joins either (by the same reading of the plan; not measured). **Superseded (completeness check 2):** this paragraph and "the cost is the two joins, not the line's own scan" are spread R's reading at 83d71fd6; on F the cost is the line's own read (C1), and the recommended form above, which adds exactly that practice equality, is what removes it (`ledger_line_net` 74.6 → 2.0 s at F 10,000). The index stays rejected.

**Its share on cc3dd7f6, shape F, after this item's worker fix** (8.3a; the time the rewrite works on, not a measured
gain on F): `ledger_line_net` 3.3 s of a 21.8 s pass at 2,000 (15%), 27.2 of 94.5 s at 6,000 (29%), 74.3 of 220.2 s at
10,000 (34%), 715.6 of 1,653.1 s at A's month (43%). On spread R at 2,000 it is 26.8 of 46.0 s (58%: R's seed is
analyzed, with `ledger_entry` analyzed empty, a worse plan than F's unanalyzed one). The rewrite's gain was measured
on 83d71fd6 spread R (table above); Lane A's PR re-measures it on F at 2,000, 10,000 and A's month on its own base.

**Queue and exception:** a ledger function change, so a founder freeze exception (granted 2026-11-06 22:40 UTC on the
ask's pre-review text, as the item's status file records; rounds 1, 3 and 4 changed only its proof wording and proof
list, never the two bodies; completeness check 2; asked:
`approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`), one Lane A schema PR after #126 (one schema PR at a
time; #126 changes neither `ledger_line_net` nor `ledger_entry_rules`, so both apply on top of it as written, but it
adds `ledger_match_by_seq`, so Lane A measures them again on its base, 12.2). The proof the amounts are unchanged:
LED-01 to LED-18 and LED-23 to LED-25 byte for byte, the ledger oracle, and the probe's write-equality dumps base
against rewrite (as for state (m), and n + k at 10,000 above), plus a refusal test per changed `RAISE` of
`ledger_entry_rules` (a match of another practice, a reversed match, no match: the same error text and code).
**`ledger_line_stage` is withdrawn from the ask** (completeness check): its rewrite was never run, and its cost after
this item is 8.2-8.4 s at A's month, 2.7 s at 10,000, with or without the fixes above: no measured need for a frozen
function change (proposal 14.4 item 7 keeps it for a later look).

**New in this review, for Lane A beside it: `ledger_entry_rules`' match lookup** (`packages/db/functions/
ledger_entry_rules.sql` line 77, and the `NOT EXISTS` at line 49):
`SELECT * INTO matched FROM ledger_match m WHERE m.id = NEW.match_id AND m.practice_id = NEW.practice_id AND
m.reversed_at IS NULL`. With `ledger_match` never analyzed, its cached generic plan is an Index Scan on
`ledger_match_standing` with `id` as a Filter, so each call reads every standing match of the practice: 581 s at 857 M
buffer hits (9.4 ms a call) of the 1,653 s pass at A's month; 1.7 s at 2,000, which is why 14.1's first table did not
show it. **Completeness check: its DDL and measured gain are above** (the lookups by primary key alone: 581 → 0.4 s at
A's month, writes identical at 10,000), and the ask now asks for it (its part 2, in the same question). Moving step 7b back to A's month
(8.4) needs both fixes: with both, 309.9 s.

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
   D3 its cost was 0.9-2.9 s a pass (8.2 s at A's month with 14.1's fixes), so it is not asked now (completeness
   check: a frozen function changed only on a measured need); Lane A looks at it again if a profile shows it.
8. **The probe's `fillx` control should become a CAS-42 variant**: a seeded database's ledger is empty, so every
   real-size test measures the trigger plans of an empty ledger; a variant with another tenant's committed ledger rows
   would measure what production sees. Lane A, with 14.1.
9. **Lane A, with 14.1: `ledger_entry_rules`' match lookup** (8.3a, 14.1): 581 s at A's month; look the match up by
   primary key alone. Measured in the completeness check (14.1: 0.4 s at A's month); Lane A re-measures it on F at
   10,000 and at A's month on its own base, in the same PR as `ledger_line_net`'s rewrite.
10. **Release-capacity harness:** print, beside the Known gap margin, the step 7b pass's ledger_entry insert share
   (from `pg_stat_statements` or the worker's statement timing), so a trigger regression and a worker regression read
   apart. Lane A's harness owner.
11. **#126's `ledger_match_rules()` interest branch** (completeness check, 12.2): its standing-match check reads
   `ledger_match` by practice, line, claim and kind with `reversed_at IS NULL`, once per interest match, on a table the
   planner has never seen analyzed within a pass: the same plan risk as `ledger_entry_rules`' lookup (a partial
   standing index with the rest as Filter). Not measured (no PLB L6 in this item's shapes). #126's owner, Lane A: an
   `EXPLAIN (GENERIC_PLAN)` of it on an unanalyzed copy, and LED-25 at size (`chain.large.db.test.ts`) with many
   interest matches.
12. **`ledger_entry_within_evidence`'s posted-so-far sum** (completeness check, 8.3a, 14.1): 0.9 / 7.7 / 74.1 s at
   2,000 / 10,000 / 30,795 lines (0.47 to 2.4 ms a call), the largest term left at A's month after 14.1's fixes (75.6 of
   310 s). Its generic plan on an empty ledger reads `ledger_entry_by_evidence` by `evidence_id`, so the cause is not
   that plan choice; not found here. Lane A, with 14.1: auto_explain of the trigger body at A's month before the move
   back, so the move keeps margin under the 360 s bound.
13. **Pin `DateStyle` on every pool connection** (review round 1): the worker compares dates as `::text`
   (`byPayment` and its reversals, `statements.ts:95`, `responses.ts:124`) and about 30 `::text` date selects feed
   `isoDate` Zod schemas, all correct only under an ISO `DateStyle`, which nothing pins (`packages/db/src/connect.ts`
   `openPool` passes no options; only the domain-model generator sets it). This item's new statements no longer depend
   on it (section 4); a pinned `options: '-c DateStyle=ISO,MDY'` in `openPool`, with a db test under a database whose
   default is `'SQL, DMY'`, would close it for every path. A shared-package hardening item; the orchestrator places it.
14. **The web's `reopenLineAction` should not cross a running pass** (review round 1; 5.2; **corrected in review round
   4**): it writes a stage event (`apps/web/src/lib/routes/triage.ts:544`) that the pass's stage sync owns, after locking
   the case, outside the `ledger:` lock, so it can deadlock a reconcile pass (D3's retry absorbs that on the pass's
   side). Round 1 proposed the blocking `lockLedger(scope, practiceId)` first; that is withdrawn. `lockLedger` is
   `pg_advisory_xact_lock` (`apps/worker/src/reconcile/ledger.ts:17`), nothing in the repository sets `lock_timeout` or
   `statement_timeout` (`packages/db/src/connect.ts` sets only the pool's connection and idle timeouts), and a pass holds
   the lock for its whole transaction (219 s at F 10,000, 310 s at A's month with Lane A's fixes), so each reopen on that
   practice during a pass would hold a web request and one of the application pool's 10 connections
   (`apps/web/src/lib/server/pools.ts:10`), shared by every practice's requests, for minutes: a few such clicks could
   starve every tenant. The manual reconciliation actions are no precedent for the blocking form: they run in web
   requests and already make this wait today (corrected in review round 6; the last paragraph of this item). The
   recommendation: at the start of the handler, inside its practice-scoped transaction, `SELECT
   pg_try_advisory_xact_lock(hashtextextended('ledger:' || $1::text, 0))` (the same key as `lockLedger`); if it is not
   granted, refuse at once with a retryable refusal that carries no identifier (the web owner words it, e.g. that
   the ledger is busy and to try again shortly, through the ux-brand review), writing nothing; if granted, the
   reopen holds the lock to its commit, so it serializes with the pass and the manual actions and never waits. The
   lock is held by a pass or by another person's manual action on the practice (the last paragraph of this item), so
   the refusal is general and never says that a reconciliation is running (review round 7). A
   `SET LOCAL lock_timeout` of a few seconds before a blocking lock is the lesser form (it still holds a connection for
   those seconds and turns a wait into an error just the same; set and set back around that one wait, as the last
   paragraph of this item says). Its test: CAS-49.6's two-session shape with the ledger
   lock held by session A, asserting the reopen returns the refusal within a second and writes nothing, and a reopen
   with the lock free succeeds. D3's savepoint retry stays either way (a triage job still takes case then head).
   **The reopen is one of a class (review round 5).** The same starvation reaches every web writer that updates a
   `case`, `case_line` or `submission` row a running pass can hold locked to its commit. The pass locks case rows
   through its stage insert (the AFTER STATEMENT case refresh, `line_status_refresh_cases.sql:14-15`) and through a
   payer response it writes (`pass.ts:41` hands `recordReprocessedNoChange` to `reconcileRemittances`, which calls
   `recordPayerResponse`, `responses.ts:127`; its insert fires `payer_response_refresh_case`, which updates the case).
   `writeOffLineAction` (`apps/web/src/lib/routes/triage.ts:474-512`) runs `UPDATE case_line`, whose statement trigger
   `case_line_refresh_updated` (`case_line_refresh_cases()`) updates the same case row, so a write-off on a case the
   pass has touched waits, with no `lock_timeout`, for the rest of the pass, holding one of the 10 connections. The
   base behaves the same and this item changes neither when nor how long those case locks are held, beyond D3's order.
   For the web owner: inventory the practice-scoped web mutations that update those rows (the write-off and the
   reopen at least) and give each the same `ledger:` try-lock refusal, or, as the floor for all of them, a
   `SET LOCAL lock_timeout` of a few seconds set in each of those handlers just before its first statement that can
   wait on the pass and set back (`SET LOCAL lock_timeout = 0`) just after it, never in `withPracticeScope` itself
   (the last paragraph of this item, review round 7), so no web request waits on a pass; the reopen's test shape above, with the write-off in place of the reopen, is its test. Nothing changes in
   this item's build.
   **The most direct members of the class wait on the `ledger:` lock itself (review round 6).** No job calls the
   manual actions (outside `apps/worker/src/reconcile/manual.ts`, only `public.ts:12` names them); the web runs them
   inside its requests. `matchPostingAction`, `matchDepositAction`, `matchClaimAction` and `reverseMatchAction`
   (`apps/web/src/lib/routes/reconciliation.ts:3`, :182, :203, :228, :260) and `adjustEntryAction`
   (`apps/web/src/lib/routes/specialist.ts:3`, :154) call `matchPostingByHand`, `matchDepositByHand`,
   `matchClaimByHand`, `reverseMatch` and `adjustEntry` through the routes' `manual()` helper
   (`reconciliation.ts:139-159`) in the request's practice-scoped transaction (`withPracticeScope`,
   `apps/web/src/lib/http/invoke.ts:497`), and each action's `begin()` (`manual.ts:46-49`) calls the blocking
   `lockLedger`. So today, on the base as on the candidate, every manual match, unmatch or adjustment on a practice
   during its pass holds a web request and one of the 10 application connections for the rest of the pass. These five
   actions join the web owner's inventory beside the reopen and the write-off, with the same remedy. The preferred
   form leaves `manual.ts` as it is: `manual()` takes `pg_try_advisory_xact_lock` on the same `ledger:` key before it
   runs the action and, if not granted, refuses at once with the same identifier-free retryable refusal, writing
   nothing; if granted, `begin()`'s `lockLedger` returns at once (a session holding an advisory lock is granted it
   again). **The try-lock also refuses between two people (review round 7).** Every manual action's `begin()` holds
   the `ledger:` key to its commit, so with the try-lock a second person's manual action, or a reopen or write-off,
   on the same practice is refused while a first person's action of a few milliseconds holds it, where today it
   waits briefly and succeeds. A retry runs against the state the wait would have seen and the refused action writes
   nothing, so no amount, stage or total changes; the cost is a refusal a person can see, which is why its words are
   general ("the ledger is busy, try again") and never say that a reconciliation is running. The floor keeps
   manual-against-manual serialization (the second action waits milliseconds and succeeds) and bounds the wait on a
   pass; it is the lesser form for the reasons the reopen's paragraph gives. **Where the floor goes (review round 7).**
   The `SET LOCAL lock_timeout` of a few seconds is set only in the affected writers, never in `withPracticeScope`
   (`packages/db`), which the web's other routes, the model gateway for user actors
   (`packages/model-gateway/src/postgres-store.ts:68, :231`), the capacity harness (`tools/release-capacity/run.ts:357,
   :366`; `scenario.ts:372, :524, :567, :584, :593, :657`) and the worker's test worlds
   (`apps/worker/src/reconcile/test-support/ledger-world.ts:114, :141, :154, :181, :217`, which CAS-49 builds on) also
   use, and never in `withJobScope` (`apps/worker/src/jobs/runs.ts:43, :52`), which the reconcile pass runs under, so
   the pass never gives up its own wait. In `manual()` it is set before a blocking `lockLedger` that `manual()` itself
   takes before `run()`, and set back (`SET LOCAL lock_timeout = 0`) once the lock is granted, so the action's
   `begin()` re-acquires it at once and nothing after it runs under the timeout; in the reopen and the write-off it is
   set just before the first `case` or `case_line` update and set back just after it. A transaction-wide timeout would
   also cut short the web's own blocking advisory waits, which map no `55P03` (`case_owner` and `packet`,
   `apps/web/src/lib/cases/workbench.ts:93, :120`; `document_use`, `apps/web/src/lib/contracts/tagging.ts:48`;
   `plan_months`, `apps/web/src/lib/pricing/mapped-plan.ts:61`), and would reach the harness and the test worlds when
   they overlap a pass. Wherever the floor is used (the manual actions, the reopen and the write-off), the same place
   maps SQLSTATE `55P03` (`lock_not_available`) to that refusal: `manual()` maps only `ReconciliationError` today, so
   a timeout would otherwise surface as a generic server error. Their test: CAS-49.6's two-session shape, session A
   holding the `ledger:` lock, asserting `reverseMatchAction` and `adjustEntryAction` each return the refusal within a
   second and write nothing, and succeed with the lock free; two concurrent `reverseMatchAction` requests on different
   matches of one practice, where under the try-lock the second gets the general refusal and its retry succeeds (under
   the floor both succeed); and, under the floor, a web step waiting on `plan_months` or `case_owner` longer than the
   floor still completes, not cut short. No amount changes: each action is atomic and writes the same rows when it
   runs. Nothing changes in this item's build.

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
| T2 | Equality: the base and the candidate from the same seed template, each pass's writes dumped (`dump.py`: ledger matches in insertion order, entries and stage events in `seq` order with their `seq` values, payer responses, submissions, notifications, audit events, source documents, posting rows, cases; new UUIDs by ordinal; ciphertext as set or not, so encrypted text was compared by presence only (review round 4: harmless for these shapes, which hold no move-back or other note, but CAS-49 compares it by decrypted hash); timestamps out; settle's posted entries as a set, with their order rule checked on both) and compared (`compare.py`) | Identical in all seven pairs at 2,000: step 7b in states (a) and (c), spread R; step 7b in state (c), spread A; shape P's approvals pass and postings pass in states (a) and (c) (20,635 rows a 7b or P database, 12,634 after the approvals pass: 4,000 matches, 4,000 entries, 8,000 stage events with identical `seq` values). State (m) (14.1) identical to the base's (c). These shapes exercise corrections, reversals beside their correction, approvals, line-level postings and stages; reversals alone, WOs, payer responses, deposits, partial postings, patient share and reopens are covered by T1's LED-01 to LED-18 and oracle runs and by CAS-49's generated passes in the build |
| T3 | The candidate's sizes: 2,000 / 6,000 / 10,000 lines, states (a) and (c), shapes 7b and P, spread R; spread A at 2,000 and 6,000 | Section 8.3 |
| T4 | Lane A candidates on top of the candidate: (l) an index on `ledger_entry (service_line_id, stage)`; (m) `ledger_line_net` rewritten | Section 14.1: (l) no gain; (m) 1,058.4 → 263.3 s at 10,000, writes identical at 2,000 |
| T5 | Plans: the trigger bodies under auto_explain (P0's), read for 1.5 and 14.1 | `ledger_line_net`'s two whole-ledger joins per call |

**Review probes on cc3dd7f6 (2026-11-06)**, scratch clones `cap3-rev` (the candidate 0b6e90eb), `cap3-base2` (cc3dd7f6),
`cap3-d1` (0b6e90eb plus the D16 TypeScript form); results `cap3-results-rev/` (`summary.md`, per run `.json`,
`.pss.tsv`, `.functions.tsv`, `.tables.tsv`, `.dump.ndjson`; `d1-ts-exclusion.diff`, a measured reference, not a patch,
section 4) and `cap3-results-rev126/`; run logs
`progress/rev-rebase.md`, `rev-measure.md`, `rev-update.md`. New scripts in `cap3-probe/` (README section added):
`seedF.mts`, `runrev.sh`, `queue-rev.sh`, `queue-rev2.sh`, `cluster-pss.sh`, `fill-match.sql`, `fill-entry.sql`,
`summ.py`, `compare2.py`. Private cluster removed at the end.

| Probe | What | Result |
| --- | --- | --- |
| R1 | The candidate merged onto cc3dd7f6 (pushed as 0b6e90eb, a fast-forward through the pre-push hook): typecheck, eslint, unit on `reconcile` and `packages/ledger`, db on `reconcile` and `report` | Clean; 243/243 unit; 179/179 db (LED-01 to LED-18, oracle, CAS-41, CAS-42.3 22.8 s at 2,000, `stage-head`) |
| R2 | Step 7b at 2,000, base against candidate: F with and without the other tenants, spreads R and A, with `pg_stat_statements` | Section 1.7; base F reproduces 1b (620 s); candidate 21-22 s |
| R3 | D16: the TypeScript-set exclusion against the candidate's SQL form, five statistics states, 7b and P | Section 1.7: equal time, decrypts and writes |
| R4 | F at 6,000, 10,000 and A's month (30,795) on the candidate | Section 8.3a: linear own part; 1,653 s at A's month, 89% ledger triggers; `ledger_entry_rules`' lookup found |
| R5 | The candidate merged with #126 (c49367c5) in a scratch clone (local commit 8ad075a1, never pushed): typecheck and the reconcile and report db tests | Clean merge; `tsc` 0; 18 files, 206/206 (LED-23 to LED-25, `chain.large` with `CLAIM_LINES`, oracle, LED-01 to LED-18, CAS-42.3 15.9 s) |
| R6 | `CLAIM_LINES` (c49367c5) against `claimLines`' statement on cc3dd7f6 and 0b6e90eb | Equal word for word |
| R7 (after the review) | D15's three forms (the base's `NOT EXISTS`, the candidate's two ID reads compared in TypeScript, the `EXCEPT`) on tables with `posting_row`'s and `ledger_match`'s keys and indexes, SYNTHETIC random IDs, one practice, 2,000 new rows over 0 / 100,000 / 1,000,000 rows of history (each matched once, plus as many claim matches), unanalyzed and analyzed; and analyzed empty then loaded with 2,000 / 6,000 / 20,000 (scripts `cap3-probe-d15/`, results `results.txt`, `results2.txt`; private cluster, removed) | The same row count from all three in every state (2,000, or the n new rows). At 1,000,000: TypeScript form 1.9-2.5 s and **278-281 MiB** of worker heap; `EXCEPT` 1.15-1.58 s, no worker heap; `NOT EXISTS` 0.3-0.95 s when planned as a hash anti-join. At 100,000: 31-33 MiB, 0.18-0.23 s against 0.07-0.11 s. `EXCEPT` planned `HashSetOp` or sorted `SetOp` in all nine states. The microbenchmark's committed rows did not reproduce the pass's own anti-join trap (1.6, measured on the real pass), so slice 4 re-measures the `EXCEPT` form in the real pass at 2,000 and 6,000 |
| R8 (after the review) | `partialShare` (`packages/ledger/src/allocation.ts`, read only) in both orders of two partial postings of one check (`cap3-probe-d15/pe1.mts`) | Share 5 of a 10-cent check, postings 3 and 3: 2 then 1, or 1 then 2; share 1 of 3, postings 1 and 1: 0 then 1, or 1 then 0. Amounts follow the order; per-line totals equal |

| C1 (completeness check) | `EXPLAIN (GENERIC_PLAN)` as `tp_app` with `app.practice_ids` set, on a copy of the F 10,000 seed (ledger never analyzed): `ledger_line_net`'s body, its corrected form, `ledger_entry_rules`' lookups both ways, `ledger_entry_within_evidence`'s sum | Base and first form read the line's entries through `ledger_entry_by_date` (practice qual only); corrected form through `ledger_entry_by_line` (practice and line); the lookup through `ledger_match_standing` with `id` as Filter, by primary key alone `ledger_match_pkey`; `within_evidence` through `ledger_entry_by_evidence` (14.1) |
| C2 (completeness check) | F with the other tenants at 10,000, the candidate, in states none, k, m, m + k, n, n + k; and n + k at 30,795 (`cap3-probe-crit/`: `state-k.sql`, `state-n.sql`, `state-nk.sql`, `state-mk.sql`, `runcrit.sh`, `queue.sh`; results `cap3-results-crit/`) | 14.1's table; writes identical in k, m + k, n + k at 10,000 |
| C3 (completeness check) | Spread R at 2,000 re-seeded on cc3dd7f6, the candidate with and without n + k (`queueR.sh`) | 43.7 → 19.2 s, writes identical (20,635 rows) |

All scripts and summaries of the review's and the completeness check's probes are also kept, without the dumps, in
`approval-summaries/lane-b-suite-cap-3-wip/` (`probe-rev/`, `probe-d15/`, `probe-crit/`, `results-rev/`,
`results-rev126/`, `results-crit/`), since the scratchpad goes with the container: slices 3 and 4's gates re-run them
from there (`probe-rev/seedF.mts`, `runrev.sh`, `compare2.py`, `results-rev/d1-ts-exclusion.diff`).

Measurement caveats: F was seeded without the harness's scale release (its codes mapped onto release 900001's
therapy codes); the other tenants' claims are inserted, not priced or triaged; the worker ran without the 0.5 vCPU
limit. Base F still reproduced 1b's plan and buffer counts. One mishap, corrected: a first spread-A comparison read the
candidate's dump while it was still being written and showed a false difference; compared after the step's end it is
identical.

Dropped, with why: the base at 6,000 and 10,000 was not re-run for the equality pairs (1,500 to 3,400 s a run; the
2,000-line pairs in both states and shapes, CAS-49's design and LED-01 to LED-18 cover the equality, and the profile
holds the base's times); 20,000 lines (projected, section 8.4); state (b) for the candidate ((a) and (c) bracket it,
and D15's effect is measured in (a) against (c)); state (l) at 6,000 and 10,000 (no gain at 2,000).

---

## 16. After the design review (2026-11-06)

**What came back.** Workflow wf_9dd7a743-340 ran the two adversarial reviews (payment-engine-reviewer; security-reviewer
with SUITE-CAP-1a's concurrency-and-capacity lens), each with a skeptic per finding. **Both returned no report**
(`[null, null]`): neither reached its final answer, so no finding carries a final rating or a skeptic's verdict. Their
working notes were saved (`progress/rev-review-payment-engine.md`, `progress/rev-review-security.md`) with five draft
findings. Each was treated as a surviving finding, checked against the candidate (0b6e90eb) and, where it turned on a
measurement, by probe (R7, R8). "Rating" below is the reviewer's draft rating where it wrote one; "skeptic" is "none
ran". The payment-engine reviewer also verified three claims and found them sound: D2's map equals a fresh
`claimLines` read (the per-claim answer does not depend on which claims are asked together), D3's case refresh is
path-independent (`closed_at` takes `coalesce(OLD, now())`, one `now()`; no history trigger on `"case"`), and D6's
running sum equals the prefix sum, matches skipped by `continue` included.

| # | Finding | Lens | Rating | Skeptic | What was checked | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| PE-1 | `settleMatches`' partial check-level share depends on the standing order, which within a pass follows random match IDs (`ORDER BY matched_at, id`), so CAS-49's "compare settle's entries as a set" is unsound for two or more check-level postings of one check in a pass: the amounts differ by order, not only the `seq`. | payment engine | should-fix (draft) | none ran | `ledger.ts:99-104` (`ORDER BY m.matched_at, m.id`), `ledger_match.id DEFAULT gen_random_uuid()`, `postings.ts:371-377` (`before` from the matches ahead in that order), `partialShare` = difference of half-up cumulative shares. R8: share 5 of 10, postings 3 and 3 give 2/1 or 1/2 by order. Confirmed; it is the base's behaviour (D6 keeps it exactly). | **Taken, corrected.** Not a defect of the design's code; a defect of the test's comparison. 5.2 now says the amounts, not only the order, follow the random IDs; CAS-49 (7) checks such a check's entries by replaying `partialShare` and the caps in each side's own order and compares totals; D6 gets its own order-for-order unit property test (`settle-order.test.ts`, section 4); slice 1 proves the rule against the base 20 times; 12.2: exact once #126's `seq` order is on the base. For Lane A: below. |
| PE-2 | CAS-50's bound "the patient search's arrays hold at most the practice's non-standing claim matches" contradicts D16, which also puts there a standing match whose claim is not in the line's known set. | payment engine | nit (draft) | none ran | `lineChain` (0b6e90eb :733-750): a line's known claims are its own claim and the standing claim matches whose claim has a line paired with it (`caseLinePair`); a standing match without a paired line is not known, so D16 must carry it. Confirmed. | **Taken.** CAS-50's bound reworded (reversed matches, and standing matches whose claim has no paired line); D16 unchanged. |
| SEC-1 | The candidate still writes the `ledger_match` exclusion as a correlated `NOT EXISTS` in both search statements (`remittances.ts:231`, `:280`): D16 is not built, and its parameter-array form is unmeasured. | security | draft, unrated | none ran | Both lines present at 0b6e90eb. The design already says so (1.7: "the candidate at 0b6e90eb still wrote the exclusion as a correlated `NOT EXISTS`"), measured the TypeScript-set form (R3), and makes the array form a build gate with that form as the fallback (D16, slice 3). | **Not taken (no change needed):** already the design's position; the candidate is a probe, and the build writes D16 under slice 3's gate. |
| SEC-2 | `patientCandidates`' `named` CTE reads `service_line` by code and date with no `practice_id` predicate, relying on RLS alone (`remittances.ts:268-270`); `controlCandidates`' `probe` reads `claim q` likewise (`:224-226`). | security | draft, unrated | none ran | Not a leak: the pass's scope sets `app.practice_ids` to exactly the job's practice (`jobs/handlers.ts:12`), RLS is forced, and every output row is a claim with `c.practice_id = $1`; the per-line base correlated its `service_line` read to such a claim. But D11 says every new statement is practice-scoped, and the house rule is a `practice_id` predicate on what a query reads, not only on its output. | **Taken, corrected** (a consistency and defence-in-depth change, not a tenancy fix): D11 and section 4 add `s.practice_id = $1` to both `named` branches and `q.practice_id = $1` to `probe`; same rows by construction; slice 3's gate re-times F and R at 2,000 with them (the predicate can only let `service_line_by_service_date` lead). |
| SEC-3 | D15's `neverMatched` reads every posting (or EFT) row ID of the practice and every matched ID, for all time, into the worker's heap on every pass: unbounded, not measured past one export. | security (capacity) | draft, unrated | none ran | `postings.ts` (0b6e90eb) `neverMatched`: two whole-history ID reads, compared in a `Set`. R7: 278-281 MiB of worker heap and 1.9-2.5 s at 1,000,000 rows of history (31-33 MiB at 100,000), against the worker's 560 MiB and a pass peak of 113-271 MiB. Confirmed, and worse than the reviewer said: at a few years of a large practice's exports it alone could take half the heap. | **Taken, corrected:** D15 becomes one server-side `EXCEPT` (identifiers only, a set operation with no per-row plan, so still statistics-proof): R7 1.15-1.58 s at 1,000,000 with no worker heap, `HashSetOp`/`SetOp` in all nine states. Section 2.4, D15, 4, 5.2, CAS-50 (two statements; the `EXCEPT` returns no more IDs than rows read), risks, slice 4 (re-measured in the real pass at 2,000 and 6,000, since R7's microbenchmark did not reproduce the pass's own anti-join trap). |

**What did not change.** The matching rules, every amount, the order of every write and the recovered totals (D4,
D10); D1-D3, D5, D7, D12-D14, D16; the budgets of 8.4 (D15's `EXCEPT` measured faster than the TypeScript form it
replaces at every size in R7, and the candidate's three `postings.rows` statements took 8-10 ms at 2,000 and 34 ms at 10,000 in the review's runs); CAS-49 to CAS-51's
numbers and titles (the matrix rows' words hold: CAS-49 "in the same order where order is observable"; CAS-50 "a fixed
number of statements"); no index, table or migration (D9). One new file: `settle-order.test.ts` (unit).

**For Lane A, from PE-1 (not this item's to change):** on the base, two or more allocated check-level postings of one
check matched in one pass split a line's share between them by a cent differently from run to run (random match IDs
decide `before`). #126's `ledgerMatches ORDER BY m.seq` removes it (insertion order follows the export's order). Lane
A's #126 could add one LED case that runs such a check twice from one template and asserts identical entries; no
founder decision is needed unless #126 changes that order.

**Verdict after revision:** the design stands, with the four corrections above built in slices 1, 3 and 4. Ready for
the build on the orchestrator's go; the open ruling remains D14's split (8.4), for the orchestrator. (Completeness
check: see section 17, which changes the tests, the hand-off to Lane A and the ask, not D1-D16.)

---

## 17. Completeness check (2026-11-06)

A completeness critic read this design and the freeze-exception ask against: growth terms without a fix or a hand-off;
shapes and sizes without a measurement or a stated basis; 1b's D1, D3 and D14 asks; paths that share changed code
without a test; missing equality cases; #126's interplay; slices a builder cannot build from the text; numbers in the
ask that differ from the design. It ran probes C1-C3 (section 15; private cluster on port 5494, removed) and the web's
reconciliation and dashboard db tests on the candidate (3 files, 18 tests pass). Changes, each in place:

1. **Hand-off to Lane A corrected (14.1, 14.0, 2.5, 0 items 7 and 12, 8.4, 14.4 items 7 and 9).** The review's
   `ledger_line_net` form, measured only on spread R at 83d71fd6, gives nothing on F (10,000 lines: `ledger_line_net`
   74.6 → 87.1 s; pass 219.1 → 229.6 s): F's cost is the line's own read through `ledger_entry_by_date`, not the joins
   (C1). A corrected form (the line's practice and `ORDER BY e.seq`, so `ledger_entry_by_line` is the path whatever the
   statistics) and `ledger_entry_rules`' two lookups by primary key now have exact DDL and measured gain: F 10,000
   219.1 → 84.9 s, A's month 1,653.1 → 309.9 s, R 2,000 43.7 → 19.2 s; writes identical (C2, C3). `ledger_line_stage`
   withdrawn from the ask (never run; 8.2 s at A's month).
2. **The ask rewritten** to that hand-off: the corrected `ledger_line_net`, the whole `ledger_entry_rules` with its two
   changed statements, `ledger_line_stage` withdrawn, every figure equal to 14.1's table, one question for both; the
   first draft's "the rewrite's gain on F has not been measured" and "the match lookup is not part of this ask" are gone.
3. **Growth terms named with owners (8.3a, 14.4 items 11 and 12).** `ledger_entry_within_evidence` (0.9 / 7.7 / 74.1 s
   at 2,000 / 10,000 / 30,795; 75.6 of the 310 s after the fixes) handed to Lane A with its figures; #126's
   `ledger_match_rules()` interest branch named as the same plan risk, for #126's owner.
4. **Sizes and shapes with their basis (8.3a, 8.4).** Which shapes were measured on cc3dd7f6 and which are taken from
   83d71fd6 state (c) and why that holds; spread A above 6,000 and P above 10,000 extrapolated by the line; A's real
   month bounded at about 35 s above F at A's size (A's 100,000 lines of claims, several cases); F's setup at 10,000
   (33 s through the job code, about linear) and the 0.5 vCPU bound on the pass (about 231 s).
5. **D14 buildable from the text (7, 9, 11 slice 5a, 12.1).** `scenario.test.ts`' "seeds F" test (lines 366-384) ties
   `FULL_SIZE.reconcileLines` to CAS-42.3's default and names 2,000 four times: rewritten; `docs/runbooks/ci.md`
   lines 72-73 (the Known gap paragraph) added to the files; `SLOW_FIRST` (`vitest.config.ts:47`) made definite; what
   enforces "attempt 1 within 360 s" stated (the existing later-attempt red check at 900 s, the 360 s printed, no new red
   check).
6. **CAS-49's reference completed (4, 7, 9, slice 1).** `per-line.ts` held only the claim side and `syncLineStages`, so
   D5, D7 and D15 would have been compared new against new: it now holds today's text of every changed function and a
   `referencePass` in `pass.ts`' order.
7. **Shared paths tested (7: CAS-49.4, CAS-49.5, the web).** The manual actions (`manual.ts` calls D2, D3, D5, D6 and
   D7's code) get a twin-world equality file; D5's index gets a unit property test (CAS-41 runs the new `lineChain` on
   both its sides, so it never compared D5); the web's Reconciliation routes and dashboard reads (through
   `@tp/worker/ledger`) named in the suite.
8. **Equality cases added to CAS-49's generator (7).** Each `CANDIDATE_FILTERS` predicate alone, a line with no service
   date, one `created_at` for several claims, a second practice with the same keys, interest as the base pays it,
   never-matched rows of an earlier export and a reversed posting match (D15), a claim reference to another remittance
   (D7). CAS-49.3 no longer describes 1b's section 5 as possibly absent (1b has merged).
9. **#126 interplay completed (12.2).** The files both change besides `remittances.ts` (test-matrix, `matrix.ts`,
   `registry.ts`, `watched-paths.txt`) and who resolves them; #126's changes to CAS-41's test and the web's
   reconciliation test; `ledger_match_by_seq` and why Lane A re-measures 14.1 on #126's base; `ledger_entry_within_
   interest` re-read (no query for a non-interest entry).
10. **One number corrected:** CAS-51's fails-first own part on R, 158.7 − 35.9 = 122.8 s (was 123.4).
11. **Probe records kept (15):** the review's and this check's scripts and summaries copied to
    `approval-summaries/lane-b-suite-cap-3-wip/` (no dumps), so slices 3 and 4's gates do not depend on the scratchpad.

**Not fixed here (for the orchestrator):**
- `ledger_entry_within_evidence`'s cause is not found (C1's plan is the right index); A's month after Lane A's two fixes
  is 310 s measured, about 345 s bounded for A's real month, so the move back has about 15 s of margin under 360 s
  unless Lane A also takes this term. Lane A's to measure (14.4 item 12).
- #126's `ledger_match_rules()` interest branch is not measured (no PLB L6 shape here).
- D14's split remains the orchestrator's ruling; the new figures strengthen the recommended split (the move back is
  reachable, by Lane A's PR, not by this item).
- CAS-49.4's twin-world mocking (`vi.mock` of `./stages`, `./postings` and the changed `./remittances` exports) is a
  test design not yet tried; if `manual.ts`' imports resist it, the builder compares LED-02's and LED-07's manual
  actions against dumps recorded from the base instead (the probe's `dump.py` rows, re-ordered as CAS-49.1's
  insertion-order paragraph says, never by `ctid`; review round 2; encrypted text by its decrypted hash, never `dump.py`'s set-or-not, review round 4), and says so in the PR.
- The figures are one run each on this container; CI may differ (as section 8.3a says).

---

## 18. After the design review (2026-11-06, rounds)

Round 1: the payment-engine and security reviews (the latter with SUITE-CAP-1a's concurrency-and-capacity lens), three
skeptics per finding. Both verdicts: BUILD WITH CHANGES, nothing blocking. Nine findings survived (of 15; corrected from "seven" in completeness
check 2: nine rows below, 4 taken and 5 taken corrected, six refuted); each was checked
against the candidate (cap3-rev, 0b6e90eb against cc3dd7f6) by reading, no probe run in the apply step. Applied in
place in D3, D4, D11, D16, sections 0, 4, 5.1, 5.2, 7 (CAS-49.1, CAS-49.6, CAS-50), 9, 10, 11 (slices 2 and 3), 14.1,
14.4 (items 13 and 14) and in the freeze-exception ask. No change to the matching rules, any amount, the order of any
write, the recovered total, the budgets of 8.4, `packages/ledger/src`, or the schema (no migration, index, table or
grant).

| Round | Finding | Lens | Rating | Skeptics (upheld) | What was checked | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | The ask says the release checks enforce 360 s; the design (8.4) says no check does. | payment engine | should-fix | 3 of 3 | Ask line 186 against 8.4 and `tools/release-capacity/checks.ts` in the candidate: no 360 s or 40% threshold; the only reconcile failures are an incomplete job, `attempts > 1` or unreadable, and a missing heap line (:440-455). | **Taken.** The ask's "What it is for" now reads "310 s, inside 360 s, the 2.5-times margin the capacity work sizes a 900 s job by (no check enforces 360 s; the weekly run fails only when the job needs a second attempt)"; the small-margin sentence kept. |
| 1 | The new `ledger_line_net`'s nested `ORDER BY` and practice equality exist only for the plan, and nothing guards them. | payment engine | nit | 3 of 3 | 14.1 and C1: the base form reads through `ledger_entry_by_date` on an unanalyzed ledger (716 s at A's month); the ask's proof list checks values only; no `GENERIC_PLAN` test in the repo; the same gap for `ledger_entry_rules`' lookups (`reversed_at IS NULL` kept out). | **Taken, corrected** (a skeptic's narrowing: assert the index used, not plan text). 14.1 and the ask: the migration comment says why; Lane A's PR adds an `EXPLAIN (GENERIC_PLAN)` db test as `tp_app` on a never-analyzed ledger asserting `ledger_entry_by_line` and `ledger_match_pkey`. |
| 1 | `inChainOrder` sorts `r.bpr16_date::text` as strings, correct only under an ISO `DateStyle`, which the worker's pool does not pin. | payment engine | nit | 2 of 3 | `remittances.ts:181-193, 226, 271`; `openPool` (`connect.ts:31`) sets no options; only `generate.ts:155` pins it; `paidOn` also feeds `recordNoChange`'s `receivedOn` (:954). The refuting skeptic: the base's `byPayment`, `statements.ts:95`, `responses.ts:124` and ~30 `::text` dates share the assumption, so a DMY run of CAS-49 would fail on base code. | **Taken, corrected.** Both search statements select `to_char(r.bpr16_date, 'YYYY-MM-DD')` (identical text under ISO, so writes and `receivedOn` unchanged; section 4, slice 3, risks). No CAS-49 run under `'SQL, DMY'` (it would test the base's other paths, not this change). Pinning `DateStyle` in `openPool` handed on as 14.4 item 13. |
| 1 | CAS-49's decrypt check should require equality for the search phase, not a subset. | payment engine | nit | 3 of 3 | D16, 5.1 step 3 and 5.2 claim exactly the union; CAS-49.1 asserted a subset only; CAS-50 is an upper bound. Base `candidatesFor` decrypts every row of round 1 for every open line; the candidate's `patientCandidates` decrypts each returned row once (:292-295), so equality is reachable. | **Taken.** CAS-49.1: search phase equal sets; postings phase at most once and within the reference's set (D7). A fourth self-check mutant (`>=` narrowed to `>` on `created_at`) that only the equality catches. |
| 1 | D3's one-statement stage insert takes all event lines' head rows before their cases, the reverse of the web reopen and triage, widening a deadlock window; D4 and 5.2 said the locks were unchanged. | security | should-fix | 3 of 3 | `stages.ts:71-89` (one call at :123), `line_status_rules.sql:21-28` (head first, BEFORE ROW), `line_status_refresh_cases.sql:14-15` (AFTER STATEMENT); `reopenLineAction` (`triage.ts:536-548`) has no `lockLedger`; triage holds only `triage:`. Skeptics' correction: today's window is the first event line of each case, not of the pass. `tp_app` has only `INSERT` on `"case"` (migration `20261019160000`:717), so taking the cases first would need a grant, out of scope. | **Taken, corrected.** D4 and 5.2 now state the changed order and the window (per case). Option (a): `insertStages` under a savepoint, the same statement re-issued on `40P01` at most twice (section 4; never split or reordered); the reopen may get a retryable `40P01`, as today. CAS-49.6 (new file `pass-deadlock.db.test.ts`, two sessions, both victims) in slice 2. Option (b) handed to the web owner (14.4 item 14). |
| 1 | D16's TypeScript-only fallback for the patient search would widen decrypts; the design needs another fallback. | security | should-fix | 3 of 3 | `cap3-results-rev/d1-ts-exclusion.diff` removes the `ledger_match` predicate from the patient statement; the candidate decrypts every returned row (:295) before the TypeScript filter; d1ts decrypts were equal only because the shapes held no reversed claim match (1.7). Skeptics: CAS-49's unmatch case already bites; the fallback conflicts with CAS-50's text check. | **Taken, corrected.** D16, section 0 item 4, section 4, risks and slice 3: the fallback is the candidate's correlated `NOT EXISTS` once per pass (37-60 ms in all five statistics states), never the TypeScript-only patient exclusion; if taken, CAS-50's text check excepts that statement and the PR says so. Generator: a reversed claim match added beside the unmatch (the only new case; the equality check above makes it bite). |
| 1 | D11 promises a practice predicate on every table read, but section 4 lists only `named` and `probe`. | security | should-fix | 3 of 3 | Candidate `remittances.ts`: `remittance r` (:227, :274), correlated `claim o` (:230, :278), the two `ARRAY(…)` reads of `service_line` (:272-273), `case_line x JOIN service_line xl` (:232, :276) carry none; forced RLS means no leak; `remittance` and `case_line` have `practice_id`. Skeptics: should-fix or nit; not a tenancy breach. | **Taken.** D11, section 4 and slice 3 list every alias (`r`, `o`, both `ARRAY` reads, `x`, `xl`; `m` in D16's fallback); same rows by construction; slice 3's EXPLAIN at 10,000 shows no plan regression; CAS-50 checks each table alias has `practice_id = $1`. |
| 1 | Claims committed by a concurrent 835 load during a pass are picked up a pass later. | security | nit | 3 of 3 | `pass.ts`: plain `BEGIN` (READ COMMITTED), `loadExports` before `lockLedger`; intake and parse_835 never take `ledger:`; the candidate searches once up front. Next pass: `monitor/job.ts:86`, `triage/job.ts:35`, `intake.ts:224`, `monitoring-schedule.ts:51`, singleton keys `registry.ts:95`. | **Taken.** 5.1 step 1 says such a claim is reconciled by the next pass and names what queues it; no amount, rule or total changes; CAS-49 has no concurrent writer. |
| 1 | The ask has no cross-tenant test for `ledger_line_net`, which `tp_app` can call directly. | security | nit | 2 of 3 | `ledger_line_net.sql:23` grants EXECUTE to `tp_app`; STABLE, INVOKER, forced RLS: another practice's line gives 0 before and after; no test calls the function directly. The refuting skeptic: nothing changes and the proof list is about amounts. | **Taken, corrected** (the upholding skeptic's form): one test in Lane A's PR, written on #126's base so it passes before and after; one line in the ask's proof list and in 14.1; the rest of the ask unchanged. |
| 2 | The patient search returns every line's code and service date of every returned claim (`ARRAY` `codes`, `dates`) to the worker before the patient filter, which the base never read; 5.2's "no more PHI-bearing rows" and the limit "PHI reads as today" do not hold. | security | should-fix | 3 of 3 | Candidate `remittances.ts:272-273` (both arrays), :287-290 (`loaded_at` statement), :295 (decrypt), :301-311 (TypeScript re-check of since, remittance, code and date); base cc3dd7f6 `candidatesFor` `byPatient` selects only `c.id`, `remittance_id`, `paid_on`, `patient_control_number`, code and date tested only in an `EXISTS`; `claimLines` read only after the decrypted number matched (`candidateClosure`). D11 and section 4 scoped the arrays rather than removing them; CAS-49.1 and CAS-50 count decrypts and predicates, not columns. Two skeptics: the `service_date::text` side point is moot (both sides read `::text` on one connection). | **Taken; superseded in round 3** (the `ixs` form withdrawn for the two-statement patient search, round 3's first row; completeness check 2). Section 4: the statement returns `ixs` (the searched lines' indexes whose per-line predicate, the outer `EXISTS`'s word for word with D16's arrays, the claim passes) and no `service_line` column; the `loaded_at` statement and the TypeScript re-checks go; TypeScript keeps only the patient-number equality and the known, seen and `matched` drops. D11 no longer lists the `ARRAY` reads; 5.2 states the columns; CAS-50: `1 + 2 × rounds` statements and a select-list check; slice 3 carries the change. Same rows, decrypts and writes (same predicate); budgets of 8.4 unchanged (one statement fewer). DateStyle side point not taken (moot). |
| 2 | CAS-49.1 compares tables without `seq` "in insertion order" with no mechanism; the probe it rests on orders them by `ctid`. | payment engine | nit | 2 of 3 | `cap3-probe/dump.py:10, 24` (`ctid`, as "physical insertion order"); base migrations give `seq` to `ledger_entry` only; `audit.ts:49` (multi-row, no `RETURNING`), `stages.ts:155` (notification, no `RETURNING`), `ledger.ts:141-144` and `packets/services.ts:702-704, 767-769` (`RETURNING id`). The refuting skeptic: both clones start byte-identical, the pass only inserts into these tables, and the fix's "returned ids" cannot see `audit_event` or `notification` rows. | **Taken, corrected** (the refuting skeptic's point): CAS-49.1's new paragraph: ids returned by single-row inserts give ordinals in issue order; multi-row inserts without `RETURNING` are compared as the issue-ordered sequence of statements plus a multiset of canonical rows; never `ctid`; `autovacuum_enabled = false` on the template's written tables; `ledger_match` by `seq` after #126 (12.2). Section 17's fallback to `dump.py` rows says the same. |
| 2 | CAS-49.6's oracle "the same pass run after B alone" is wrong when B reopens a written-off line: the retried pass read L before B committed and never searched it. | payment engine | nit | 3 of 3 | `caseLines` `open` (`remittances.ts:142`), search only of open lines (:909); the retry re-issues only `insertStages` (section 4); `reopenLineAction` clears `written_off_reason` then inserts at the current stage; other phases read the written-off state too (`responses.ts:54`, `unmatched.ts:202`, `patient-share.ts:175, 205`), so "no new claim for L" alone would not fix the oracle. Also checked: `payer_response_refresh_case.sql` and `submission_refresh_case.sql` update the case. | **Taken, corrected** (the first fix, made concrete): the reference is the same pass with B's two statements committed at a hook after the stage sync's read and before its first insert; B's row precedes the pass's event for L in `seq`; the world writes no payer response or submission on C in the pass (so B blocks on nothing in the reference) and holds a new claim pairing with L (so a retry that re-read L would fail). Test: CAS-49.6 in slice 2; no code change. |

**Refuted in round 1 (not taken):**
- *The ask's proof never exercises the part of `ledger_line_net` it rewrites* (payment engine): LED-07 and the "what Postgres lets an entry do" test in `ledger.db.test.ts` already run reversals, adjustments and a reversal of an adjustment through `ledger_entry_within_line`, and the missing-target and other-practice cases cannot be written.
- *PE-1 is a base money defect handed off as an optional LED case* (payment engine): section 5.2 and 16 already record it as the base's, with #126's `ORDER BY m.seq` as the fix and CAS-49's replay rule absorbing it; Lane A owns the ledger and #126.
- *Two runs of F at 10,000 are quoted as one figure* (payment engine): 8.3a (R4, 220.2 s) and 14.1 (C2, 219.1 s) each name their results directory; the 1.1 s gap changes no decision.
- *The `case_line` exclusion is as statistics-bound as `ledger_match`* (security): the pass never writes `case_line`, both hops are unique-indexed, it runs once per pass or round, and a skeptic's microbenchmark gave the same linear plan (31-35 ms) in all three statistics states.
- *The 560 MiB heap figures were measured on a lone pass with no history* (security): the history-scaled map (`chainContext`'s lines) is the base's, `RemittanceClaims` is per call, SEC-3 already removed the one history read, and the weekly run already fails on live heap over 75% in the shared process.
- *`RemittanceClaims` is an exported map holding plaintext patient control numbers* (security): created only as a local in `matchPostings`, used by no other module, per pass and practice, as the type's comment and section 4 say; dropping `export` is optional tidying.

**Verdict after round 1:** the design stands with these corrections; slices 2 and 3 carry the code changes (the
savepoint retry, the `to_char` dates, the added predicates, D16's SQL fallback), CAS-49.1, CAS-49.6 and CAS-50 the tests,
and the ask the 360 s wording and two proof items. D14's split remains the orchestrator's ruling.

Round 2 (the same two lenses, three skeptics per finding; both verdicts BUILD WITH CHANGES, nothing blocking). Three
findings survived (rows above), each checked against the candidate (cap3-rev, 0b6e90eb against cc3dd7f6) and the
base's text by reading; no probe was run in the apply step. Applied in D11, sections 4, 5.2, 7 (CAS-49.1, CAS-49.6,
CAS-50), 11 (slice 3) and 17. No change to the matching rules, any amount, the order of any write, the recovered
total, the budgets of 8.4, `packages/ledger/src`, the schema, or the freeze-exception ask (no surviving finding
concerns it). CAS-49 to CAS-51's matrix rows are unchanged in words.

**Refuted in round 2 (not taken):**
- *A's real month bounded at about 345 s with Lane A's fixes contradicts the spread-shape data, and the ask passes it on* (payment engine, 1 of 3 upheld): the spread seeds' extra trigger time comes from their statistics (`ledger_entry` analyzed empty, 1.7), not from case spread; the trigger bodies read by line, match and evidence, never by case; R at 2,000 with n + k falls to F's order; 8.3a, 8.4, the risks row and the ask already say A's real month is unmeasured and Lane A re-measures before step 7b moves.
- *Never-matched posting and EFT rows pile up, so D15's ID list and D7's map grow with history* (security, 1 of 3 upheld, and that one as a downgrade): the leftover and its full reads are the base's; the `EXCEPT` returns exactly the IDs the next read takes (CAS-50); D7's map decrypts the same claims fewer times, inside one pass, and was refuted in round 1.
- *D16's array-form gate varies only `ledger_match` statistics* (security, 0 of 3): the gate includes F with 2,000 reversed claim matches (the array-size point), the risks table names the risk, the candidate's known-set exclusion is the same construct and already scales at 10,000 lines, and a skeptic's probe found a hashed subplan at 2,000 and 20,000 pairs.

**Verdict after round 2:** the design stands; slice 3 carries the patient statement's `ixs` change, CAS-49.1 the
insertion-order mechanism, CAS-49.6 the reference interleaving, CAS-50 the statement bound and select-list check.

Round 3 (the same two lenses, three skeptics per finding; both verdicts BUILD WITH CHANGES, nothing blocking). Six
findings survived, each checked against the candidate (cap3-rev, 0b6e90eb against cc3dd7f6), the base's SQL and the
recorded results by reading; no probe was run in the apply step (one skeptic's reduced-schema probe of round 2's
`ixs` form is cited from its report). Applied in D1, D11, D16, sections 0, 2.1, 4, 5.1, 5.2, 7 (CAS-49.1, CAS-49.6,
CAS-50, CAS-51 and its matrix row), 8.4, 9, 10, 11 (slices 1, 2, 3 and 5) and in the freeze-exception ask. No change to
the matching rules, any amount, the order of any write, the recovered total, `packages/ledger/src` or the schema; 8.4's
budgets stand on the candidate's measured form until slice 3 re-measures the build's form (below).

| Round | Finding | Lens | Rating | Skeptics (upheld) | What was checked | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | Round 2's `ixs` array brings back the per-line g × g' volume inside the one patient statement, unmeasured; no test shape would see it. | security | should-fix | 3 of 3 | Candidate `remittances.ts` `patientCandidates`: `named` joins each searched line to every claim of its code and date whatever the patient; the outer `EXISTS` stops at the first passing line and the candidate returned per-claim arrays, so round 2's `ixs` (design section 4) evaluated and returned every passing pair; spread A's seed (`seed.mts`: claims/20 × 4/5 per code-date) gives about 1 M elements at 10,000 and 9.5 M at 30,795; section 18 round 2 ran no probe; CAS-50 counts statements and decrypts, CAS-51 runs spread R (group size 16) and F (dates spread over the year). A skeptic's reduced-schema probe (no RLS, port 5494, removed after): `ixs` 8.0 s at 2,000, 181.5 s at 6,000, no finish at 30,800, against the candidate form's 0.09 and 0.71 s, same rows. Skeptics' correction: `named`'s server-side join was never fully linear (risks row on spread A); what was linear was the per-pair predicate and the volume returned. | **Taken.** `ixs` withdrawn. Section 4: the patient search is two statements once per pass, (a) the candidate's outer statement less its arrays and (b) `patientPairs` over only the pairs equal by decrypted patient control number, returning the pairs that pass the per-line predicate word for word (D16's arrays, D11's predicates); D1, D11, D16, 2.1, 5.1 step 3, 5.2 follow. CAS-50: `2 + 2 × rounds` and (b)'s select list and inputs; CAS-51: a spread-A pass (group size growing with N) bounding elements per open line between N/4 and N at 1.5, failing on the `ixs` form. 8.4: the figures are the candidate's form; slice 3 re-measures spread A at 10,000 and F at 30,795 and restates 8.3a, 8.4 and the ask's "about 35 s" if they differ (10% time, 25 MiB heap). Risks row added. The ask's 35 s sentence says the build re-measures. |
| 3 | CAS-49.6 requires `seq` values equal to the reference, which no deadlock run can meet. | payment engine | should-fix | 3 of 3 | `line_status_rules.sql:24-27` at 0b6e90eb (the row's default `nextval`, then `nextval` in `ON CONFLICT DO UPDATE` on the head, `NEW.seq := next_seq`); `ROLLBACK TO SAVEPOINT` does not return sequence values; CAS-49.1 compares `seq` values; no section said 49.6 compares by order. Every reader of a line's stage takes `ORDER BY s.seq DESC LIMIT 1` (`stages.ts:95`, `triage/actionable-now.ts:26`, the web's queries) or reads the head. Third skeptic: the case lock is taken AFTER STATEMENT, so when B is the victim A's rows from the deadlocked statement are not shifted. | **Taken, corrected** (the case-2 "offset by one" dropped). CAS-49.6 compares `line_status` and `line_status_head.seq` by ordinal in `seq` order and says why for each victim; 5.2 states that rolled-back statements leave gaps and that no reader compares values; CAS-49.1 keeps exact values. Slice 2 names it. |
| 3 | CAS-49's generator and mutants never exercise "seen control-number candidates stop the search", a money-changing place to slip. | payment engine | should-fix | 3 of 3 | Base `candidateClosure` (cc3dd7f6 `remittances.ts:723-741`) and `candidatesFor` (:198): `seen` filtered after `preferredCandidates` (`packages/ledger/src/matching.ts:20-23`); `CANDIDATE_FILTERS` excludes only known; candidate `remittances.ts:356` keeps the order. CAS-49.1's list and the four mutants do not build the case; no LED test does. Skeptics: 5.1 already writes `cand_r = preferredCandidates([C_r, P_r]) less seen`; section 4's "less the line's known and seen claims" on the patient list is the wording that invites the slip. | **Taken, corrected** (the stating part was mostly there). CAS-49.1: a generator case (a control-number candidate that pairs with nothing beside a pairing patient claim of the same code and date) and a fifth self-check mutant (`seen` off the control list before `preferredCandidates`); section 4 now drops only known and `matched` from the patient list and `seen` after `preferredCandidates`, as the candidate; 5.1 step 4 says so; slice 1 builds both. |
| 3 | Section 5.1 step 3's proof still describes the TypeScript re-checks that round 2 removed. | payment engine | nit | 3 of 3 | Step 3's "TypeScript re-applies each line's filters" (the only match for "re-appl"); section 4 and round 2's row remove the re-checks (:301-311); round 2's apply list had no 5.1. | **Taken, corrected** (argued from round 3's statement (b), since `ixs` is withdrawn above): `P_1` for L is the claims (b) returns for L's index, which are L's query's rows; decrypts are (a)'s rows, each once. |
| 3 | The ask's "in every case … row for row" sits under a table that includes A's month, which was compared on totals only. | payment engine | nit | 3 of 3 | Ask lines 182-189; `cap3-results-crit` holds dumps for F 10,000 (none, k, mk, nk) and R 2,000 (none, nk) only; the 30,795 nk run (`cap3-results-crit`) and none run (`cap3-results-rev`) have no dump; both `after` blocks: 30,795 approved, 30,795 posted, 30,795 recovered, 494,780,000 posted cents, 61,590 matches, 123,180 stage events. A skeptic's correction: the none run is in `cap3-results-rev`, not results-crit. | **Taken** (the rewording; no dump run in the apply step). The ask: row for row at F 10,000 and R 2,000; at A's month the counts and cents matched, rows not compared. The design (14.1) already said so. |
| 3 | The lint rule the design cites for keeping `test-support/per-line.ts` out of production code does not exist. | security | nit | 3 of 3 | `eslint.config.js` at 0b6e90eb: `no-restricted-imports` only for the model SDKs and fonts (:37-39, 125, 145); no tool refuses a test-support import; `packages/packets/src/role-examples.ts:7` already imports `./test-support` unflagged; `apps/worker/package.json` exports test subpaths. Skeptic's correction: a repo-wide `**/test-support/**` pattern would flag existing code, so scope it. | **Taken, corrected.** Section 4's sentence corrected; slice 1 adds a `no-restricted-imports` pattern scoped to `**/test-support/per-line` (in `restrictedImports`, with a test-file override re-declaring the rule, since a later flat-config block replaces options) and a lint fixture test `per-line-import.test.ts`; files table and a risks row. |

**Refuted in round 3 (not taken):**
- *Section 14.1's row breakdown for the F 10,000 equality does not add up, and its stage-event count contradicts the run* (payment engine, 1 of 3 upheld): the 40,000 stage events count the dumped database's `line_status` (4N, seed state included, as 8.3 and T2 state), not the pass's 2N; the parts name the main ledger tables and are not meant to sum to 102,907 (T2 names 16,000 of 20,635 the same way); the IDENTICAL line is recorded in `progress/rev-critic.md`.

**Verdict after round 3:** the design stands; slice 1 carries the `per-line` import guard, CAS-49.1's new case and
fifth mutant; slice 2 CAS-49.6's comparison by `seq` order; slice 3 the two-statement patient search (never `ixs`)
and the re-measure on spread A at 10,000 and F at 30,795 before the budgets and the ask's 35 s are relied on; slice 5
CAS-51's spread-A pass. The ask's equality sentence now separates row-proved runs from totals-only.

Round 4 (the same two lenses, three skeptics per finding; both verdicts BUILD WITH CHANGES, nothing blocking; the
payment-engine lens re-checked the money claims against cc3dd7f6..0b6e90eb and #126 at c49367c5 and found them
holding). Six findings survived, each checked against the candidate (cap3-rev, 0b6e90eb), the base's migrations and
the recorded results by reading; no probe was run in the apply step (the `matched` heap figures are the reviewer's and
a skeptic's, node 24 under the heavy lock). Applied in D16, sections 1.7, 4, 5.2, 6, 7 (CAS-49.1, 49.2, 49.4, 49.6 and
CAS-49's matrix row, which `matrix.ts` copies word for word), 10, 11 (slices 1 and 3), 14.1, 14.4 (item 14), 15 and 17,
and in the freeze-exception ask (wording of its proof only, with a dated note that the two granted bodies are
unchanged). No change to the matching rules, any amount, the order of any write, the recovered total, the budgets of
8.4, `packages/ledger/src`, the schema, the files of section 9 or ADR 0087's text.

| Round | Finding | Lens | Rating | Skeptics (upheld) | What was checked | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | Every equality proof compares encrypted text only as present or absent, so a wrong move-back note passes, and D3 moves the code that chooses the note. | payment engine | should-fix | 3 of 3 | `cap3-probe/dump.py:12` (`CIPHER`, `canon()` → `v is not None`) and T2; CAS-49 had no decrypted comparison; `cipher.ts` is AES-256-GCM with a fresh nonce, so byte equality fails spuriously; candidate `stages.ts:35-45` (`moveBackNote`), :118 (chosen per line before any insert), :123 (one `insertStages`); the only encrypted write in the pass is `line_status.reason` (`stages.ts:119`), the manual actions add `ledger_entry.reason` and `ledger_match.reversal_reason` (`manual.ts:196, 253`). A skeptic's narrowing: LED-07 (`ledger.db.test.ts:632`) decrypts and expects `REOPEN_NOTES.reversal`, so a full reversal/proof-level swap already fails; no test checks the proof-level text. | **Taken, corrected.** Section 7's intro and CAS-49.1's new paragraph: every encrypted column the pass writes is compared by the SHA-256 of its decrypted plaintext, in memory, never logged, never by presence; 49.2, 49.4 and 49.6 the same; the generator makes both move-backs in every world (superseded in round 5: only in the runs that raise the proof level; the others stay at posted). The sixth mutant is `moveBackNote` always returning the reversal note (the proof-level note lost), which LED-07 does not catch, not the full swap it does. Section 6, CAS-49's matrix row ("the same text in every encrypted note"), T2 and 14.1 (presence only, harmless for F and R, which write no note), section 17's dump fallback, slice 1. The ask: one sentence that encrypted text was compared by presence only in the row-for-row runs. |
| 4 | Round 1's plan guard for the new ledger function bodies can pass without testing the deployed function. | payment engine | should-fix | 3 of 3 | 14.1, the ask's "A plan test" bullet and section 16's row 1: EXPLAIN of copied statement text, no tie to `pg_get_functiondef`, no step that keeps the ledger unanalyzed (`autovacuum_enabled = false` only in CAS-49.1), no fail-first run; C1 measured the bad plans on a never-analyzed ledger only. A skeptic could not confirm that autoanalyze fires within CI's window or that the old body picks `ledger_entry_by_line` with statistics; the copy-versus-catalog point stands alone. | **Taken, corrected** (the catalog form, not auto_explain). 14.1: the migration marks each of the three statements with a `-- plan-guard: …` comment; the test cuts them from `pg_get_functiondef`, fails on a missing marker, sets `autovacuum_enabled = false` on `ledger_entry` and `ledger_match` and asserts `reltuples = -1` and null `last_analyze` and `last_autoanalyze` before planning, and the PR records it failing on #126's base against today's bodies. auto_explain on a real insert rejected: it needs a superuser's `LOAD` and the server log. The ask's bullet says the same in plain words. Lane A's PR carries it; nothing in this item's build. |
| 4 | The ask says the new `ledger_line_net` gives the same answer unconditionally, but the trigger rule it rests on is skipped for out-of-scope inserts and no foreign key backs it. | payment engine | nit | 2 of 3 | `ledger_entry_rules` returns early when `NOT practice_in_scope(NEW.practice_id)`; `ledger_entry` has single-column keys only (migration `20261023120000`:173-185). The refuting skeptic, confirmed: the early return leaves the row to `ledger_entry_tenant`'s `WITH CHECK` (`20261023120000`:733-735; `practice_in_scope`'s comment, `20261016090000`:119-120), and every role, the owner included, is `NOBYPASSRLS` (`migrate.test.ts`:138-148), so only a superuser can store a mismatched row, and a superuser could equally disable the triggers; run as the owner, the proposed count reads nothing under the forced policy and would prove nothing. | **Taken, corrected** (wording only). 14.1 and the ask's "Why the answer is the same" now say the rule holds for every entry any non-superuser role can store, and why (the rules in scope, the tenant policy outside it). The migration precondition is **not taken**: as the owner it is vacuous under forced RLS, and the ask would offer it as evidence. |
| 4 | Section 4 tells the build to apply `d1-ts-exclusion.diff`, whose patient-search hunk is the TypeScript-only exclusion D16 rejects. | security | should-fix | 3 of 3 | Design section 4's last line of the patient bullet; the diff's three hunks (`controlCandidates` at @@ -228, the patient statement's `NOT EXISTS` deleted with nothing in its place at @@ -276, `passCandidates` at @@ -348); D16, 1.7, slice 3 and round 1's row reject that form; 1.7 and section 15 present the diff as "the D16 TypeScript form". Skeptics: slice 3's "TypeScript form" is a timing baseline, not an instruction; nit or should-fix. | **Taken.** Section 4: from the diff the build takes only the control-search hunk and `passCandidates`' call site, never the patient hunk; the patient statements get D16's arrays or the correlated fallback. 1.7, section 15 and slice 3 name the diff "a measured reference, not a patch"; slice 3 says its "TypeScript form" is a timing baseline. |
| 4 | 14.4 item 14 recommends a blocking `lockLedger` in a web request, which can hold the shared 10-connection web pool for the length of a pass. | security | should-fix | 3 of 3 | `lockLedger` is `pg_advisory_xact_lock` (`ledger.ts:17`); no `lock_timeout` or `statement_timeout` in apps, packages or infra (`connect.ts` sets connection and idle timeouts only); `WEB_POOL_CONNECTIONS.application` 10 (`pools.ts:10`); `reopenLineAction` runs in the request's practice-scoped transaction (`triage.ts:518-555`); the pass holds the lock for its whole transaction (`pass.ts:38-50`; 219-310 s). | **Taken.** 14.4 item 14 rewritten: the blocking form withdrawn; the reopen takes the `ledger:` key with `pg_try_advisory_xact_lock` and, if not granted, refuses at once with a retryable refusal carrying no identifier (wording the web owner's, through ux-brand), writing nothing; `SET LOCAL lock_timeout` named as the lesser form; its test (CAS-49.6's shape with the lock held: the refusal within a second, nothing written). 5.2 and the risks row follow. D3's savepoint retry stays. A hand-off; nothing in this item's build. |
| 4 | D16's `matched` set grows with the practice's whole claim-match history, though the search needs only the open lines' pairs. | security | nit | 3 of 3 | Candidate `remittances.ts:915` (every `claim`-kind match, all time); `matched` is read only at :310 and (in the build) the control search's drop, always with a searched line, and only open lines are searched (`passCandidates`, :348); the base had no such set, so round 1's "the base's map" reason does not cover it. Reviewer: 5.0 MiB at 61,590 pairs, 65.2 MiB at 740,000; a skeptic reproduced 5.6 / 71.8 MiB. Skeptics' corrections: 740,000 is about one year at A's rate, not two; the set is a fraction of the base's own history-scaled `context.matches`, so nit. | **Taken** (the filter, not only a heap seed). Slice 3, section 4 and D16: a `Set` of the open lines' service-line IDs first, then the filter, so the set is bounded by the open lines; the same exclusion for every searched line; risks memory row. No budget changes. |

**Refuted in round 4 (not taken):**
- *D14 sizes step 7b at 10,000 lines on cc3dd7f6 figures, but no pass at that size ran on #126's base* (payment engine, 0 of 3): 12.2 and 14.4 item 11 name `ledger_match_by_seq` and give the re-measure to Lane A's trigger PR, whose primary-key lookup does not depend on the old form's index; 360 s is a sizing bound, the failing condition is the 900 s attempt (4.1 times margin), and the first weekly run prints the figure; the lookup already scans the practice's standing matches, so another practice-leading index keeps the same order (and it is about 58 s of the 161 s, not 100).
- *D7's moved claim read and D2's batched `claimLines` rely on RLS alone* (security, 0 of 3): D11 covers new statements only; both texts are the base's word for word (`postings.ts:73-78`, D2, section 0 item 10, R6 against #126's `CLAIM_LINES`); D7 decrypts the same claims fewer times within one pass; adding predicates would break #126's word-for-word copy.

**Verdict after round 4:** the design stands; slice 1 carries CAS-49's comparison of encrypted text by decrypted hash
and its sixth mutant; slice 3 takes only the control-search hunk of `d1-ts-exclusion.diff` and builds `matched` from
the open lines' pairs; Lane A's PR carries the catalog-tied, statistics-checked, fail-first plan test; the web owner's
hand-off (14.4 item 14) is a try-lock with a retryable refusal, never a blocking wait. The ask changed in proof wording
only; the bodies the founder granted are unchanged.


Round 5 (the delta only, by speed rule 3: round 4's applied rows and completeness check 2's changes, diffed against
the copies taken before check 2; the same two lenses, three skeptics per finding; both verdicts BUILD, with changes,
nothing blocking). The payment-engine lens re-checked the delta's money claims and found them holding: the ask's SQL
equals the granted text at 38123394, the ask's figures equal 8.3a and 14.1, the `matched` filter keeps the exclusion,
the sixth mutant can fail, and CAS-50's split catches a per-line fallback in `reprocessingOf`. Three findings
survived, each checked against the candidate (cap3-rev, 0b6e90eb) and the base's migrations and functions by reading;
no probe was run. Applied in section 7 (CAS-49.1's encrypted-text paragraph, CAS-50's first bullet, CAS-49's matrix
row, which `matrix.ts` copies word for word), 10 (the D3 risks row), 11 (slices 1 and 5) and 14.4 (item 14). The ask
is unchanged: none of the three concerns it. No change to a matching rule, an amount, the order of any write, the
recovered total, a budget, `packages/ledger/src`, the schema, the files of section 9 or ADR 0087's text.

| Round | Finding | Lens | Rating | Skeptics (upheld) | What was checked | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | Round 4's rule to make the proof-level move-back in every generated world puts every CAS-49.1 pass at the deposited level, so no generated pass is compared at the default posted level. | payment engine | should-fix | 3 of 3 | `setLedgerSettings` writes `practice.settings` for the whole practice (`settings.ts:27-35`); `ledger_line_stage` reads `ledger_proof_level(l.practice_id)` for every line and counts only entries at that level (`ledger_line_stage.sql:15`, `proved`, `last_proof`); `DEFAULT_PROOF_LEVEL` is `'posted'` (`packages/ledger/src/stages.ts:18`); LED worlds other than LED-06 set posted (`ledger.db.test.ts:188`); `moveBackNote` (`stages.ts:35-46`) gives the proof-level note only when a recovered line falls short with no reversal since, so the compared pass must run raised. Skeptics: CAS-49.2 and 49.3 still cover posted in fixed worlds, and deposited entries still exercise D3's order, so the loss is generated posted-level variety, not a money error. | **Taken.** CAS-49.1: the level is fixed by run index, never drawn; the 13 even runs stay at posted (postings in the pass move lines to recovered, payer approved and recovered from a posted entry in one `insertStages`, the posted recovered total compared); the 12 odd runs raise to deposited after the history and make both move-backs (no reversal: the proof-level note; a deposit match reversed by a person while the posting stood, as round 5's refuted finding's skeptics traced: the reversal note); the harness asserts both levels ran, a posted run recovered a line from a posted entry in the pass, and fixed CI run 1 holds both move-backs, against which the sixth mutant is checked. CAS-49's matrix row names both levels; slice 1 builds it. |
| 5 | CAS-50's "other `claimLines` calls exactly 3" names no way to tell the calls apart, and 3 holds only if `recoupReversals` finds a standing approved claim match. | payment engine | nit | 3 of 3 | Every caller issues the same text (`remittances.ts:425-435`; callers :363, :595, :616, :649, :797); `passCandidates` calls it inside the module; each round issues `controlCandidates` then `claimLines` (:351, :363) and the loop ends on an empty round (:377); `matchClaims`' `chainContext` (:907) runs first; `recoupReversals` returns before its `chainContext` without a standing approved claim match (:974-977), its matches re-read after `matchClaims` (:1190-1192); `shares` calls `chainContext` before its own early return (`postings.ts:285`, via `settleMatches` :335). | **Taken.** CAS-50: the proxy attributes by position (the search's calls are those between the first and last `controlCandidates` statement; `rounds` is their count; the practice-wide calls fall before and after, where a per-line `reprocessingOf` fallback would also land), and the test asserts the world's standing approved claim match after `matchClaims` before asserting 3 (otherwise 2 is correct, on the base too). Slice 5 names both. |
| 5 | 14.4 item 14 and the risks row treat a web request's wait on a pass as a reopen-only problem, but the write-off waits on the same case row. | security | nit | 3 of 3 | `pass.ts:41` hands `recordReprocessedNoChange` to `reconcileRemittances`, which calls `recordPayerResponse` (`responses.ts:127`); its insert fires `payer_response_refresh_case` (`UPDATE "case"`); the stage insert's AFTER STATEMENT case refresh (`line_status_refresh_cases.sql:14-15`) does the same; `writeOffLineAction` (`apps/web/src/lib/routes/triage.ts:474-512`) runs `UPDATE case_line`, whose statement trigger `case_line_refresh_updated` (migration `20261019160000`:545) updates the same case; no `lock_timeout` anywhere in apps or packages; the application pool has 10 connections (`pools.ts:10`). The base behaves the same. | **Taken** (hand-off wording only). 14.4 item 14 names the class (every web writer of a `case`, `case_line` or `submission` row a running pass can hold, the write-off and the reopen at least), recommends the same `ledger:` try-lock refusal in each, or a `SET LOCAL lock_timeout` of a few seconds in the practice-scoped mutation transaction as the floor (superseded in round 7: set only in the affected writers around the statement that waits, never transaction-wide), with the reopen's test shape for the write-off; the risks row now says the reopen never makes a blocking wait and other web writers of case rows still can, handed on with it. Nothing in this item's build. |

**Refuted in round 5 (not taken):**
- *CAS-49.1 asks the pass to write a reversal-note move-back, which no product path lets the pass write* (payment engine, 0 of 3): a reversal written while another proof keeps the line recovered (a deposit match reversed under posted while the posting stands, or one of two posting matches) leaves `finish()`'s sync with nothing to move; a later proof-level raise makes the next pass move the line back, and `moveBackNote` (`stages.ts:35-45`) returns the reversal note, since it asks only whether a reversal is newer than the line's last recovered row; settings write no stages (`syncLineStages` is called only from `pass.ts:45` and `manual.ts:65, :255`). Round 5's first finding now builds the case this way.
- *The ask still says the answer is the same with no condition, and files the tenant-policy dependence as a rewording* (security, 1 of 3): the conclusion the founder read still holds for every non-superuser role, only its reason changed (the tenant policy outside the trigger's scope, every role `NOBYPASSRLS`), the ask's header and "Why the answer is the same" already disclose it, and round 4 settled it as wording only with the precondition left out.

**Verdict after round 5:** the design stands; slice 1 carries CAS-49.1's proof level fixed by run index (posted and
deposited runs, both move-backs in the raised runs, the harness's level and seed checks); slice 5 carries CAS-50's
attribution by position and its precondition; the web owner's hand-off (14.4 item 14) covers every web writer of case
rows a pass can hold, not only the reopen. Nothing in the ask changed.

Round 6 (the delta only, by speed rule 3: round 4's applied rows, completeness check 2's changes and round 5's
applied rows; the same two lenses, three skeptics per finding; both verdicts BUILD, with changes, nothing blocking).
The payment-engine lens re-checked the ask's SQL against the granted text at 38123394, the ask's figures against 8.3a,
8.4 and 14.1, CAS-49.1's proof level by run index, CAS-50's attribution by position and its precondition, and D16's
fallback in both patient statements, and found them holding; the security lens found D16's fallback keeps
`m.practice_id = $1` per alias and widens no decrypt. Two findings survived; they are one fault seen through two
lenses (round 4's sentence in 14.4 item 14), applied once. Checked against the candidate (cap3-rev, 0b6e90eb) by
reading; no probe was run. Applied in 5.2 (the first bullet), 10 (the D3 risks row) and 14.4 (item 14: the "no
precedent" sentence and a new last paragraph). The ask is unchanged: neither finding concerns it. No change to a
matching rule, an amount, the order of any write, the recovered total, a test of section 7, a budget, a slice,
`packages/ledger/src`, the schema, the files of section 9 or ADR 0087's text.

| Round | Finding | Lens | Rating | Skeptics (upheld) | What was checked | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | 14.4 item 14 says the manual actions take the ledger lock only inside jobs, but the web runs them with a blocking lock. | payment engine | nit | 3 of 3 | `manual.ts` `begin()` (:46-49) calls `lockLedger`, the blocking `pg_advisory_xact_lock` (`ledger.ts:16-18`); every action calls `begin()` first (:71, :101, :136, :178, :229 with `ledger.adjust`); outside `manual.ts` only `public.ts:12` names them, no job calls them; `reconciliation.ts:3` imports four of them and runs them through `manual()` (:139-159) from `practiceRoute` handlers (:182, :203, :228, :260); `specialist.ts:3, :154` does the same for `adjustEntry`; the request runs in `withPracticeScope` (`invoke.ts:497`); section 7 already said the routes run the manual actions through `@tp/worker/ledger`. | **Taken.** The sentence corrected (the manual actions run in web requests and already make the blocking wait); a new last paragraph of item 14 adds the five web actions to the class with the same remedy (the `ledger:` try-lock in `manual()` before the action, `manual.ts` unchanged, or the `lock_timeout` floor set before `begin()`), the floor in `withPracticeScope` only, never `withJobScope` (superseded in round 7: only in the affected writers, never in `withPracticeScope` or `withJobScope`), and their test (CAS-49.6's shape, the lock held: the refusal within a second, nothing written). Nothing in this item's build. |
| 6 | Item 14 says the manual ledger actions only lock inside jobs, but the web's Reconciliation routes already wait on the `ledger:` lock for a whole pass, and round 5's list of affected writers leaves them out. | security | should-fix | 3 of 3 | As the row above; also: no `lock_timeout` in any `.ts` under apps or packages; `manual()` maps only `ReconciliationError` to a refusal and rethrows the rest (:150-157), so a `55P03` would surface as a generic server error; `WEB_POOL_CONNECTIONS.application` 10 (`pools.ts:10`); the pass runs under `withJobScope` (`jobs/runs.ts:43, :52`), which only the worker uses. The base behaves the same; this item does not lengthen the lock. | **Taken, with the row above** (one paragraph). Item 14 also says that wherever `lock_timeout` is the floor (the manual actions, the reopen, the write-off), the route maps SQLSTATE `55P03` to the identifier-free retryable refusal, since `manual()` would otherwise return a generic error. The D3 risks row names the manual actions with the same remedy and the `55P03` mapping; 5.2's first bullet says they run in web requests and wait for the pass, handed on. A hand-off text change only. |

**Refuted in round 6 (not taken):**
- *CAS-49.1's harness checks less than the round-5 text says the posted and deposited runs cover* (payment engine, 0 of 3): the third mutant (events grouped by stage) changes the seq order whenever one line's recovered event precedes another line's payer-approved event in one statement, which ordinary posted runs produce, so the approved-and-recovered pair is not required; all six mutants are in the file's own self-check over the fixed runs, so a generator drift that removed a mutant's shape fails loudly; CAS-49.3 pins the pair in a fixed world and CAS-49.2 runs LED-06 at deposited; only the sixth mutant needs a pinned world (run 1). At most a wording nit about what the even runs "include".

**Verdict after round 6:** the design stands; nothing in the build, the tests, the budgets or the slices changed; the
web owner's hand-off (14.4 item 14) now covers the five manual reconciliation actions, the most direct waiters on the
`ledger:` lock, beside the reopen and the write-off. Nothing in the ask changed.

Round 7 (the delta only, by speed rule 3: round 4's applied rows, completeness check 2's changes and the rows rounds 5
and 6 applied; the same two lenses, three skeptics per finding; verdicts BUILD (payment engine) and BUILD WITH CHANGES
(security), nothing blocking). The payment-engine lens found the ask's two bodies byte-identical to the bak-critic2
copy and equal to 14.1's, CAS-50's attribution by position buildable and able to fail on a per-line fallback in
`reprocessingOf`, CAS-49.1's proof level by run index able to produce both move-back notes, and round 6's try-lock
re-entrant with `begin()`'s `lockLedger`; the security lens found D16's fallback, CAS-50 and CAS-49.1 widen no decrypt
and add no logged field, and the affected routes check permission in `practiceRoute` before `manual()`. Two findings
survived, both on round 6's last paragraph of 14.4 item 14 (hand-off text only); none was refuted. Checked against
the candidate (cap3-rev, 0b6e90eb) by reading; no probe was run. Applied in 10 (the D3 risks row) and 14.4 item 14
(the reopen's refusal wording, round 5's floor sentence and round 6's last paragraph). The ask is unchanged: neither
finding concerns it. No change to a matching rule, an amount, the order of any write, the recovered total, a test of
section 7, a budget, a slice, `packages/ledger/src`, the schema, the files of section 9 or ADR 0087's text.

| Round | Finding | Lens | Rating | Skeptics (upheld) | What was checked | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | Round 6's try-lock in `manual()` also refuses when another person's manual action holds the `ledger:` lock, not only during a pass, and the refusal's example wording says a reconciliation is running. | payment engine | nit | 3 of 3 | `begin()` (`manual.ts:46-49`) calls the blocking `lockLedger` (`ledger.ts:16-18`) for every action (:71, :101, :136, :178, :229); the only other caller is the pass (`pass.ts:39`); so two people's manual actions on one practice serialize and both succeed today; the reopen's example wording ("reconciliation is running") is what round 6's "the same … refusal" points to; the handed-on test covered only a held lock in CAS-49.6's shape; a refused action rolls back whole. | **Taken** (hand-off text only). 14.4 item 14: the reopen's example wording is now general ("the ledger is busy"), with the reason (a pass or another person's manual action holds the key); round 6's paragraph names the manual-against-manual refusal, its cost (a visible, retryable refusal; no amount, stage or total), that the floor keeps manual-against-manual serialization, and adds the test assertion (two concurrent `reverseMatchAction` requests on different matches: the second refused and its retry succeeds under the try-lock, both succeed under the floor). The try-lock stays the preferred form (rounds 4-6). Nothing in this item's build. |
| 7 | Round 6 puts the `lock_timeout` floor in `withPracticeScope`, "which only web requests use", but the gateway, the capacity harness and the worker's test worlds use it, and a transaction-wide timeout would cut short the web's own advisory waits. | security | should-fix | 3 of 3 | `withPracticeScope` callers at 0b6e90eb: `packages/model-gateway/src/postgres-store.ts:68, :231`; `tools/release-capacity/run.ts:357, :366`, `scenario.ts:372, :524, :567, :584, :593, :657`; `apps/worker/src/reconcile/test-support/ledger-world.ts:114, :141, :154, :181, :217`; the web's blocking advisory waits `workbench.ts:93` (`case_owner`), :120 (`packet`), `tagging.ts:48` (`document_use`), `mapped-plan.ts:61` (`plan_months`), none mapping `55P03` (no `lock_timeout` or `55P03` under `apps/web/src`); round 5's floor sentence said "in the practice-scoped mutation transaction". One skeptic noted the D3 risks row did not carry the false phrase (it is in item 14 only) and one rated it nit-or-should-fix, since round 6 already said "set before `begin()`". | **Taken** (hand-off text only). 14.4 item 14: the false clause deleted; the floor is set only in the affected writers (in `manual()` around a `lockLedger` it takes before `run()`, set back with `SET LOCAL lock_timeout = 0` once granted; in the reopen and the write-off around the first `case` or `case_line` update), never in `withPracticeScope` or `withJobScope`, with the callers and the web's own waits named; the `55P03` mapping in the same places; the test adds that a web step waiting on `plan_months` or `case_owner` longer than the floor still completes. Round 5's floor sentence says the same; the D3 risks row now says where the floor goes and that the refusal is general. Nothing in this item's build. |

**Refuted in round 7 (not taken):** none.

**Verdict after round 7:** the design stands; nothing in the build, the tests of section 7, the budgets or the slices
changed; the web owner's hand-off (14.4 item 14) now scopes the `lock_timeout` floor to the affected writers, never
the shared `withPracticeScope`, and words the try-lock's refusal generally, since another person's manual action also
holds the `ledger:` key. Nothing in the ask changed.

---

## 19. Completeness check 2 (2026-11-07, after review rounds 1-4)

A second completeness critic read this design and the freeze-exception ask after the four review rounds. It checked:
every surviving finding has a disposition row; D14 is stated with its numbers and its ruling; the worker-only scope is
clear and every Lane A part has DDL, a measured gain and a place behind #126; the ask's numbers match the design; the
slices can be built from the text; and sections 0, 3, 7, 8, 9, 11, 14, 16 and 17 do not contradict each other. It
read the candidate (cap3-rev, 0b6e90eb), the recorded results (`lane-b-suite-cap-3-wip/results-rev`, `results-crit`),
the item's status file and the ask's history on build-ops (38123394, f795bf28). It ran no probe. Changes, each in place:

1. **The founder's grant and the D14 ruling recorded (0 items 7 and 12, D9, D14, 8.4, 14.1).** The status file
   records the orchestrator's D14 ruling (2026-11-06 22:31 UTC: the split, step 7b on F at 10,000 lines, with the move
   back to A's month once Lane A's two fixes merge). It also records the founder's freeze exception (22:40 UTC). The
   design still called both open. Each is now recorded where it applies, sourced to the status file. D14's ruling
   predates the review rounds, which changed none of its figures (1,653 s, 220 s, 310 s). It is marked for the
   orchestrator's confirmation when the reviewed design is committed. D9 now says the build is worker-side only.
2. **The ask's revision history corrected.** The ask said round 1 came before the grant and only round 4 after it. In
   fact the grant was given on the 22:28 UTC text (38123394), and rounds 1, 3 and 4 all changed the ask afterwards. Two
   of those changes correct statements the founder read: that the release checks allow 360 s, and that the writes
   matched row for row in every case. The header now lists what changed since the grant. The SQL of both bodies was
   compared with the granted text and is identical. The two bodies also equal 14.1's and `probe-crit/state-k.sql`.
3. **Section 0 matched to the reviewed decisions.** Item 4 now says two patient statements, not one (round 3). Item 9
   said that no lock order changes, which contradicts D4's round-1 correction; it now names the changed order and D3's
   retry. Item 12 now says that 360 s is a sizing bound with no check enforcing it (8.4).
4. **D16's fallback covers both patient statements (D16, CAS-50, slice 3).** Section 4 puts the fallback's
   `NOT EXISTS` in (a) and in `patientPairs` (b). D16, CAS-50 and slice 3 had excepted "that one statement" from the
   text check, so a builder taking the fallback would have failed CAS-50 on (b). All three now name both statements.
5. **CAS-50's statement bound made buildable.** "Candidate statements and `claimLines` calls at most `2 + 2 × rounds`"
   would also count the pass's three practice-wide `claimLines` calls. Those are `chainContext` in `matchClaims` and in
   `recoupReversals` (`remittances.ts:907`, :978) and in `shares` (`postings.ts:285`). The candidate measured 4 calls,
   3 + 1, against the base's 4,003 = 2N + 3. Counted that way, the bound fails correct code (8 against 6 with two
   rounds). The bound now covers the search's own calls, and the three practice-wide calls are asserted to be 3.
6. **14.1's first-form paragraph marked superseded.** "Adding `practice_id` … would not reach the joins either" and
   "the cost is the two joins" were spread R's reading. The recommended form is that practice equality, and it removes
   F's cost (74.6 → 2.0 s).
7. **CAS-51's CI time stated (8.2).** Since round 3, CAS-51 runs three shapes at two sizes each. The estimate is about
   3 to 3.5 minutes on 4 CPUs, not measured. Private db shards run on 2-CPU runners under a 20-minute timeout, beside
   CAS-41's and CAS-42's real-size files. Slice 5 records the time. If the shard nears the timeout, the PR says so;
   no shape is cut without a ruling.
8. **Slices completed.** Slice 4 names the web's tests that section 7 assigns to it. Slice 5 adds the
   `db-shards.test.ts` re-run that 12.1 names.
9. **Section 18 counts and supersession.** Round 1's preamble said "seven" findings survived, but there are nine rows
   (4 taken, 5 taken corrected; six refuted). Round 2's `ixs` row is now marked as superseded by round 3.

Checked and found consistent: one disposition row per surviving finding, 9 + 3 + 6 + 6 = 24 against the rounds' 9, 3,
6 and 6. Refuted findings are listed: 6, 3, 1 and 2. The ask's figures equal 14.1's and 8.3a's: 219.1 → 84.9 s,
1,653.1 → 309.9 s, 43.7 → 19.2 s, inserts 161.3 → 29.1, 1,468.9 → 141.5 and 33.3 → 8.6 s, the parts apart 160.0
and 128.1 s, 102,907 and 20,635 rows, 75.6 s for `within_evidence`, about 35 s. A's month at $4,947,800.00 equals
`posted_cents` 494,780,000 in both runs' results. 8.4's budgets equal CAS-51's and the slices'. No number, rule,
write order, budget or file in section 9 changed.

**Not fixed here (for the orchestrator or the build):**
- Confirming D14's recorded ruling, and writing it into D14's text and ADR 0087 as ruled, is the orchestrator's step
  when the reviewed design is committed.
- The orchestrator should relay the ask's corrected statements to the founder (item 2): the 360 s wording and
  row-for-row only at F 10,000 and R 2,000. The bodies are unchanged, so the grant's subject is the same.
- CAS-51's CI time is an estimate until slice 5 (item 7).
- The status file's "For Lane A" entries still carry the first form's figures (it says so itself). The status file is
  the item session's to update.

**After the delta rounds (5-7; consistency check, 2026-11-07).** The three delta rounds were checked against each
other and against sections 0, 3, 4, 5, 7, 8, 9, 10, 11, 14 and 18, by reading the design and the ask only; no probe
was run. One disposition row stands for each surviving finding: 3 + 2 + 2 = 7, so 31 of 46 findings over seven rounds
survived; the refuted lines number 2, 1 and 0. Small gaps fixed in place:

1. **Superseded floor placements marked.** Round 5's third row ("in the practice-scoped mutation transaction") and
   round 6's first row ("in `withPracticeScope` only") now say that round 7 superseded them: the `lock_timeout` floor
   is set only in the affected writers, around the one statement that waits, never in `withPracticeScope` or
   `withJobScope`.
2. **The reopen's lesser form points to that placement (14.4 item 14).** Its `lock_timeout` sentence now says the
   floor is set and set back around that one wait, as the item's last paragraph says.
3. **Slice 1 names all three of CAS-49.1's harness checks.** The checks are that both proof levels ran, that a posted
   run moved a line to recovered from a posted entry matched in the pass, and that run 1 holds both move-backs. The
   slice had named only the first and the third.

Checked and found consistent: CAS-49.1's 13 even runs and 12 odd runs make the 25 runs, and run index 1 is an odd
(raised) run. CAS-49's matrix row names both levels, and section 9 and slice 5 copy it word for word into `matrix.ts`.
5.2's first bullet, the D3 risks row (10) and 14.4 item 14 agree on four points: the manual actions run in web requests
and wait for a pass, on the base as well; the remedy is the try-lock, with the floor as the lesser form; the refusal is
worded generally; and `55P03` is mapped wherever the floor is used. Section 0, D3 and D4 are untouched by the delta
and agree with it, because rounds 5 to 7 added no lock, write or order to this item's build. The ask is byte-identical
to its copy taken before round 5, and its figures still equal 8.3a and 14.1: the 24% and 76 s in its table and text
are 24.3% and 75.6 s rounded. Rounds 5 to 7 changed nothing in its header's account of what changed since the grant.
