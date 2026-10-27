# SUITE-CAP-1: a 100,000-line month triages and reports within the worker (Lane A schema PR)

Design contract, 2026-10-27, against `claude/build-platform` at e908c21 and PR 6b-4 (#42, `co-001/pr-06b-mail-streams`,
head 098636e3, migration `20261107090000_mail_streams.sql`). Branch `co-001/suite-cap-1-triage-locks`. It follows SS-01
in Lane A's serial chain (`20261108090000_suspension_refusal.sql`, `designs/ss-01-suspension.md`). Its PR opens only
after #42 and SS-01 merge (LANES.md rule 2: one schema PR at a time). Reserved: ADR 0083; test-matrix CAS-40 to CAS-42;
`packages/synth` cases CAS-40 to CAS-42 (module 5, no fixture files); no fixture release. Claim: LANES.md row 186.

Sources:
- LANES.md "Handed to Lane A" (2026-10-26, from #49);
- `approval-summaries/lane-b-release-content-checks-status.md` and `lane-b-release-content-checks-capacity-summary.md`;
- the release-capacity workflow and harness #49 added (`.github/workflows/release-capacity.yml`, `tools/release-capacity/*`);
- the two scouts' reports (`progress/design-suitecap1-database.md`, `progress/design-suitecap1-application.md`).

Every claim below was re-read at e908c21, or at #42's head where #42 touches the file. The claims the design rests on
were probed on databases migrated from empty, up to 100,000 lines through the job code under the worker's heap limit
(section 15).

This is a schema change, so it needs the founder's SHA-256 approval of the regenerated domain model. One optional part
changes two trigger functions on `ledger_entry`, which reconciliation-001's ledger freeze covers, so that part needs a
freeze exception (Q1). The design reverses no founder ruling. It touches no money computation, no pricing engine and no
`content/releases`, and it changes no sentence a person reads.

---

## 0. In twelve lines

1. **The defect.** `line_status_rules()` takes one `pg_advisory_xact_lock` per line. A 100,000-line triage holds one per
   line until it commits, and the cluster's shared lock table runs out: Postgres 53200 "out of shared memory". The
   audit report triages inline, so it fails the same way. Probe B reproduced #49's failure through the job code: 53200
   at 47.9 s with 14,844 locks held (the harness: 48.1 s).
2. **It is also a cross-tenant fault.** The lock table is shared by the whole cluster: while one practice's transaction
   holds 13,000 locks, another practice's 2,000-line insert fails 53200 (probe A2).
3. **The lock fix.** Each line gets one head row, `line_status_head` (its current stage and the order number of its
   latest event). The trigger takes the line's lock as a row lock on that head row, with one
   `INSERT … ON CONFLICT DO UPDATE … RETURNING`. A row lock lives in the row, not in shared memory.
4. **The protection is unchanged.** One writer at a time per line, the same waits and the same lock order as today. No
   person waits on anything new, and no new deadlock appears (probe R3).
5. **A latent race closes with it.** Today a writer that waited can commit an event that sorts before the event it
   waited on, and a duplicate forward event gets through (probe R2). The head row draws the order number after the
   lock, so a line's events sort in commit order.
6. **Behind the lock, four more real-size defects** surfaced once triage could finish (probes C to F):
   - triage's own stage-advance statement is quadratic in a month's lines: 197 s for 33,334 actionable lines;
   - triage holds every candidate's trace at once: a 531 MiB heap against the worker's 560 MiB;
   - the report holds every line's trace at once and runs out of heap;
   - the report's patient-balance step takes 616 s, from a missing index and a quadratic loop.
7. **Their fixes:** a per-line indexed lookup, reading candidates and report lines in batches of 2,000 that keep the
   judgement and drop the trace, the index `claim_by_superseded`, and grouping adjustments once. No result changes.
8. **With all of it, under the worker's heap flag:** A's 100,000-line triage took 49.8 s with a 213 MiB heap peak, and
   A's audit report 73.1 s with a 483 MiB peak (probe G2). Before, triage failed and the report could not run.
9. **The reconcile side, under a freeze exception (Q1).** Two ledger triggers take one lock per posting or EFT row and
   per line, so a real-size reconcile fails the same way. Every ledger writer already holds the practice's `ledger:`
   lock first, so both triggers take that key instead.
10. **No database parameter change.** Raising `max_locks_per_transaction` only moves the ceiling (section 2.1, option A).
11. **Proof.** CAS-40 (the races, deterministic), CAS-41 (the lock-table bound, and a 100,000-line triage and report in
    CI under the worker's heap flag, failing first), CAS-42 (the weekly release-capacity run passes, with new checks:
    every measured job completes on its first attempt, and no transaction holds more than 64 advisory locks).
12. **Stored windows stay with #8.** The 10-to-13-second windows query reads `rule_record`, never `line_status`, and no
    triage or report path calls it. One migration, one ADR (0083). The founder approves the domain model and rules Q1.

---

## 1. The problem, with evidence

### 1.1 What the code does (e908c21)

**The lock.** `line_status_rules()` is a `BEFORE INSERT OR UPDATE … FOR EACH ROW` trigger on `line_status`
(`20261019160000:378`). Its latest body is `packages/db/migrations/20261023120000_recovery_ledger.sql:550-579`. Earlier
bodies: `20261022090000_review_guards_visit_shortfalls_and_practice_settings.sql:42-73` and
`20261019160000_triage_cases_and_audit_reports.sql:344-378`. For every row it:
- refuses an update (:554-556);
- takes `pg_advisory_xact_lock(hashtextextended('line_status:' || NEW.service_line_id::text, 0))` (:557);
- reads the line's current stage, the latest event by `seq` (:558). The lookup has no `practice_id`; only row-level
  security narrows it to the index's leading column;
- checks the new event against it (:559-574) and stamps `set_at` (:575).

`seq` is `bigint GENERATED ALWAYS AS IDENTITY` (`20261019160000:137`), indexed by `line_status_by_line (practice_id,
service_line_id, seq DESC)` (:152). The identity value is drawn when the row is formed, before any BEFORE trigger runs.

**The other triggers on `line_status`** stay as they are:
- `line_status_ledger_rules` (BEFORE ROW, which fires first by name, `20261023120000:587-606`);
- `line_status_belongs` (AFTER ROW, `20261022090000:76-90`);
- `line_status_refresh_cases` (AFTER STATEMENT, definer, `20261023090000_packets_submissions_and_responses.sql:837-845`);
- `line_status_never_deleted` (`20261019160000:392`) and `line_status_no_truncate` (:655).

**Every writer of `line_status`** (non-test), and the outer lock it already holds:

| Writer | Where | Outer lock | Shape |
| --- | --- | --- | --- |
| Triage job | `apps/worker/src/triage/job.ts:21` → `execute.ts:480-483`, one transaction → `triageInScope` :424 | `triage:<practice>` (`lockPractice` :396-398, taken :426) | `advanceStages` (:326-344): one `INSERT … SELECT` per stage, `ORDER BY service_line_id`; flagged :444, `closeWindows` (UPDATE `case_line`) :446, validated :450, case lines :456/:460, actionable :464 |
| Audit report job | `apps/worker/src/report/generate.ts:54-91`, one transaction | `audit_report … FOR UPDATE` (:57), then `triage:<practice>` | `triageInScope` inline (:73), then reads, prints and stores the report |
| Open a case on a pattern (a person) | `apps/worker/src/triage/patterns.ts:152-180` (web workbench) | `triage:<practice>` (:157) | one multi-row insert at actionable (:173) |
| Reconcile job | `apps/worker/src/reconcile/pass.ts:35-52`, one transaction | `ledger:<practice>` (`reconcile/ledger.ts:16-18`, taken `pass.ts:39`) | `syncLineStages` (`stages.ts:72-103`) → `insertStage` (:61-70), one row at a time, `ORDER BY service_line_id` |
| Manual ledger work (a person) | `apps/worker/src/reconcile/manual.ts:46-50` (`begin`), `finish` :64-68 | `ledger:<practice>` | `syncLineStages` |
| Reopen a line (a person) | `apps/web/src/lib/routes/triage.ts:503-538` | none | `UPDATE case_line` (:522-525), current stage read in TypeScript (:526), insert a reopen (:528) |

`closePassedWindows` (`execute.ts:418-421`, the monitor job) takes `triage:<practice>` and writes no stage. Writers run
at READ COMMITTED, so each statement inside the trigger sees what committed before it.

**Why triage holds tens of thousands of locks at once.** `triageInScope` runs in one transaction (`executeTriage`,
`execute.ts:480-483`), and an advisory transaction lock is released only at commit. A 100,000-line month makes up to
100,000 validated events, then actionable events for some of the same lines (already locked). So it holds about one
lock per line it moved.

The shared lock table has `max_locks_per_transaction × (max_connections + max_prepared_transactions)` slots:
- 64 × 100 locally and in CI;
- 64 × 200 in the harness (`tools/screening-capacity/containers.ts:258-266`);
- in production, 64 × RDS's default connection count for db.t4g.medium, which its memory formula puts at about 400, so
  about 26,000 (`infra/lib/environments.ts:150-156`; the parameter group sets only TLS,
  `infra/lib/constructs/database.ts:128-132`).

Postgres lets the table borrow some spare shared memory, which is why probe A1 failed between 12,000 and 20,000 rather
than at 6,400. A 100,000-line month exceeds every one of these.

**What failed in #49's real-size run (capacity summary):** A's triage failed each of its three attempts at 48.1 s (265.5
s in all), and A's audit report failed each of its three at 47.2 s (309.7 s). B's 20,000-line triage passed in 10.4 s.

**The same pattern on the reconcile side.** Two `BEFORE INSERT` triggers on `ledger_entry` take a lock per row:
- `ledger_entry_within_evidence()` takes `ledger_evidence:<posting or EFT row>`
  (`20261027090000_packet_and_ledger_review.sql:147-201`, lock :172; earlier `20261026090000_recovery_ledger_review.sql:188`);
- `ledger_entry_within_line()` takes `ledger_line:<line>` (`20261027090000:219-270`, lock :246).

A reconcile pass is one transaction (`pass.ts:37-51`), so a pass that posts N case lines holds about 2N locks (one per
posting row and one per line), on top of today's N line-stage locks. A practice's posting export for a 60,000-line
dispute set would fail 53200. The release-capacity run has no reconcile phase, so nothing measures this today.

### 1.2 What the per-line lock protects

The invariants (PRD 8, the status machine; CLAUDE.md "Five line stages … Monotonic; reopen is explicit"):
1. a line's stages move forward only; setting a stage again or an earlier one is a reopen;
2. a reopen names the stage the line is at;
3. a reopen keeps the line at its stage or moves it back;
4. a reopen in no one's name comes only from payer approved or recovered (the ledger's).

The trigger checks each new event against the line's current stage. Without serialization, two transactions could read
the same current stage and both insert. So the lock serializes "read the current stage, check, insert" per line. The
races it closes are among the writers that can meet on one line:
- a person's reopen (no outer lock), against reconcile or manual ledger work (`ledger:`), against triage or a case
  opened on a pattern (`triage:`);
- two forward events for one line from any two writers (probe R1: the second is refused).

Triage and reconcile touch disjoint lines in practice: `candidateRows` leaves out lines already in a case
(`execute.ts:245`), and actionable is written only for lines attached in the same transaction. The database does not
rely on that, and neither does this design.

**What the lock does not protect today: the order of a line's events (probe R2).** The identity value is drawn before
the lock:
1. Writer B forms its row (seq …525) and waits on the line's lock, held by writer A, whose earlier event was flagged
   (…524).
2. A inserts validated (…526) and commits.
3. B wakes, reads the current stage (validated), accepts its actionable, and commits it with seq …525.

Every reader takes the latest event by `seq DESC`: 16 sites in 10 TypeScript files, and `case_rules`,
`ledger_line_stage`, `packet_version_*`, `priced_line_deadline_status` and `case_next_window_deadline_status`. So the line
reads as validated, and a second actionable passes the trigger. The line then holds flagged, actionable, validated,
actionable: a duplicate forward event, which invariant 1 forbids.

### 1.3 The lock defect reproduced

Probes on databases migrated from empty at e908c21 (44 migrations), PostgreSQL 18.4, synthetic lines only (section 15).
- **A1, the failure.** As the worker's login, one `INSERT … SELECT` of 12,000 flagged events succeeds in 0.90 s, and its
  transaction then holds 12,000 advisory locks. 20,000 fails: `ERROR: out of shared memory`, `HINT: You might need to
  increase "max_locks_per_transaction"`, at `line_status_rules() line 8 at PERFORM`.
- **A2, another practice's failure.** While practice P1's open transaction holds 13,000 of these locks, practice P2's
  2,000-line insert fails 53200 in 68 ms.
- **B, through the job code at 100,000 lines** (`executeTriage` and `generateAuditReport`, as the jobs call them):
  triage fails 53200 at 47.9 s holding 14,844 advisory locks; the report fails 53200 at 51.1 s.
- **R2, the order.** Reproduced as 1.2 describes: events flagged@…524, actionable@…525 (committed last),
  validated@…526, then a second actionable accepted.
- **E1, an empty table's statistics.** After `VACUUM` of an emptied `line_status` (reltuples 0), the trigger's cached
  generic plan for the lookup is a sequential scan. A 100,000-line insert in one transaction had not finished after 9.5
  minutes (the scout saw 7 min 51 s). This happens only while the table's statistics say it is empty: a new
  environment, or a test database.

### 1.4 What stood behind the lock at 100,000 lines

With the lock fixed (option H, section 2.1), the same 100,000-line month ran on (probes C to F, section 15). The worker
task is 0.5 vCPU and 1,024 MiB, with Node's heap at 560 MiB (`infra/lib/environments.ts:111`, `infra/lib/heap.ts:9`).

| # | Defect | Where | Evidence |
| --- | --- | --- | --- |
| 1 | Triage's actionable write is quadratic | `advanceStages` (`execute.ts:330-344`) finds each wanted line's current stage with a `DISTINCT ON` over the practice's events, joined to the wanted set by `IN`. In the triage transaction, the practice's new validated events are its own uncommitted rows, so the planner's statistics do not count them and it chooses a nested loop | Probe F, in the harness's shape (B's 20,000 lines triaged and analysed first): 6,667 actionable lines in 7.1 s, then 33,334 in 196.8 s (25 times as long for 5 times the lines). The case's derivation is not the cause: `case_rules`' aggregate over the same 33,334 lines takes 0.54 s, and a plain `INSERT … SELECT` of 6,000 actionable events 0.78 s |
| 2 | Triage holds every candidate's trace at once | `candidateRows` (`execute.ts:210-252`) reads `p.trace` for every candidate, and `candidateLines` (:282-323) judges them all before any is released. A trace is 4,735 bytes of JSON on average | Probe E, under `--max-old-space-size=560`: heap at 477 MiB after judging and a peak of 531 MiB, 95% of the worker's heap |
| 3 | The report holds every line's trace at once | `runLines` (`apps/worker/src/report/content.ts:366-410`) reads `p.trace` for every line with a shortfall, and `gatherReport` maps them after the read | Probe E: "JavaScript heap out of memory" in `gatherReport`. Without a heap limit (probe C) the report's heap peaked at 1,125 MiB |
| 4 | The report's patient-balance step | `claimLines` (`apps/worker/src/reconcile/remittances.ts:249-262`) looks claims up by `superseded_by_claim_id`, which has no index (`20261016120000_remittances.sql:123`, indexes :134-136). `lineShares` (`apps/worker/src/reconcile/patient-share.ts:107-130`) filters every adjustment for each claim (:116) and for each line (:122) | Probe D: 616.0 s in this step and 693.1 s for the report. With the index (probe C) the step took 49.7 s, and `claimLines` itself 0.97 s (its plan uses the index); the rest is the filtering. With the grouping too, 3.4 s (probe G2) |

The Cases page reads the same candidates on every load: `waitingPatterns` (`apps/web/src/lib/routes/triage.ts:253` →
`patterns.ts:63-66`) reads every validated line waiting outside a case, with its trace, in the web task (1,024 MiB, heap
560 MiB). So defect 2 is also a web memory risk.

---

## 2. The options

Each option is judged on the standing rule's terms. The two that matter most here are reliability (no customer's month
fails, and no practice can make another fail) and the user experience (no person waits on a job they did not start).

### 2.1 The lock

| Option | What it does | Verdict |
| --- | --- | --- |
| A. Raise `max_locks_per_transaction` | An RDS parameter | Rejected: the weakest (below) |
| B. Batch triage into transactions of N lines | Each batch commits, so its locks are released | Rejected |
| C. One practice lock, taken inside the trigger | `line_status:<practice>` instead of per line | Rejected: deadlocks (probe R3) |
| D. One practice lock taken first by every writer | As C, but each writer locks before touching any row | Rejected: people wait on jobs |
| E. 64 lock buckets per practice, taken first in order (ADR 0060's shape) | Bounded locks, as the 835 loader does | Rejected: D's costs for bulk writers, more parts |
| F. A row lock on `service_line` | `SELECT … FOR NO KEY UPDATE` through a definer helper | Rejected |
| G. Set-based checking in a statement trigger | Check the whole statement's rows at once | Rejected |
| **H. A row lock on a per-line head row** | **`line_status_head`, one row per line, locked by `INSERT … ON CONFLICT DO UPDATE`** | **Recommended** |

**A. The parameter alone is the weakest, for six reasons.**
1. It moves the ceiling; it does not remove it. Locks still grow with the largest practice's month, and two large
   triages, or a triage and a reconcile, add up.
2. The table stays shared by every tenant, so one practice can still make another's work fail (probe A2).
3. Shared memory grows with it: about 400 bytes per slot per connection (the scout measured `shared_memory_size` 150 MB
   at 64 and 202 MB at 1,024), on a 4 GiB instance.
4. It is a static parameter: changing it needs a reboot, so a multi-AZ failover.
5. It does nothing for the order race (R2) or the plan (E1).
6. It does nothing for the ledger's per-row locks, or for the four defects behind the lock (1.4).

**B. Batches.** Batching breaks triage's one transaction. A crash between batches leaves lines validated but not
grouped, or a case with part of its lines, visible to people. The report could no longer triage and read in one
transaction (ADR 0038:63-66; `generate.ts:16-18`), so its numbers could mix two triages. And each batch still takes one
lock per line.

**C. A practice lock inside the trigger** takes the lock lazily, at a writer's first stage insert, after the writer may
already hold row locks. The real shapes cross:
- triage inserts flagged events (`execute.ts:444`), then `closeWindows` updates case lines and so their case rows (:446);
- a person's reopen updates a case line, and so its case row (`triage.ts:522-525`), then inserts its stage (:528).

Probe R3 reproduces the cycle, with a shared row standing in for the case row: Postgres detects a deadlock (40P01).
Today's per-line lock, and option H, let both finish.

**D. A practice lock taken first by every writer** is correct and is the fastest (probe V1: 14.9 s against today's
15.9 s for 180,000 events). Its costs:
- **People wait on jobs.** A person's reopen today waits only when a job holds the same line or case. Under D it would
  wait for any whole triage, reconcile or audit report of the practice. The report holds its transaction while it
  prints the PDF and stores it (`generate.ts:79-90`). No `lock_timeout` or `statement_timeout` is set anywhere
  (`packages/db/src/connect.ts`), and the load balancer gives up after 180 s (`infra/lib/constructs/edge.ts:35`). So D
  needs a lock timeout, a new refusal and new words.
- **Every writer, present and future, must take it first,** or a deadlock follows. The database cannot check that
  cheaply.
- **Triage and reconcile serialize** for the whole of each.
- It still needs the `seq` fix.

**E. Buckets.** A large triage or reconcile takes all 64 buckets, so it behaves like D for the jobs that matter: D's
waits, D's rule that every writer locks first, and 64 keys to order. ADR 0060 chose buckets because two loads of one
practice must run side by side. Stage writers do not need that.

**F. A row lock on `service_line`.** It gives per-line serialization with no lock-table entry (probe V2: 11.6 s, 0
advisory locks), but:
- it writes the lock into the tuple headers of the practice's immutable PHI table on every stage event. That dirties
  its pages, clears their all-visible bits and creates freeze work;
- pricing a re-run of the same lines inserts `priced_line` rows whose foreign-key checks take `FOR KEY SHARE` on the
  same lines, so a concurrent triage turns each locked line into a multixact;
- `tp_app` has no `UPDATE` on `service_line` ("loaded records never change", `20261016120000_remittances.sql:485-488`),
  so every row needs a definer helper call.

**G. Set-based checking.** A statement-level trigger cannot see its rows before they are written, so it cannot lock
before it reads. Checking after the insert brings back C's lazy lock and the `seq` order problem. The whole trigger
costs about 4 s per 180,000 events against a floor of 11.9 s (probe FLOOR), which is not decisive either way.

**H. A head row per line (recommended).** The head row carries the line's current stage and the `seq` of its latest
event. The trigger writes it first, which takes the line's row lock, and reads the stage it replaced in the same
statement.
- **Reliability.** No lock-table entry per line (probe H2: 180,000 events in one transaction, 0 advisory locks, 40
  lock-table entries, all relation locks). No practice can exhaust the table for another.
- **The same protection, and no new waits.** One writer per line at a time, in the same order (`ORDER BY
  service_line_id`), so the waits and the freedom from deadlock are today's (probes R1, R3).
- **Correct order.** `seq` is drawn after the lock, so a line's events sort in commit order (probe R2).
- **No planner risk in the trigger.** The lookup is the upsert's arbiter check on the primary key, which the executor
  does through the index, not a planned query. So the empty-statistics plan cannot recur there (probe E2: linear, 20.9
  s for 180,000 events with reltuples 0).
- **No writer changes for locking,** so ADR 0038's one transaction per triage and per report stands, and every future
  writer is covered without remembering anything.
- **Cost.** 18.6 s against today's 15.9 s for 180,000 events (17%, about 2.7 s), plus one small row per line ever
  staged. The head row is a second copy of "the current stage", kept exact by the only code that writes it and proved by
  CAS-40's property.

### 2.2 The four defects behind the lock

**1. The quadratic stage advance.**
- Recommended: **a per-line indexed lookup.** `advanceStages` reads each wanted line's latest event with `LEFT JOIN
  LATERAL (… WHERE s.practice_id = $1 AND s.service_line_id = w.service_line_id ORDER BY s.seq DESC LIMIT 1)`, which the
  index `line_status_by_line` answers exactly, whatever the statistics say. Probe G2: 33,334 actionable lines in 5.0 s
  (from 196.8 s).
- Rejected: reading the stage from `line_status_head`. The application role has no grant on it, by D4, and a definer read
  function adds surface for no gain over the index.
- Rejected: running `ANALYZE` inside the triage transaction. It fixes one plan by accident and costs a full sample on
  every triage.
- Rejected: dropping the filter and letting the trigger refuse lines already at the stage. A refusal aborts the
  statement, and a re-triage must skip them.

**2 and 3. Traces held whole.**
- Recommended: **read in batches through a cursor, and keep only what is judged.**
  - Triage and the report declare a cursor over the query they run today, unchanged, inside the job's transaction, and
    fetch 2,000 rows at a time.
  - Each batch is audited as today (`readWithAudit`, one event per row read), then judged while its traces are in hand:
    triage keeps `CandidateLine`, and the report keeps each row without its trace, plus the two things it takes from the
    trace (the content-gap key and the adjustment behavior).
  - The traces are then released. The order (`ORDER BY service_line_id`) and every computation are unchanged, so the
    output is identical (CAS-41.5).
  - Probe G2, under the worker's heap flag: triage's heap peaked at 213 MiB (from 531), and the report completed with a
    483 MiB peak, where before it ran out of heap. Peaks under the flag include garbage the collector has not yet
    taken, so they overstate what is live.
- Rejected: a larger worker task, or a larger heap. That is a cost every month, and it still grows with every trace in
  the month.
- Not now: fully streaming aggregates. The report would fold its figures batch by batch and stream its CSV to storage,
  so memory would no longer grow with the month's lines. It rewrites the report's aggregation, whose figures are audited,
  for headroom the 100,000-line target does not need: batching cut triage's heap peak from 531 to 213 MiB and let the
  report finish under the flag. This design records the trigger for it: the weekly run's chain peak passing 70% of the
  task.

**4. The report's patient-balance step.**
- Recommended: **the index and the grouping.**
  - `claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL`, the twin of
    `claim_by_reversed` (`20261016120000:136`). `claim` is not under the ledger freeze. The "Interest credited twice"
    design (`designs/ledger-interest-once.md` D8, LED-25) specifies the same index with the same name, so whichever PR
    merges first carries it and the other drops it.
  - `lineShares` groups the adjustments once, by claim and by line, in their order, instead of filtering all of them
    for each claim and each line.
- Rejected: rewriting `claimLines` without the recursive lookup. It is the ledger's correction chain (docs/adr/0067),
  and the index makes it 0.97 s.

---

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | A new practice-scoped table `line_status_head`: one row per line that has any stage event, with the line's current stage and the `seq` of its latest event. Primary key `(practice_id, service_line_id)`. | Option H. The key leads with `practice_id` for the catalog rule (`packages/db/src/catalog.ts:369-370`) and the tenant policy, and it is the upsert's arbiter. |
| D2 | `line_status_rules()` takes the line's lock by writing its head row with one `INSERT … ON CONFLICT (practice_id, service_line_id) DO UPDATE … RETURNING WITH (OLD AS prior, NEW AS next) prior.stage, next.seq`. The `pg_advisory_xact_lock` call is removed. | The upsert waits for any other writer of the line, then locks the row. `prior.stage` is the stage before this event (null for a line's first event), and the checks run against it, unchanged. A refusal raises and undoes the head write with the statement. PostgreSQL 18's `RETURNING OLD` is available everywhere this runs: RDS `VER_18` (`database.ts:127`), the compose and harness images (`postgres:18`), and CI. |
| D3 | `NEW.seq` is set from the head row: the identity value the row already drew for a line's first event, and otherwise a new `nextval` drawn after the lock. | A line's first event cannot race an earlier one: any committed or in-flight event of the line holds or waits on the head row, so the insert would conflict instead. Every later event draws its number while it holds the lock, so `seq` follows commit order. |
| D4 | `line_status_rules()` becomes `SECURITY DEFINER`, owned by `tp_owner`, with `SET search_path = pg_catalog, public, pg_temp` and `REVOKE ALL … FROM PUBLIC`. `line_status_head` has no grant to any login role. | The trigger is then the only writer of the head rows, and `nextval` on `line_status_seq_seq` needs no sequence grant (none exist anywhere today). Row-level security still applies to the owner (`FORCE`) and reads the session's `app.practice_ids`, so a head row can only be written in the writer's own practice. Precedent: `line_status_refresh_cases` (`20261023090000:837-845`). |
| D5 | No foreign keys on `line_status_head`. | The `line_status` row the trigger is checking carries the same references (`practice`, `service_line`), checked in the same statement, and `line_status_belongs` checks the line's practice. The two extra checks cost 3.9 s per 180,000 events (probe H1, 22.4 s, against H2, 18.6 s). What the head row must satisfy is "equals the line's latest event", which a foreign key cannot express; CAS-40.5's property and CAS-40.6's backfill check it. |
| D6 | `line_status_head` has `line_status`'s guards: `never_deleted` and `no_truncate` triggers, forced row-level security with the tenant policy, and a registry row (so the cross-tenant tests cover it). | It is part of the stage log's state, and its rows go only with the log's. |
| D7 | No writer's code changes for locking. Triage, the report, opening a case, reconcile, manual ledger work and the reopen keep their transactions, their outer locks (`triage:`, `ledger:`) and their statements' meaning. | The per-line protection moves inside the database, unchanged in grain. ADR 0038:63-66 ("an advisory lock per practice") stays true. |
| D8 | Under Q1 (a ledger freeze exception): `ledger_entry_within_evidence()` and `ledger_entry_within_line()` take `pg_advisory_xact_lock(hashtextextended('ledger:' \|\| NEW.practice_id::text, 0))`, the same key `lockLedger` takes (`reconcile/ledger.ts:16-18`), instead of one key per evidence row and per line. Nothing else in either body changes. | Every `ledger_entry` insert runs after `lockLedger`: the reconcile pass (`pass.ts:39`) and each manual action's first statement (`manual.ts:46-50`, called at :71, :101, :136, :178 and :229). There is no SQL writer of `ledger_entry`. Re-taking a lock the transaction holds adds no lock-table entry (probe L1) and cannot deadlock. The trigger still serializes any writer that forgets `lockLedger`, at a coarser grain. |
| D9 | `max_locks_per_transaction` stays at its default (64), in RDS, CI and the harness. | Option A. The tests prove a per-transaction bound that does not depend on it. |
| D10 | The release-capacity run gains three checks: a measured job completes on its first attempt; no backend holds more than 64 advisory locks at any sample over the run (`TRACE_LOCK_BUCKETS`, the loader's bound); and the chain phase's memory is sampled, with A's triage and A's report reported separately. Under Q1 it also gains a reconcile phase. | Today a 53200 that a retry survived would pass, the lock count is not measured, and the status file attributed the run's 803.9 MiB peak to pricing, although the concurrent phase, where pricing ran, peaked at 556.7 MiB. |
| D11 | The stored per-content windows stay with #8. | `releaseContentWindows` (`apps/worker/src/price/release.ts:274-291`) aggregates `rule_record`. Its callers are the web's Content through (`apps/web/src/lib/releases/content-through.ts:87`, :90), the price job (`price/execute.ts:389`) and the harness. Triage reads `rule_release_content_span()` (`release.ts:148`, via `execute.ts:261`). It shares nothing with this item's locks, tables or memory. |
| D12 | `advanceStages` reads each wanted line's latest event with a `LEFT JOIN LATERAL` lookup on `(practice_id, service_line_id)` ordered by `seq DESC LIMIT 1`. | Section 2.2, defect 1. The same rows are filtered out, so the same events are written. |
| D13 | One candidate reader, `judgedCandidates(scope, practiceId, pricingRunId, requestId)`, reads `candidateRows`' query through a cursor in batches of 2,000, audits each batch, judges it with `candidateLines`, and returns only the `CandidateLine`s, in the same order. Triage (`execute.ts:447`) and `planWaiting` (`patterns.ts:63-66`, so opening a case and the Cases page) use it. `candidateRows` and `candidateLines` stay, for the reader and for tests. | Defect 2, and its web twin. |
| D14 | The report reads `runLines`' query the same way. While a batch's traces are in hand it computes each line's content-gap key and adjustment behavior, then keeps the row without its trace. The mapping (`content.ts:536-568`) uses the precomputed values. | Defect 3. |
| D15 | The migration adds `claim_by_superseded` (section 4.4). | Defect 4. Shared with the "Interest credited twice" design; the first to merge carries it. |
| D16 | `lineShares` (`patient-share.ts:107-130`) groups the adjustments once into two maps, claim-level by claim and line-level by line, keeping their query order, and reads them from the maps. | Defect 4. The same adjustments, in the same order, reach the same arithmetic. No ledger table, ledger package, matching rule or recovered total changes, so this is not a freeze item. LED-01 to LED-17 and the oracle are its guard. |

---

## 4. Schema: one migration, `20261109090000_line_status_heads.sql`

It comes after #42's `20261107090000_mail_streams.sql` and SS-01's `20261108090000_suspension_refusal.sql`. The builders
take the next free timestamp at the time. Like every migration, it runs in one transaction as `tp_owner`
(`packages/db/src/migrate.ts:116-126`).

**#42 and SS-01 overlap: none.** #42's migration creates or replaces only mail, dunning, support and screening
functions and `operator_due_support_notices`. SS-01's replaces the suspension functions and triggers. Neither touches
`line_status`, `line_status_rules`, `ledger_entry_within_*`, `claim`'s indexes, `case_line` or any triage function. This
was re-checked at #42's head 098636e3 and in `designs/ss-01-suspension.md` section 4. So this migration recreates no
function from either body. The builders re-check at both PRs' final merged heads before writing.

### 4.1 Preflight

The migration begins by asserting that the bodies it replaces are the ones this design read, so a later edit elsewhere
cannot be silently overwritten:
- `line_status_rules()`'s definition contains `'line_status:' || NEW.service_line_id`;
- under Q1, the two ledger functions contain `'ledger_evidence:' || row_id` and `'ledger_line:' || NEW.service_line_id`;
- no index named `claim_by_superseded` exists. If the interest PR merged first, the builders drop section 4.4 instead.

Otherwise it raises, and nothing applies.

### 4.2 `line_status_head` (Triage area; practice-scoped; registered)

```sql
-- One row per service line with any stage event: the line's current stage and the order number (seq) of its
-- latest event. line_status_rules() is its only writer, and writing it is the line's lock (docs/adr/0083).
CREATE TABLE line_status_head (
  practice_id uuid NOT NULL,
  service_line_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('flagged', 'validated', 'actionable', 'payer_approved', 'recovered')),
  seq bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_status_head_pkey PRIMARY KEY (practice_id, service_line_id)
);
INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('line_status_head', '20261109090000_line_status_heads', 'line_status_head_tenant');
ALTER TABLE line_status_head ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_status_head FORCE ROW LEVEL SECURITY;
CREATE POLICY line_status_head_tenant ON line_status_head
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE TRIGGER line_status_head_never_deleted BEFORE DELETE ON line_status_head FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();
CREATE TRIGGER line_status_head_no_truncate BEFORE TRUNCATE ON line_status_head FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();
REVOKE ALL ON line_status_head FROM PUBLIC;
```

It holds identifiers, a stage and a number, never PHI values. It is registered anyway, as every practice-scoped table
is, so the catalog and cross-tenant tests cover it.

**Backfill, in the same transaction, before the trigger changes:**

```sql
LOCK TABLE line_status IN SHARE ROW EXCLUSIVE MODE;
SELECT set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true);
INSERT INTO line_status_head (practice_id, service_line_id, stage, seq)
SELECT DISTINCT ON (s.service_line_id) s.practice_id, s.service_line_id, s.stage, s.seq
  FROM line_status s ORDER BY s.service_line_id, s.seq DESC;
SELECT set_config('app.practice_ids', '{}', true);
```

The lock stops the running image's stage writes for the length of the backfill, so no event can land between the
backfill and the new trigger. No customer data exists before launch, and the read took 0.4 s for 180,000 events in the
probe, so this is a few seconds per million with the insert. The scope setting follows the house precedent for a
backfill under forced row-level security (`20261101090000_billing_review.sql:49-51`), with every practice, deleted ones
included.

### 4.3 `line_status_rules()` (on `20261023120000:550-579`)

```sql
CREATE OR REPLACE FUNCTION line_status_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_stage text;
  next_seq bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a line''s stage events never change; a reopen is a new event' USING ERRCODE = 'check_violation';
  END IF;
  -- The line's lock: its head row, written first. A writer of the same line waits here until the other commits;
  -- prior.stage is the stage this event follows (null for the line's first), and seq is drawn under the lock, so a
  -- line's events sort in commit order (docs/adr/0083).
  INSERT INTO line_status_head AS h (practice_id, service_line_id, stage, seq)
  VALUES (NEW.practice_id, NEW.service_line_id, NEW.stage, NEW.seq)
  ON CONFLICT (practice_id, service_line_id)
    DO UPDATE SET stage = EXCLUDED.stage, seq = nextval('line_status_seq_seq'::regclass), updated_at = now()
  RETURNING WITH (OLD AS prior, NEW AS next) prior.stage, next.seq INTO current_stage, next_seq;
  NEW.seq := next_seq;
  -- From here the checks are 20261023120000's, word for word.
  IF NEW.reopened_from IS NULL THEN
    …
  END IF;
  NEW.set_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION line_status_rules() FROM PUBLIC;
```

Notes for the builders:
- The `RETURNING` aliases are needed. In PL/pgSQL, bare `old` and `new` are the trigger's own records; the probe's
  first version failed with "column reference "old.stage" is ambiguous".
- The checks and their messages are unchanged, byte for byte (section 6).
- A refused event raises after the head row was written. The exception undoes the write with the statement, or with
  the caller's savepoint.
- The trigger keeps its name and timing (`BEFORE INSERT OR UPDATE … FOR EACH ROW`), so `line_status_ledger_rules` still
  fires first, and the AFTER triggers are untouched.
- The sequence is named by `regclass`. A test asserts `pg_get_serial_sequence('line_status', 'seq')` is
  `public.line_status_seq_seq`, so a renamed sequence fails a test, not production.

### 4.4 `claim_by_superseded` (unless the interest PR merged first)

```sql
-- claimLines' correction chain (apps/worker/src/reconcile/remittances.ts) looks claims up by the claim they
-- supersede; the twin of claim_by_reversed (docs/adr/0083).
CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL;
```

It is built inside the migration's transaction (no `CONCURRENTLY` in a transaction). It holds a `SHARE` lock on `claim`
while it scans: seconds at launch size, during which 835 loads wait and then proceed.

### 4.5 The ledger triggers (only under Q1; on `20261027090000:147-201` and :219-270)

`CREATE OR REPLACE FUNCTION ledger_entry_within_evidence()` and `ledger_entry_within_line()`, each a copy of its
20261027090000 body with one line changed:
- :172 `PERFORM pg_advisory_xact_lock(hashtextextended('ledger_evidence:' || row_id::text, 0));` becomes
  `PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));`;
- :246 `PERFORM pg_advisory_xact_lock(hashtextextended('ledger_line:' || NEW.service_line_id::text, 0));` becomes the
  same `ledger:` line.

Each gets a one-line comment naming ADR 0083 and the exception. Both stay invokers, keep `SET search_path`, and keep
`REVOKE ALL … FROM PUBLIC` as before. A db test diffs each new body against 20261027090000's, apart from the lock line
and the comment.

### 4.6 Grants, exactly

- `line_status_head`: `REVOKE ALL … FROM PUBLIC`; no grant to `tp_app`, `tp_operator`, `tp_billing`, `tp_esign`,
  `tp_screening` or `tp_job`. Owned by `tp_owner`.
- `line_status_rules()`: owned by `tp_owner`, `SECURITY DEFINER`, `REVOKE ALL … FROM PUBLIC`, no `EXECUTE` grant (a
  trigger function needs none to fire).
- `line_status` and `claim`: grants unchanged.
- No sequence grant.
- Under Q1, the two ledger functions: unchanged ownership and grants.

### 4.7 Safe with the previous image running, and on rollback

| The previous image does | On the new schema |
| --- | --- |
| Inserts stage events (triage, report, open case, reconcile, manual ledger, reopen) | The same statements, the same refusals and messages; the head row is written inside the trigger. During the backfill's seconds, inserts wait on the table lock, then proceed. |
| Reads the current stage by `seq DESC` (16 sites) | Unchanged, and now right under concurrency. |
| Triages and reports with whole reads and the old stage-advance statement | Works as before, slow and memory-bound at real size as before, until the new image runs. |
| Loads 835s (inserts `claim`) | Waits on the index build's lock for its seconds, then proceeds. |
| Inserts ledger entries (under Q1) | The same; the trigger re-takes the `ledger:` lock the writer holds. |

Rollback is the previous image on this schema (ADR 0009:42-43), the table above: nothing in the previous image depends
on the new table or index. Migrations are forward-only. If the trigger itself had to be undone, a later migration would
restore 20261023120000's body; the head table could stay, unused, since it is derivable. The dry run, forward, is the
house check (ADR 0009:37-43).

---

## 5. Application changes

### 5.1 No mutation changes, and none is added

Every mutation that writes a stage keeps its Zod schema, its role check, its practice-scoped transaction (`SET LOCAL
app.practice_ids, app.actor_id`) and its audit event:
- the reopen route: `reopenLineAction`, permission `case.work`, input `z.object({ caseLineId: opaqueId, reason:
  requiredText(500) })`, audit `case_line_reopened` (`apps/web/src/lib/routes/triage.ts:503-538`);
- the triage action: `triageRunAction`, which only enqueues (:435-449);
- the workbench's open-case route, through `openCaseOnPattern`;
- the manual ledger actions, through `manual.ts`, each checking its permission in `begin` (:46-50).

The check stays in both places: the handler checks the role and the line's state, and Postgres checks the stage rules,
now with a lock that holds at any size.

### 5.2 Triage (`apps/worker/src/triage/execute.ts`)

1. **`advanceStages`** (:326-344), D12:

   ```sql
   INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id)
   SELECT $1, w.service_line_id, $4, w.priced_line_id
     FROM unnest($2::uuid[], $3::uuid[]) AS w (service_line_id, priced_line_id)
     LEFT JOIN LATERAL (SELECT s.stage FROM line_status s
                         WHERE s.practice_id = $1 AND s.service_line_id = w.service_line_id
                         ORDER BY s.seq DESC LIMIT 1) cs ON true
    WHERE cs.stage IS NULL OR line_stage_rank(cs.stage) < line_stage_rank($4)
    ORDER BY w.service_line_id
   ```

2. **`judgedCandidates`** (new, beside `candidateRows`), D13:
   - `DECLARE triage_candidates NO SCROLL CURSOR FOR <candidateRows' query>` with the same two parameters. Moving the
     query text into one constant both use keeps them identical.
   - Then `FETCH 2000` in a loop. Each batch goes through `readWithAudit` (purpose `triage`, one event per row, as today),
     then through `candidateLines(client, batch)`; the batch's `CandidateLine`s are appended. Then `CLOSE`.
   - `triageInScope` (:447) and `planWaiting` (`patterns.ts:63-66`) call it.
   - The cursor lives in the transaction both already run in. The web's Cases page runs `waitingPatterns` inside
     `withPracticeScope`, which is a transaction.
   - The batch size is a named constant, `CANDIDATE_BATCH_LINES = 2000`.

### 5.3 The report (`apps/worker/src/report/content.ts`)

1. **`runLines`** (:366-410), D14: the same cursor-and-batch shape, with purpose `audit_report`. It takes `spans` and
   `references`, which `gatherReport` already reads before it (:516-517). For each row of a batch it computes
   `contentGapsOf(trace, spans)` and `detectBehavior(trace, references)` while the trace is in hand, then keeps the row
   with `trace: null` and the two values.
2. **The mapping** (:536-568) uses the two values instead of parsing the trace again. `behavior` is still used only when
   the line validates, as today.
3. **`lineShares`** (`apps/worker/src/reconcile/patient-share.ts:107-130`), D16: one pass builds `claimLevelOf`
   (adjustments with no line, by claim) and `lineLevelOf` (by line), in query order; the two `filter` calls read from
   them.

### 5.4 The release-capacity harness (D10, `tools/release-capacity`)

- `run.ts`:
  - `jobOutcome` (:228-240) also reads `pgboss.job.retry_count`;
  - the chain's `waitForJobs` gets a tick that samples `memory.current` each second, for A's triage and for A's report
    separately;
  - a sampler reads, each second over the whole run, the largest advisory-lock count held by any one backend:
    `SELECT coalesce(max(n), 0) FROM (SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' GROUP BY pid) x`.
- `checks.ts`, three new failing checks:
  - a measured job completed on attempt N > 1;
  - a backend held more than `ADVISORY_LOCKS_PER_TRANSACTION` (64, the value of `TRACE_LOCK_BUCKETS`, imported, not
    copied);
  - a chain peak above 90%, reported with its job.

  The summary's table gains an "Attempts" column, and the memory line names the triage and report peaks.
- Under Q1, `scenario.ts` and `run.ts` add step 7b, "A's reconcile". A SYNTHETIC posting export posts every one of A's
  actionable lines at its expected amount (`packages/synth/src/formats` writes it). It is uploaded through intake,
  parsed, reconciled by the reconcile job, and measured like the chain.
- `checks.test.ts`: each new rule, failing and passing.

### 5.5 Documents

- ADR 0083 (new): sections 2 and 3, and the rule that a statement over a month's lines looks each line up through an
  index (the planner cannot count a transaction's own rows).
- ADR 0038: a dated note under "Who triages and when", saying that the per-line lock is a row lock (0083). Its sentence
  "an advisory lock per practice" stays true.
- `docs/runbooks/ci.md` (the `release-capacity` rows, :44-45): the new checks, and how to read a lock-count or attempt
  failure.

---

## 6. Every sentence a person reads, word for word

**None changes, and none is added.** No page, notice, email, PDF, CSV column or job message changes. These are the
sentences this change runs through, kept byte for byte. The database raises them as 23514, and the web shows them as
the reopen form's error (`apps/web/src/lib/http/invoke.ts:317-321`):
- "line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason"
- "a reopen names the stage the line is at"
- "a reopen keeps the line at its stage or moves it back; moving forward is not a reopen"
- "a reopen is a person's explicit action"
- "a line's stage events never change; a reopen is a new event"

Under Q1, the ledger's messages ("the posted or deposited entries of a posting or EFT row never sum past the row's
amount", and the others in the two bodies) are unchanged too.

**What people stop seeing**, because the cause is gone: for a large month, the practice home's failed-job notice for
triage and for the audit report (`apps/web/src/app/p/[practiceId]/page.tsx:43-56` names the jobs), and the report's
failure sentence, "The report job failed three times (…) and the operator was alerted; generate a new report once it is
fixed." (`apps/web/src/lib/reports/queries.ts:61-69`). Their words do not change.

Brand rules (CO-11, BRAND.md) are therefore untouched. The words this PR adds are documents, not product copy: ADR
0083, the migration's comments, the domain model's rows and the runbook paragraph, all in the house style.

---

## 7. Tests

Each test fails first on e908c21 (or on #42 and SS-01's merged head) and passes after this PR, except where it says it
is a guard. Coordination between two connections waits on `pg_stat_activity` (the second backend's `wait_event_type =
'Lock'`), never on a sleep.

### CAS-40: a line's stage events keep their rules and their commit order under concurrent writers

`packages/db/src/line-status.db.test.ts` (new), on a database migrated from empty, with two application-role
connections in the practice's scope and lines from the row factory:
1. **Two forward events for one line.** A writes validated and holds its transaction. B's validated waits. A commits,
   and B is refused with "line stages move forward only; …". The line has one validated event. (A guard: passes today.)
2. **Order follows commits.** A writes flagged. B's actionable waits. A writes validated and commits, then B commits.
   By `seq` the events are flagged, validated, actionable; the head row says actionable at the last `seq`; a third
   writer's actionable is refused. **Fails first:** B's event sorts before validated, and the third actionable is
   accepted (probe R2).
3. **A person's reopen against a forward move.** The line is at validated. A (in no one's name) writes actionable and
   holds. B, as a person, writes a reopen from validated with a reason, and waits. A commits, and B is refused with "a
   reopen names the stage the line is at". (A guard.)
4. **No new deadlock.** The shapes of `execute.ts:444-446` and `triage.ts:522-528`: T1 writes a stage for line F; T2
   updates case line X (and so its case); T1 updates case line X and waits; T2 writes a stage for line X. Both commit.
   (A guard: a practice lock in the trigger raises 40P01 here, probe R3.)
5. **The rules and the head row, as a property** (fast-check, 100 runs, sequential). Random sequences of events over
   three lines (forward or reopen, by a person or by no one, any stage) are accepted by the database exactly when a pure
   model of the four rules accepts them. After every step, each line's head row equals its latest event by `seq`.
6. **The backfill.** On a database migrated to SS-01's head, with events written for several lines (reopens included),
   applying this migration leaves one head row per line, equal to its latest event.
7. **The pieces.**
   - `line_status_rules` is `SECURITY DEFINER`, owned by `tp_owner`, with its `search_path`.
   - `line_status_head` has forced row-level security, its registry row, no grant to any login role, and its two guards.
   - `pg_get_serial_sequence('line_status', 'seq')` is `public.line_status_seq_seq`.
   - `claim_by_superseded` exists with its predicate.
   - Under Q1, each ledger body equals 20261027090000's except its lock line and comment.

### CAS-41: no transaction holds a lock-table entry per line, and a 100,000-line month triages and reports within the worker's heap

1. **One transaction, 30,000 events** (`line-status.db.test.ts`). As the application's login, one `INSERT … SELECT` of
   30,000 events completes, and the advisory locks its backend holds afterwards are 0. **Fails first:** 53200, or
   30,000 locks where the cluster's table is larger.
2. **Another practice is unaffected.** While practice A's transaction holds its 30,000 events open, practice B's 2,000
   events commit. **Fails first:** 53200 (probe A2).
3. **Empty statistics.** After `VACUUM ANALYZE` of the empty `line_status` and `line_status_head`, 40,000 events in one
   transaction take less than six times as long as 10,000 (linear is about four times; the old plan was about
   sixteen). **Fails first:** the old lookup's cached sequential scan (probe E1).
4. **The jobs at real size** (`apps/worker/src/triage/triage.large.db.test.ts`, new; `TP_LARGE_TRIAGE_LINES`, 100,000 by
   default). It has the harness's shape, which probe F/G used: B's 20,000-line month is priced, triaged and analysed
   first. Then A's month is priced, triaged by `executeTriage` and reported by `generateAuditReport`. The triage and the
   report run in a child process with the worker's heap flag (`heapFlag('worker')`, `infra/lib/heap.ts`), as
   `era-export.large.db.test.ts` runs its bound. It asserts:
   - both complete, the child exits 0, and no heap error is logged;
   - every candidate's stage events are present;
   - the advisory locks held by any backend, sampled every 25 ms (`era-export.large.db.test.ts:115-150`'s pattern),
     never exceed 1 (the practice's `triage:` lock);
   - A's actionable write takes under 30 s;
   - the times are under the budgets in section 8.4.

   **Fails first:** 53200 at the validated insert, and then, with only the lock fixed, the actionable time and the
   report's heap.
5. **The same answers** (`triage.db.test.ts`, `report.db.test.ts` and a new `batched.db.test.ts`). On the existing
   CAS fixtures, and on a generated 10,000-line run with several patterns, held lines, window-passed lines, per-visit
   lines and content gaps:
   - `judgedCandidates` returns the same `CandidateLine`s, in the same order, as `candidateLines(candidateRows(…))`;
   - the batched report gives byte-identical content and CSV to the whole read. The test pins the report's ID and
     date, so the two runs can be compared;
   - `lineShares` gives the same shares as the filtering version, which is kept in the test as the reference;
   - the audit events are the same set, one per row read.
6. **Under Q1, reconcile at size** (`apps/worker/src/reconcile/reconcile.large.db.test.ts`, new): 20,000 case lines,
   each posted by one row of a SYNTHETIC posting export, reconciled in one pass. The pass completes; the 20,000 posted
   entries are written; each line reaches the stage its entries put it at; and no backend holds more than 1 advisory
   lock (the practice's `ledger:` lock). **Fails first:** 53200 (about 40,000 evidence and line locks).

### CAS-42: the weekly real-size run passes, every measured job on its first attempt, no transaction above 64 advisory locks

1. **Unit** (`tools/release-capacity/checks.test.ts`): each new rule fails when it should and passes when it should: a
   job completed on its second attempt; a backend sampled at 65 advisory locks; a chain peak above 90%; and an unread
   attempt count or lock sample fails closed.
2. **The weekly run** (`.github/workflows/release-capacity.yml`, unchanged, at `FULL_SIZE`: A 100,000 lines, B 20,000,
   under release 900110):
   - A's triage and A's report (and, under Q1, A's reconcile) complete on attempt 1;
   - no backend holds more than 64 advisory locks at any sample;
   - `memory.peak` stays at or under 90% of 1,024 MiB;
   - the chain's peaks are reported per job.

   **Fails first:** today's run (A's triage and report failed, capacity summary).
3. **Before and after on the PR:** run the harness once with `--worker-image` on the base's image and once on the
   head's, against the same release directory (section 8.2), and put both summaries in the PR.

### Tests updated, not added

- `packages/db/src/catalog.db.test.ts`: the registry list (from :66) gains `line_status_head`.
- `packages/db/src/migrate.db.test.ts`: the owners list (from :100) gains `line_status_head`. The Drizzle mirror check
  (:596-618) passes with `lineStatusHead` in `packages/db/src/schema/triage.ts`, and `claim_by_superseded` in
  `schema/remittances.ts`.
- The generated cross-tenant tests (`cross-tenant.db.test.ts`) cover the new table from its registry row. It has no
  application INSERT grant, which the test already handles (:212-215).
- Unchanged and still passing:
  - `apps/worker/src/triage/triage.db.test.ts` (:296-340 among them), the ledger tests LED-01 to LED-17 and the oracle;
  - the e2e journeys J8 (`apps/web/e2e/triage.spec.ts:41`) and J12 (`apps/web/e2e/reports.spec.ts:88`);
  - the helpers that insert stage events directly (`apps/web/src/lib/routes/test-support/triage-world.ts:109`,
    `packet-world.ts:97` and :112, `apps/web/e2e/packets.ts:199`, `apps/worker/src/packets/test-support/packet-world.ts:150`).
- No new e2e journey: nothing a person sees changes.

### Test matrix rows (`docs/product/test-matrix.md`, after CAS-39; `packages/synth/src/cases/matrix.ts` word for word)

| ID | Title | Expected |
| --- | --- | --- |
| CAS-40 | Concurrent writers of one line's stages | The second of two forward events is refused; a reopen naming a stage that has since moved is refused; a line's events sort by commit order, so a duplicate forward event is refused; no new deadlock; every line's head row equals its latest event |
| CAS-41 | A real-size month triages and reports | 30,000 stage events in one transaction hold no advisory lock per line, and another practice's events commit meanwhile; a 100,000-line run triages and reports in one transaction each under the worker's heap flag, holding at most its practice's one advisory lock, within the time budget, with the same answers as reading it whole |
| CAS-42 | The weekly real-size run | A's triage and audit report (and reconcile) complete on their first attempt under release 900110, no backend holds more than 64 advisory locks, and the worker's memory peak stays at or under 90% |

`packages/synth/src/cases/registry.ts`, each entry with the test files above:
- `'CAS-40': none(8, 'Concurrent stage events on generated lines: no file.', […])`;
- `'CAS-41': none(8, 'Generated at size by the test: no file.', […])`;
- `'CAS-42': none(8, 'The weekly run builds release 900110 outside the repository: no file.', […])`.

---

## 8. The measurement

### 8.1 What "within the worker task" means

- The worker task: 0.5 vCPU and 1,024 MiB (`infra/lib/environments.ts:111`), Node's heap at 560 MiB (`infra/lib/heap.ts:9`).
- A job attempt expires after pg-boss's 15 minutes, with three attempts in all (`apps/worker/src/jobs/registry.ts:110-142`).
- The weekly run fails above 90% of the task's memory (921.6 MiB, `tools/release-capacity/checks.ts:12`).
- This design adds: a measured job completes on its first attempt.

### 8.2 The weekly workflow, and the local reproduction

- **Weekly.** `release-capacity.yml` runs on Tuesdays at 03:29 UTC and on request, from the default branch
  (`claude/build-platform` since F1 (a)). With this PR it reads three new checks (D10) and, under Q1, one more phase. On
  a failure it opens or comments on the issue "Release capacity test failing" (`docs/runbooks/ci.md:44-45`).
- **Locally, the same harness**, under `flock /tmp/laneb-heavy.lock`:
  `pnpm exec tsx tools/release-capacity/run.ts --out <dir> --runtime process --images <dir> --admin-url
  postgres://postgres:test@localhost:5433/postgres --database tp_capacity_<name> --release-dir <dir>`. The release
  directory is built once with `tools/release/scale.ts --shape quarterly`. `--small` proves the harness end to end and
  measures nothing.
- **Locally, the large test alone** (CAS-41.4; about six minutes rather than the hour the release load takes), under the
  same lock: `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db
  apps/worker/src/triage/triage.large.db.test.ts`.

### 8.3 What the probes measured (100,000 lines through the job code)

The probes ran this container's PostgreSQL 18 (64 locks per transaction, 100 connections) and the job code, in the
shape of `price.large.db.test.ts`:
- half the lines Medicare Advantage non-contracted, and half under a SYNTHETIC 110% contract with a 365-day window;
- encrypted SYNTHETIC claim numbers;
- 66,666 lines validated, and 33,334 actionable in one case.

Probes F, G and G2 first triaged a 20,000-line practice and analysed, as the harness does. G and G2 ran under the
worker's heap flag, `--max-old-space-size=560`. The candidate fixes were applied in the probe's own clone, never
committed.

| Probe | Code | A's triage | A's report |
| --- | --- | --- | --- |
| B | Today | Fails 53200 at 47.9 s, 14,844 locks | Fails 53200 at 51.1 s |
| C | Lock fixed, index | 259.7 s (actionable 208.0 s); heap peak 626 MiB | 126.0 s; heap peak 1,125 MiB |
| D | Lock fixed, no index | 261.0 s | 693.1 s (patient balance 616.0 s) |
| E | As C, heap flag 560 | 267.3 s; heap peak 531 MiB | **Heap out of memory** |
| F | As C, harness shape | 244.1 s (actionable 196.8 s) | 112.8 s; heap peak 849 MiB |
| G | All fixes but D16, heap flag 560 | **53.9 s** (candidates 34.2, validated 9.3, case lines 3.9, actionable 5.3); heap peak 209 MiB | **Completes**, 187.0 s (patient balance 111.9 s); heap peak 405 MiB |
| G2 | All fixes, heap flag 560 | **49.8 s** (candidates 32.7, actionable 5.0); heap peak 213 MiB | **73.1 s** (gather 51.4, of which patient balance 3.4); heap peak 483 MiB |

Every probe held at most 1 advisory lock after the fix (the practice's `triage:` lock).

### 8.4 Budgets

CAS-41.4's limits, set at about two and a half times probe G2 (this container's 4 CPUs are a GitHub runner's), so they
catch a return of any defect in 1.4, each of which cost minutes, without flaking on a slow runner:
- A's triage under 120 s (G2: 49.8 s), and its actionable write under 30 s (G2: 5.0 s; the quadratic statement took
  196.8 s);
- A's audit report under 180 s (G2: 73.1 s; without the index 693.1 s);
- no heap error under the worker's heap flag (the report ran out of heap without D14);
- at most 1 advisory lock held by any backend.

The weekly run measures the same jobs at the worker task's 0.5 vCPU. Its times stay advisory, as the founder ruled for
the screening's capacity test (2026-10-23), which this run follows (`checks.ts:1-9`). Its hard limits are the job's 15-minute attempt, the first-attempt check, the lock
bound and 90% of memory. At half a CPU the JavaScript parts take about twice as long, so A's triage and report should
take minutes, well inside one attempt.

---

## 9. The domain model and the function files

**Regenerate in this PR, on the tree with #42 and SS-01 merged:** `pnpm db:domain-model --out`, from a database migrated
from empty.

**What changes in `docs/product/domain-model.md`:**
- the new `line_status_head` table, in the "Pricing, triage and cases" area;
- `claim`'s new index, `claim_by_superseded` (unless the interest PR carried it first);
- `line_status_rules`'s row, now `SECURITY DEFINER`;
- under Q1, the two ledger functions' rows (their bodies, through the function files).

**What changes in `packages/db/functions`:**
- changed: `line_status_rules.sql`;
- under Q1, changed: `ledger_entry_within_evidence.sql` and `ledger_entry_within_line.sql`.

**Inputs the generator needs:**
- `packages/db/domain-model/areas.json` (#42's file) places `line_status_head` in the triage area (:74-93). The area's
  "about" gains one clause: "each line's current stage is also kept on one head row, which orders its events".
- `docs/product/data-dictionary.md` stays verbatim. If `--strict` asks, the builders add the
  `divergence-explanations.json` entry it names for the new table.

**Gates:**
- `pnpm db:domain-model --check --require-approval` passes only with the founder's line.
- The PR is opened with `pnpm db:domain-model --summary-since origin/claude/build-platform --function-diffs list`.
- The regenerated function files are committed before the founder signs, since a commit after the approval dismisses it.
- The approval line goes up as one suggested-change comment on that line (CLAUDE.md "Schema gate";
  `.claude/skills/new-migration`), never written by a session and never as a review.

---

## 10. What the founder must approve or rule

1. **Approve `docs/product/domain-model.md`** by its SHA-256, on the PR's latest commit (CO-02; ADR 0063).
2. **Q1. A ledger freeze exception for D8.** Recommended: grant it.
   - **The freeze** (reconciliation-001.md, "Ledger semantics"): "No migration alters, or adds a trigger or policy to,
     `ledger_entry`, `ledger_match`, `posting_row`, `eft_row` or `roi_statement`." D8 replaces two trigger functions on
     `ledger_entry`.
   - **What changes:** the key of one lock in each, from one key per posting or EFT row and per line to the practice's
     `ledger:` key, which every ledger writer already holds before it writes. No check, refusal, message, amount,
     stage or entry changes. LED-01 to LED-17 and the oracle run unchanged, and `packages/ledger` is untouched.
   - **Why now:** with only the stage lock fixed, a reconcile that posts a large dispute set in one pass still takes
     about two locks per line, and fails 53200 as triage did. A large practice's first posting export after its payers
     reprocess would fail three times, and could make other practices' work fail meanwhile.
   - **If not granted:** everything else ships. The ledger part becomes its own item (SUITE-CAP-2, handed to the queue
     with this design's section 4.5 and CAS-41.6), and the release-capacity run gets its reconcile phase with that item.
     Until then, a real-size reconcile can fail.
   - **With the "Interest credited twice" item** (LED-23 to LED-25, which also waits for a ledger freeze exception), the
     two can be granted together. Whichever PR lands second recreates any shared ledger function on the first's body.
     Neither changes the other's lines. They also share `claim_by_superseded` (D15).

Nothing else goes to the founder:
- D16 (`lineShares`' grouping) changes reconcile code that the report reads, not ledger semantics: no ledger table,
  ledger package, matching rule, stage or recovered total changes, and the LED tests guard it. So it needs no exception.
- No legal text, no founder ruling reversed, no engine or content freeze exception.
- No cost: no new service and no parameter.

---

## 11. Files

#42's files are marked **(#42)**. This PR follows #42 and SS-01, so it edits their final text, and re-reads each file at
the merged head before changing it.

**Database**
- `packages/db/migrations/20261109090000_line_status_heads.sql` (new)
- `packages/db/src/schema/triage.ts` (`lineStatusHead`) and `schema/remittances.ts` (`claim_by_superseded`);
  `packages/db/src/schema/index.ts` (the export) **(#42)**
- `packages/db/functions/line_status_rules.sql` (generated); under Q1, `ledger_entry_within_evidence.sql` and
  `ledger_entry_within_line.sql` (generated)
- `packages/db/domain-model/areas.json` **(#42)**; `docs/product/domain-model.md` (generated) **(#42)**
- `packages/db/src/line-status.db.test.ts` (new); `catalog.db.test.ts` **(#42)**; `migrate.db.test.ts` **(#42)**

**Worker**
- `apps/worker/src/triage/execute.ts` (`advanceStages`, `judgedCandidates`), `patterns.ts` (`planWaiting`)
- `apps/worker/src/report/content.ts` (`runLines`, the mapping)
- `apps/worker/src/reconcile/patient-share.ts` (`lineShares`)
- `apps/worker/src/triage/triage.large.db.test.ts` (new), `batched.db.test.ts` (new); under Q1,
  `apps/worker/src/reconcile/reconcile.large.db.test.ts` (new)

**Harness**
- `tools/release-capacity/run.ts`, `checks.ts`, `checks.test.ts`; under Q1, `scenario.ts` and `scenario.test.ts`
- `tools/screening-capacity/watched-paths.txt` (regenerated by `watched.ts --write`, since it watches the migrations,
  `triage/execute.ts`, `report/*` and `reconcile/*`) **(#42)**. So the screening-capacity gate runs on this PR.

**Documents**
- `docs/adr/0083-…md` (new): sections 2 and 3, the index rule, and under Q1 the exception
- `docs/adr/0038-…md`: the dated note (section 5.5)
- `docs/product/test-matrix.md` **(#42)**; `packages/synth/src/cases/matrix.ts` **(#42)**;
  `packages/synth/src/cases/registry.ts` **(#42)**
- `docs/runbooks/ci.md` (:44-45)
- under Q1, `docs/product/reconciliation-001.md` **(#42)**: the exception, dated and attributed, under "Ledger
  semantics", in the form of the other granted exceptions

No web file changes: the Cases page reaches the new reader through `@tp/worker/triage`.

---

## 12. Risks

| Risk | What keeps it small |
| --- | --- |
| The head row drifts from the latest event | One writer (the definer trigger), no grant to anyone, and guards against delete and truncate. CAS-40.5's property after every step, and CAS-40.6 for the backfill. Line events are append-only, so the only way to drift is the owner bypassing triggers, which no code does. |
| An event is refused after its head row was written | The exception undoes the statement's writes, the head row included. CAS-40.1 and .3 read the head row after the refusal. |
| The definer trigger writes outside the writer's practice | Row-level security is forced on the head table, for its owner too, and reads the session's `app.practice_ids`. `line_status`'s own policy and `line_status_belongs` still apply. The cross-tenant tests cover the table. |
| `RETURNING OLD` needs PostgreSQL 18 | Every environment runs 18 (RDS `VER_18`, the pinned `postgres:18` images, CI). RDS cannot downgrade, and on an older server the migration fails to compile rather than misbehave. |
| The batched readers change an answer | CAS-41.5 compares them with the whole reads on fixtures and a generated run, byte for byte, the audit events included. The query text is shared, not copied. |
| A cursor outlives its use | It is declared in the job's or the request's transaction and closed after the last batch; a rollback drops it. Names are fixed per reader, so a second declare in the same transaction fails loudly. |
| The table locks during the deploy (backfill, index build) | Seconds at today's size. Stage writes and 835 loads wait, then proceed; nothing fails. Before launch there are no customer rows. |
| About 17% more time per stage event (2.7 s per 180,000) | Measured (probes V0 and H2). Triage at 100,000 lines is dominated by its reads (section 8.3). |
| Contention on one line is today's contention | Same grain and order, so no new waits. A row-lock wait shows in `pg_stat_activity` as a `transactionid` wait instead of `advisory`; the runbook says so. |
| Under Q1, a future ledger writer forgets `lockLedger` | The trigger still serializes it, taking the practice key late: the worst case is a detected deadlock and a retry, never a wrong amount. ADR 0083 states the rule (a ledger writer takes `lockLedger` before any row), and CAS-41.6's bound catches a writer that adds per-row locks again. |
| A month larger than 100,000 lines | The slim rows still grow with the month. The weekly run's chain peaks are reported; ADR 0083 names 70% of the task as the point at which fully streaming the report becomes due. |
| The weekly run's new checks fail for another reason (a slow runner, a flaky retry) | The checks fail closed and name the job and attempt. A retry that hides a real fault is exactly what the first-attempt check exists to catch. |

---

## 13. The builders' slices, in order

1. **Migration and schema** (database builder): section 4 (with 4.5 under Q1), the Drizzle mirror, the generated
   function files, `areas.json`, the domain model and `watched-paths.txt`. Gate: `pnpm db:migrate` from empty, the dry
   run, and `pnpm test:db` (catalog, cross-tenant, migrate).
2. **CAS-40 and CAS-41.1 to .3** (database tests): written first against the base, to see each fail first, then run on
   slice 1.
3. **Triage and the report** (worker builder): D12, D13, D14 and D16, with CAS-41.5 written first, against the whole
   reads, to pin the answers before the code changes.
4. **CAS-41.4, and CAS-41.6 under Q1** (worker large tests), with the budgets of section 8.4.
5. **The harness** (CAS-42): `run.ts`, `checks.ts` and `checks.test.ts`, then the before-and-after real-size runs on the
   base's and the head's worker images, under the lock, and under Q1 the reconcile phase.
6. **Documents:** ADR 0083, ADR 0038's note, the test-matrix rows, the synth matrix and registry, `docs/runbooks/ci.md`,
   and under Q1 reconciliation-001's exception.
7. **The full local suite,** then the draft PR opened with the domain model's summary, and two adversarial reviews: a
   database and concurrency reviewer, and a payment-engine reviewer for the report's figures (and the ledger part under
   Q1). Then the fix round and the fresh-clone verification. No screen changes, so no UX and brand review is due
   (LANES.md rule 1).

---

## 14. Handed on, and kept out (each with why)

- **Stored per-content windows (#8).** D11: a different table and a different path.
- **The Cases page recomputes its waiting patterns on every load.** `waitingPatterns` (`apps/web/src/lib/routes/triage.ts:253`)
  reads and judges every validated line waiting outside a case, with its trace, each time the page opens. D13 bounds its
  memory, not its time. The same reader took 19 to 23 s for 66,666 candidates in the probes' re-triage, so a large
  practice's page would take seconds. Storing the waiting patterns when triage computes them is a product change (what
  the page shows between triages), so it is handed on as its own item, with this measurement.
- **Reading the current stage from the head row** elsewhere: the 16 TypeScript sites and the SQL functions that take the
  latest event by `seq DESC`, and `candidateRows`' DISTINCT ON over a practice's whole log (`execute.ts:217-219`, which
  grows with the practice's history). It would make those reads O(1) per line, but it changes many readers for a speed
  this item does not need. This design keeps the head row exact and internal, so a later performance item can rely on it.
- **Fully streaming the report** (section 2.2): due when the weekly chain peak passes 70% of the task.
- **`lock_timeout` for people's requests.** Not needed: option H adds no wait. The general question (a request that waits
  on a row a long job holds, toward the load balancer's 180 s) exists today and is unchanged.
- **The report's long transaction** (it holds `triage:` while it prints): unchanged, and ADR 0038's promise needs it.
- **The audit-event volume of triage's reads** (one row per line read, `readWithAudit`,
  `packages/db/src/authz/audit.ts:59-88`): required by the audit rule, and measured inside the budget.

---

## 15. Probes run for this design

All on SYNTHETIC rows, as the worker's login unless said, on databases migrated from empty at e908c21 (44 migrations),
PostgreSQL 18.4. Databases `tp_design_suitecap1_1` to `_13` were used on port 5433, plus a private cluster on port 5493
(`max_locks_per_transaction` 1,024, the same `shared_buffers`) for the comparisons today's trigger cannot run at 64.
Heavy runs held `/tmp/laneb-heavy.lock`. All were dropped, and the private cluster removed, at the end.

| Probe | Result |
| --- | --- |
| A1 | 12,000 flagged events in one `INSERT … SELECT`: 0.90 s, 12,000 advisory locks held. 20,000: 53200 at `line_status_rules() line 8 at PERFORM` |
| A2 | P1 holds 13,000; P2's 2,000-line insert: 53200 in 68 ms |
| V0 (today) | 180,000 events in one transaction (20,000 flagged, 100,000 validated, 60,000 actionable): 1.69 + 8.57 + 5.60 = 15.9 s; 120,000 advisory locks |
| V1 (practice lock) | 1.73 + 7.89 + 5.25 = 14.9 s; 1 advisory lock |
| H1 (head row, with foreign keys) | 2.38 + 11.65 + 8.41 = 22.4 s; 0 |
| **H2 (head row, the design)** | **1.82 + 9.73 + 7.03 = 18.6 s; 0 advisory locks; 40 lock-table entries; every line's head equals its latest event** |
| H3 (H2 with fillfactor 50) | 1.93 + 10.99 + 6.76 = 19.7 s; not better |
| FLOOR | `line_status_rules` disabled: 1.32 + 6.68 + 3.90 = 11.9 s |
| R1 | Two concurrent validated events for one line: the second refused under V0, V1 and H2 |
| R2 | V0: flagged@…524, actionable@…525 (committed last), validated@…526, then a second actionable accepted. V1: the same order fault. H2: flagged@…541, validated@…544, actionable@…545; the second actionable refused |
| R3 | T1 a stage on line L3, then a shared row; T2 the shared row, then a stage on line L4: V0 and H2 both commit; V1 40P01 "deadlock detected" |
| E1 | V0 after `VACUUM` of the emptied table (reltuples 0): the validated insert still running after 9.5 minutes, stopped |
| E2 | H2 on a fresh database after `VACUUM ANALYZE` of both empty tables: 2.0 + 10.5 + 8.4 = 20.9 s, linear |
| L1 | One transaction re-takes the practice's `ledger:` key 50,000 times: 1 lock-table entry (D8's premise) |
| Backfill | The DISTINCT ON read of 180,000 events with every practice in scope: 0.41 s |
| B to G2 | 100,000 lines through the job code: section 8.3 |
| Actionable | On probe E's database: `case_rules`' aggregate over 33,334 case lines, 0.54 s; a plain `INSERT … SELECT` of 3,000 and 6,000 actionable events, 0.50 and 0.78 s; `advanceStages`' statement with committed statistics and literal arrays, a hash join. So the 197 s is the in-transaction plan of `advanceStages` (1.4, defect 1) |
| Claim lines | `claimLines`' query for the case's 12,500 claims with `claim_by_superseded`: 0.97 s, the index used for the recursive step and the correlated lookup |
| Trace size | 4,735 bytes of JSON per priced line on average (3,064 stored) |

The scouts' probes agree where they overlap (`progress/design-suitecap1-database.md`): 53200 between 14,000 and 16,000
on one `INSERT`; V2, the `service_line` row lock, 11.6 s with 0 advisory locks; and the ANALYZE-on-empty plan, 7 min 51 s.
