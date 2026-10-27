# SUITE-CAP-1: a 100,000-line month triages and reports within the worker (an app pull request, then Lane A's schema PR)

Design contract, 2026-10-27, revised the same day after its design review (section 16). Against `claude/build-platform`
at e908c21 and PR 6b-4 (#42, `co-001/pr-06b-mail-streams`, re-read at its head 6f23c42b, migration
`20261107090000_mail_streams.sql`). Claim: LANES.md row 188.

The work ships as two pull requests, in this order (section 2.4, D21):
- **SUITE-CAP-1a, bounded reads** (`co-001/suite-cap-1-bounded-reads`): triage and the audit report read a month in
  batches, the report streams, and the two quadratic steps go. No migration and no domain-model change, so it is not
  in Lane A's serial chain (LANES.md rule 2) and can open now, in either lane. It merges on green CI after its
  fresh-clone verification (LANES.md rule 7).
- **SUITE-CAP-1b, the stage lock** (`co-001/suite-cap-1-triage-locks`): the migration, the worker's heap measure, the
  release-capacity checks and their new phase. It follows SS-01 in Lane A's serial chain
  (`20261108090000_suspension_refusal.sql`, `designs/ss-01-suspension.md`), and opens only after #42, SS-01 and
  SUITE-CAP-1a merge (one schema PR at a time).

Reserved: ADR 0083 (SUITE-CAP-1a writes it, with a "The split" section as ADR 0071 has; SUITE-CAP-1b completes it);
test-matrix CAS-40 to CAS-42 (CAS-41 in 1a, CAS-40 and CAS-42 in 1b); `packages/synth` cases CAS-40 to CAS-42 (module 5,
no fixture files); no fixture release. The orchestrator adds 1a's branch to the claim row.

Sources:
- LANES.md "Handed to Lane A" (2026-10-26, from #49);
- `approval-summaries/lane-b-release-content-checks-status.md` and `lane-b-release-content-checks-capacity-summary.md`;
- the release-capacity workflow and harness #49 added (`.github/workflows/release-capacity.yml`, `tools/release-capacity/*`);
- the two scouts' reports (`progress/design-suitecap1-database.md`, `progress/design-suitecap1-application.md`);
- the design review (`progress/design-suitecap1-review.md`) and this revision's notes (`progress/design-suitecap1-revise.md`).

Every claim below was re-read at e908c21, or at #42's head where #42 touches the file. The claims the design rests on
were probed on databases migrated from empty, up to 100,000 lines through the job code under the worker's heap limit,
and, in this revision, with the PDF printed by Chromium and with two practices' large jobs in one process (section 15).

SUITE-CAP-1b is a schema change, so it needs the founder's SHA-256 approval of the regenerated domain model. One
optional part of it changes two trigger functions on `ledger_entry`, which reconciliation-001's ledger freeze covers, so
that part needs a freeze exception (Q1). SUITE-CAP-1a needs no founder action. The design reverses no founder ruling.
It touches no money computation, no pricing engine and no `content/releases`, and it changes no sentence a person
reads: the report's content, its CSV's bytes and its PDF's HTML stay identical.

---

## 0. In fourteen lines

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
6. **Behind the lock, five more real-size defects** surfaced once triage could finish (probes C to F, T):
   - triage's own stage-advance statement is quadratic in a month's lines: 197 s for 33,334 actionable lines;
   - triage holds every candidate's trace at once: a 531 MiB heap against the worker's 560 MiB;
   - the report holds every line at once, traces included, and runs out of heap;
   - the report's patient-balance step takes 616 s, from a missing index and a quadratic loop;
   - the worker runs every job type at once in one process with one heap, so a large report beside another practice's
     large triage shares 560 MiB, and the report prints with Chromium in the same 1,024 MiB task (the design review).
     The two completed together in probe T, but with the sampled heap at 86% of the limit and nothing measuring it.
7. **Their fixes:** a per-line indexed lookup; triage reads its candidates in batches of 2,000 and keeps only the judged
   lines; the report streams, folding its figures batch by batch and keeping each line's CSV row in a byte arena
   outside the heap, about 110 bytes of heap per line; the index `claim_by_superseded`; grouping adjustments once. No
   result changes.
8. **With all of it, under the worker's heap flag and with Chromium:** A's 100,000-line triage took 52.4 s with 107 MiB of
   live heap after judging, and A's audit report 84.5 s, printed by Chromium (probe T, on the first design's batched
   reads). X's report and Y's triage, two practices' 100,000-line jobs, completed together in one process in 83.7 s.
   The stream cuts what the report keeps from about 930 bytes of heap per line to about 110 (probe M). Before, triage
   failed and the report could not run.
9. **Two pull requests.** The bounded reads need no migration, so they ship first (SUITE-CAP-1a). The schema PR then
   never runs beside, or rolls back to, the whole reads that run out of heap once the lock no longer stops them.
10. **The reconcile side, under a freeze exception (Q1).** Two ledger triggers take one lock per posting or EFT row and
    per line, so a real-size reconcile fails the same way. Every ledger writer already holds the practice's `ledger:`
    lock first, so both triggers take that key instead.
11. **No database parameter change.** Raising `max_locks_per_transaction` only moves the ceiling (section 2.1, option A).
12. **The heap is measured, not inferred.** The worker logs, for each job, the largest heap it saw just after a full
    collection. The weekly real-size run fails above 75% of the heap limit, and gains a phase that runs the large jobs
    of four practices at once.
13. **Proof.** CAS-40 (the races and the lock-table bound, deterministic), CAS-41 (the same answers from bounded
    reads), CAS-42 (a 100,000-line triage and report alone under 75% of the heap, and beside another practice's
    100,000-line triage under the full heap, in CI; and the weekly run).
14. **Stored windows stay with #8.** The 10-to-13-second windows query reads `rule_record`, never `line_status`, and no
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
| Audit report job | `apps/worker/src/report/generate.ts:54-98`, one transaction | `audit_report … FOR UPDATE` (:57), then `triage:<practice>` | `triageInScope` inline (:73), then reads (:82), prints (:85), builds the CSV (:86) and stores both (:89-90) |
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
The run's memory peak was 803.9 MiB of 1,024, against 556.7 MiB sampled over the concurrent phase.

**The same pattern on the reconcile side.** Two `BEFORE INSERT` triggers on `ledger_entry` take a lock per row:
- `ledger_entry_within_evidence()` takes `ledger_evidence:<posting or EFT row>`
  (`20261027090000_packet_and_ledger_review.sql:147-201`, lock :172; earlier `20261026090000_recovery_ledger_review.sql:188`);
- `ledger_entry_within_line()` takes `ledger_line:<line>` (`20261027090000:219-270`, lock :246).

A reconcile pass is one transaction (`pass.ts:37-51`), so a pass that posts N case lines holds about 2N locks (one per
posting row and one per line), on top of today's N line-stage locks. A practice's posting export for a 60,000-line
dispute set would fail 53200. The release-capacity run has no reconcile phase, so nothing measures this today.

**How the worker runs jobs.** One worker task per environment (`infra/lib/environments.ts:111`: 0.5 vCPU, 1,024 MiB,
`desiredCount: 1`), one Node process, one V8 heap of 560 MiB (`infra/lib/heap.ts:9`; today's automatic size, made
explicit by ADR 0071). `startWorker` works every practice queue in that process at once
(`apps/worker/src/worker.ts:224-229`), one job per queue at a time (`workOptions`,
`apps/worker/src/jobs/registry.ts:160-162`) and `parse_835` four at a time. The twelve practice queues are `intake`, `parse_835`, `monitor`, `price`, `triage`, `audit_report`,
`reconcile`, `digest`, `export`, `packet_export`, `roi_statement` and `report_document`. So a price job, a triage, an
audit report and a reconcile, each possibly of a different practice, run at once in one heap. The report prints its PDF
with Chromium, launched per report in the same task (`apps/worker/src/report/pdf.ts:23`), while it still holds its
lines (`generate.ts:82-90`). A heap out-of-memory is not a job failure: V8 aborts the process, so every in-flight job of
every practice dies with it, stays active in pg-boss until its 15-minute expiry, and is then retried.

### 1.2 What the per-line lock protects

The invariants (PRD 8, the status machine; CLAUDE.md "Five line stages … Monotonic; reopen is explicit"):
1. a line's stages move forward only; setting a stage again or an earlier one is a reopen;
2. a reopen names the stage the line is at;
3. a reopen keeps the line at its stage or moves it back;
4. a reopen in no one's name comes only from payer approved or recovered (the ledger's).

Beside them, `line_status_ledger_rules` (`20261023120000:587-606`) admits payer approved and recovered only when the
line's ledger entries put it there, and the ledger's own reopen only back to the stage its entries leave it at. It reads
the ledger, not the line's stage, and is unchanged here.

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
- **E1, an empty table's statistics.** After `VACUUM` of an emptied `line_status` (reltuples 0), the trigger's lookup is
  planned as a sequential scan. A 100,000-line insert in one transaction had not finished after 9.5 minutes (the scout
  saw 7 min 51 s). The revision counted it directly (probe S): 4,000 events in one transaction raise
  `pg_stat_xact_user_tables.seq_scan` on `line_status` by 4,000, one scan per event. This happens only while the
  table's statistics say it is empty: a new environment, or a test database.

### 1.4 What stood behind the lock at 100,000 lines

With the lock fixed (option H, section 2.1), the same 100,000-line month ran on (probes C to G2 and T, section 15). The
worker task is 0.5 vCPU and 1,024 MiB, with Node's heap at 560 MiB.

| # | Defect | Where | Evidence |
| --- | --- | --- | --- |
| 1 | Triage's actionable write is quadratic | `advanceStages` (`execute.ts:330-344`) finds each wanted line's current stage with a `DISTINCT ON` over the practice's events, joined to the wanted set by `IN`. In the triage transaction, the practice's new validated events are its own uncommitted rows, so the planner's statistics do not count them and it chooses a nested loop | Probe F, in the harness's shape (B's 20,000 lines triaged and analysed first): 6,667 actionable lines in 7.1 s, then 33,334 in 196.8 s (25 times as long for 5 times the lines). The case's derivation is not the cause: `case_rules`' aggregate over the same 33,334 lines takes 0.54 s, and a plain `INSERT … SELECT` of 6,000 actionable events 0.78 s |
| 2 | Triage holds every candidate's trace at once | `candidateRows` (`execute.ts:210-252`) reads `p.trace` for every candidate, and `candidateLines` (:282-323) judges them all before any is released. A trace is 4,735 bytes of JSON on average | Probe E, under `--max-old-space-size=560`: heap at 477 MiB after judging and a peak of 531 MiB, 95% of the worker's heap |
| 3 | The report holds every line at once | `runLines` (`apps/worker/src/report/content.ts:366-410`) reads `p.trace` for every line with a shortfall; `gatherReport` maps every line to a `ReportLine`, filters the array once per figure and per case, sorts it (:620-627), and returns it to `generate.ts`, which prints the PDF (:85) and only then builds the whole CSV as one string (:86) | Probe E: "JavaScript heap out of memory" in `gatherReport`. Without a heap limit (probe C) the report's heap peaked at 1,125 MiB. With the traces dropped per batch but the lines still held (probe G2), it completed with a 483 MiB peak, 86% of the heap. A `ReportLine` alone is about 965 bytes of heap (probe M) |
| 4 | The report's patient-balance step | `claimLines` (`apps/worker/src/reconcile/remittances.ts:249-262`) looks claims up by `superseded_by_claim_id`, which has no index (`20261016120000_remittances.sql:123`, indexes :134-136). `lineShares` (`apps/worker/src/reconcile/patient-share.ts:107-130`) filters every adjustment for each claim (:116) and for each line (:122) | Probe D: 616.0 s in this step and 693.1 s for the report. With the index (probe C) the step took 49.7 s, and `claimLines` itself 0.97 s (its plan uses the index); the rest is the filtering. With the grouping too, 3.4 s (probe G2) |
| 5 | Large jobs of different practices share one heap and one task | Section 1.1, "How the worker runs jobs" | Probe T, with the first design's batched reads, the lock fix and the index, under the 560 flag and with Chromium: X's 100,000-line report and Y's 100,000-line triage ran together in one process and both completed (83.7 s). The sampled heap peaked at 483 MiB, 86% of the limit, though the live heaps were far lower (154 MiB for the report alone after gathering, 107 MiB for triage alone after judging). Chromium added 153 to 165 MiB across six processes while the report printed, in the same task as the worker's heap and the report's held lines. So the overlap did not crash at 100,000 lines, but nothing measured it, and the report's lines and Chromium coincide |

The Cases page reads the same candidates on every load: `waitingPatterns` (`apps/web/src/lib/routes/triage.ts:253` →
`patterns.ts:63-66`) reads every validated line waiting outside a case, with its trace, in the web task (1,024 MiB, heap
560 MiB). So defect 2 is also a web memory risk.

**The earlier probes' PDF.** Probes B to G2 printed the report with the test stand-in (`triage-world.ts:80` returns
`%PDF-1.7 SYNTHETIC STAND-IN` when `chromiumInstalled()` is false), because Playwright's default browser directory is
empty in this container. Chromium's headless shell is installed at `/opt/pw-browsers` (revision 1194, the one
playwright-core 1.56.1 launches), so the revision's probes (T, section 15) set `PLAYWRIGHT_BROWSERS_PATH` to it and
print with Chromium, as the worker image does.

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
6. It does nothing for the ledger's per-row locks, or for the five defects behind the lock (1.4).

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
  prints the PDF and stores it (`generate.ts:85-90`). No `lock_timeout` or `statement_timeout` is set anywhere
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
  s for 180,000 events with reltuples 0; probe S: 40,000 events, `seq_scan` unchanged on both tables).
- **No writer changes for locking,** so ADR 0038's one transaction per triage and per report stands, and every future
  writer is covered without remembering anything.
- **Cost.** 18.6 s against today's 15.9 s for 180,000 events (17%, about 2.7 s), plus one small row per line ever
  staged. The head row is a second copy of "the current stage", kept exact by the only code that writes it and proved by
  CAS-40's property.

### 2.2 The defects behind the lock

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

**2. Triage's traces held whole.**
- Recommended: **read in batches through a cursor, and keep only what is judged.** Triage declares a cursor over the
  query it runs today, unchanged, inside the job's transaction, and fetches 2,000 rows at a time. Each batch is audited
  as today (`readWithAudit`, one event per row read) and judged while its traces are in hand; triage keeps the
  `CandidateLine`s and drops the traces. The order (`ORDER BY service_line_id`) and every computation are unchanged.
- The judged candidates are then triage's one holder that grows with the month's lines: `planCases` must see every
  candidate of a pattern to group it, and the stage writes need their IDs. Probe T measured them: 107 MiB of live
  heap after judging 66,666 candidates, against 84 MiB after judging 33,332 on a re-triage, so about 720 bytes per
  candidate above a base of about 61 MiB, 46 MiB at the target. Grouping in SQL instead would move `@tp/triage`'s
  judgement, which reads the trace in TypeScript, into the database, for memory the target does not need. (Triage's
  anomaly screen holds the quarter's unpriced lines, slim rows without traces, as today.)

**3. The report held whole: it streams.**
- Recommended: **the report folds its figures batch by batch and streams its CSV.** It reads `runLines`' query through
  a cursor in batches of 2,000. For each batch it reads the batch's deadlines, maps each row to its `ReportLine` with
  today's mapping, adds the line to the report's running figures, and appends its CSV row to a byte arena; then the
  batch, its traces and its `ReportLine`s are released. The figures are sums, counts and per-case and per-pattern
  totals, so folding them in any order gives the same integers. After the last batch it builds the cases, the
  headline and the evidence gaps from the folded figures with today's code, streams the CSV from the arena in the
  report's order to storage, releases the arena, and only then prints the PDF.
- **The CSV's order.** The report sorts its lines by payer, plan, the payer's claim control number, line number and
  line (`content.ts:620-627`). The claim number is sealed in the database with the practice's key, so no query can
  order by it, and a stream in that order needs every line's sort key before it writes the first row. The arena keeps
  that and nothing more: each row's encoded bytes outside the V8 heap (the CSV's own size, 24 MiB at 100,000 lines),
  and per line its payer and plan as small integers, its line number, and its claim number and line ID as strings.
  Probe M measured 108 bytes of heap per line (10.3 MiB at 100,000) and a 0.21 s sort, against 965 bytes for a
  `ReportLine` and 437 bytes for a row kept as a string.
- **The PDF after the CSV.** Chromium (145 to 180 MiB across its six processes in the probes) then never runs while the
  arena is held, and the PDF's HTML is built from the folded content exactly as today.
- Probe T measured the first design's batched report, which dropped each batch's traces but kept every line: 154 MiB
  of live heap after gathering 100,000 lines (about 930 bytes per line above the base), and a sampled peak of 419 MiB
  alone and 483 MiB beside Y's triage. The stream keeps the arena's 108 bytes per line instead (probe M): about 10 MiB
  of heap at 100,000 lines, plus the CSV's 24 MiB outside it.
- Rejected: an external sort that spills sealed runs to the task's disk. It bounds memory completely, but writes PHI to
  a local disk, needs cleanup after a crash and a disk budget, and the arena's 10 MiB of heap at the target leaves it
  little to win.
- Rejected: ordering the CSV by what a query can sort (payer, plan, then service date and claim). It would remove the
  arena, but it changes what a person reads in the CSV, which is a product change this capacity fix does not need.
- Rejected: a larger worker task, or a larger heap. That is a cost every month, and the whole read still grows with
  every line.

**4. The report's patient-balance step.**
- Recommended: **the index and the grouping.**
  - `claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL`, the twin of
    `claim_by_reversed` (`20261016120000:136`). `claim` is not under the ledger freeze. The "Interest credited twice"
    design (`designs/ledger-interest-once.md` D12, LED-25) specifies the same index with the same name, so whichever PR
    merges first carries it and the other drops it.
  - `lineShares` groups the adjustments once, by claim and by line, in their order, instead of filtering all of them
    for each claim and each line.
  - `patientBalanceCases` folds `casePatientBalance` (an "any" and an "every" over a case's open lines,
    `patient-share.ts:176-182`) over batches of 2,000 case lines, and the practice's ledger entries are read once per
    report and handed to both readers (today `gatherReport` and `lineCorrections` each read them).
- Rejected: rewriting `claimLines` without the recursive lookup. It is the ledger's correction chain (docs/adr/0067),
  and the index makes it 0.97 s.

**5. Large jobs of different practices in one heap.** With the report streaming and triage keeping only its judged
lines, each large job's heap grows by well under 1 KB per line, and the report no longer holds its lines while
Chromium prints; section 2.3 says how that is measured and held.

### 2.3 The worker's heap across jobs

Today a large month's triage and report stop at the lock after about 48 s, as ordinary job failures. Once the lock is
fixed they run on, and the worker runs them beside whatever else is queued, in one heap. The design must therefore show
that the large jobs fit the heap together, not each alone. Probe T is the first such measurement: with the first
design's reads, a 100,000-line report and another practice's 100,000-line triage completed together under the 560 flag,
with live heaps of about 154 and 107 MiB measured alone, but a sampled heap at 483 MiB. That is room today, not a bound:
the report's share grew with every line, the weekly run never ran the two together, and nothing in the worker or in
production read the heap. Options:

| Option | Verdict |
| --- | --- |
| **Keep each large job's heap per line of the month small and measured (2.2), and measure the worker's live heap in every real-size run and in production** | **Recommended** |
| A process-wide gate that runs one of price, triage, audit report and reconcile at a time | Rejected |
| A larger worker task or heap | Rejected: a cost every month, and the sum still grows with lines |
| A second worker service for the large jobs | Rejected: a second task's cost, and its large jobs still share its heap |
| A per-job heap reservation sized from each run's line count | Rejected: estimates to keep true, for no gain once each job is small |

**Why not the gate.** pg-boss counts a job's 15 minutes from when the worker fetched it. A job fetched and then held in
an in-process gate runs its expiry down while it waits, so a few large practices' jobs queued behind one another
expire and retry, and use their attempts. A gate that waits before fetching means replacing pg-boss's `work` loop for
four queues. And a small practice's 200-line triage would wait behind a large practice's report for minutes. Since
the CPU is half a vCPU, the large jobs gain little from running side by side, but nothing gains from serializing them
either once each is small.

**The measure (F2 of the review).** The binding limit is V8's heap, not the task's memory, and a sampled `heapUsed`
includes garbage V8 has not collected yet. So the worker records the heap in use just after each full collection (a
`PerformanceObserver` on major collections, reading `v8.getHeapStatistics().used_heap_size`), and logs per job the
largest it saw while the job ran, with the heap limit (D19). That is the live heap of the whole process while the job
ran, which is what decides a crash. The weekly run fails when any job's figure passes 75% of the limit (420 MiB of 560),
and CAS-42 runs each large job alone under a heap flag of 75% of `HEAP_MIB.worker`. The 25% left covers V8's working
room and a month somewhat larger than the target, and the check fails before that margin is used.

### 2.4 Two pull requests

The bounded reads (D12, D13, D14, D16 to D18) need nothing from the migration and are correct on today's trigger. Shipped
in the schema PR, they leave a gap: once the new trigger no longer stops a large report at the lock, the previous
image's whole-read report runs on into a heap out-of-memory (probe E is exactly that: the old reads, the lock fix and
the index, under the 560 flag). That happens on a rollback to the previous image (ADR 0009) and in each deploy's window
between the migration task and the new image, and it takes the shared worker down rather than failing one job.

So the bounded reads ship first, as SUITE-CAP-1a, and the schema PR (SUITE-CAP-1b) follows. Then the image before
SUITE-CAP-1b already reads in batches, the schema PR is smaller, and the bounded reads do not wait for the serial chain.
From launch on, SUITE-CAP-1a must reach production in an earlier release than SUITE-CAP-1b (D21).

SUITE-CAP-1a cannot prove 100,000 lines on its own, since today's trigger still stops a large triage at the lock: it
proves the same answers and the per-line memory at sizes today's trigger allows (CAS-41), and SUITE-CAP-1b proves the
real size (CAS-42).

---

## 3. Decisions

D1 to D16 keep their numbers from the first version, since other designs cite them (`ledger-interest-once.md` cites D15).

| # | Decision | Why |
| --- | --- | --- |
| D1 | A new practice-scoped table `line_status_head`: one row per line that has any stage event, with the line's current stage and the `seq` of its latest event. Primary key `(practice_id, service_line_id)`. (1b) | Option H. The key leads with `practice_id` for the catalog rule (`packages/db/src/catalog.ts:369-370`) and the tenant policy, and it is the upsert's arbiter. |
| D2 | `line_status_rules()` takes the line's lock by writing its head row with one `INSERT … ON CONFLICT (practice_id, service_line_id) DO UPDATE … RETURNING WITH (OLD AS prior, NEW AS next) prior.stage, next.seq`. The `pg_advisory_xact_lock` call is removed. (1b) | The upsert waits for any other writer of the line, then locks the row. `prior.stage` is the stage before this event (null for a line's first event), and the checks run against it, unchanged. A refusal raises and undoes the head write with the statement. PostgreSQL 18's `RETURNING OLD` is available everywhere this runs: RDS `VER_18` (`database.ts:127`), the compose and harness images (`postgres:18`), and CI. |
| D3 | `NEW.seq` is set from the head row: the identity value the row already drew for a line's first event, and otherwise a new `nextval` drawn after the lock. (1b) | A line's first event cannot race an earlier one: any committed or in-flight event of the line holds or waits on the head row, so the insert would conflict instead. Every later event draws its number while it holds the lock, so `seq` follows commit order. |
| D4 | `line_status_rules()` becomes `SECURITY DEFINER`, owned by `tp_owner`, with `SET search_path = pg_catalog, public, pg_temp` and `REVOKE ALL … FROM PUBLIC`. `line_status_head` has no grant to any login role. (1b) | The trigger is then the only writer of the head rows, and `nextval` on `line_status_seq_seq` needs no sequence grant (none exist anywhere today). Row-level security still applies to the owner (`FORCE`) and reads the session's `app.practice_ids`, so a head row can only be written in the writer's own practice. Precedent: `line_status_refresh_cases` (`20261023090000:837-845`). |
| D5 | No foreign keys on `line_status_head`. (1b) | The `line_status` row the trigger is checking carries the same references (`practice`, `service_line`), checked in the same statement, and `line_status_belongs` checks the line's practice. The two extra checks cost 3.9 s per 180,000 events (probe H1, 22.4 s, against H2, 18.6 s). What the head row must satisfy is "equals the line's latest event", which a foreign key cannot express; CAS-40.5's property and CAS-40.7's backfill check it. |
| D6 | `line_status_head` has `line_status`'s guards: `never_deleted` and `no_truncate` triggers (the shared `triage_never_deleted()` and `triage_no_truncate()`), forced row-level security with the tenant policy, and a registry row (so the cross-tenant tests cover it). (1b) | It is part of the stage log's state, and its rows go only with the log's. |
| D7 | No writer's code changes for locking. Triage, the report, opening a case, reconcile, manual ledger work and the reopen keep their transactions, their outer locks (`triage:`, `ledger:`) and their statements' meaning. | The per-line protection moves inside the database, unchanged in grain. ADR 0038:63-66 ("an advisory lock per practice") stays true. |
| D8 | Under Q1 (a ledger freeze exception): `ledger_entry_within_evidence()` and `ledger_entry_within_line()` take `pg_advisory_xact_lock(hashtextextended('ledger:' \|\| NEW.practice_id::text, 0))`, the same key `lockLedger` takes (`reconcile/ledger.ts:16-18`), instead of one key per evidence row and per line. Nothing else in either body changes. (1b) | Every `ledger_entry` insert runs after `lockLedger`: the reconcile pass (`pass.ts:39`) and each manual action's first statement (`manual.ts:46-50`, called at :71, :101, :136, :178 and :229). There is no SQL writer of `ledger_entry`. Re-taking a lock the transaction holds adds no lock-table entry (probe L1) and cannot deadlock. Both triggers check `practice_in_scope` before they lock, so the practice key adds no cross-tenant wait. The trigger still serializes any writer that forgets `lockLedger`, at a coarser grain. |
| D9 | `max_locks_per_transaction` stays at its default (64), in RDS, CI and the harness. | Option A. The tests prove a per-transaction bound that does not depend on it. |
| D10 | The release-capacity run gains these checks: a measured job completes on its first attempt; no backend holds more than 64 advisory locks at any sample over the run (`TRACE_LOCK_BUCKETS`, the loader's bound); no job's live heap passes 75% of the heap limit (D19's log lines); and the chain's memory is sampled, with A's triage and A's report reported separately. It gains the phase "the large jobs together" (D20), and under Q1 a reconcile phase. (1b) | Today a 53200 that a retry survived would pass, the lock count and the heap are not measured, the large jobs never run together, and the status file attributed the run's 803.9 MiB peak to pricing, although the concurrent phase, where pricing ran, peaked at 556.7 MiB sampled. |
| D11 | The stored per-content windows stay with #8. | `releaseContentWindows` (`apps/worker/src/price/release.ts:274-291`) aggregates `rule_record`. Its callers are the web's Content through (`apps/web/src/lib/releases/content-through.ts:87`, :90), the price job (`price/execute.ts:389`) and the harness. Triage reads `rule_release_content_span()` (`release.ts:148`, via `execute.ts:261`). It shares nothing with this item's locks, tables or memory. |
| D12 | `advanceStages` reads each wanted line's latest event with a `LEFT JOIN LATERAL` lookup on `(practice_id, service_line_id)` ordered by `seq DESC LIMIT 1`. (1a) | Section 2.2, defect 1. The same rows are filtered out, so the same events are written. |
| D13 | One candidate reader, `judgedCandidates(scope, practiceId, pricingRunId, requestId)`, reads `candidateRows`' query through a cursor in batches of 2,000, audits each batch, judges it with `candidateLines`, and returns only the `CandidateLine`s, in the same order. Triage (`execute.ts:447`) and `planWaiting` (`patterns.ts:63-66`, so opening a case and the Cases page) use it. `candidateRows` and `candidateLines` stay, for the reader and for tests. (1a) | Defect 2, and its web twin. |
| D14 | The report streams (2.2, defect 3): `runLines`' query through a cursor in batches of 2,000; per batch the deadlines, today's mapping to `ReportLine`, the running figures and the CSV arena; then the batch is released. After the last batch: the cases, headline and gaps from the folded figures, the CSV streamed, then the PDF. (1a) | Defect 3. Every figure is a sum, a count or a per-key total, so folding gives the same integers; CAS-41.1 compares the content, the CSV's bytes and the PDF's HTML with today's whole read. |
| D15 | The migration adds `claim_by_superseded` (section 4.4). (1b) | Defect 4. Shared with the "Interest credited twice" design; the first to merge carries it. |
| D16 | `lineShares` (`patient-share.ts:107-130`) groups the adjustments once into two maps, claim-level by claim and line-level by line, keeping their query order, and reads them from the maps. (1a) | Defect 4. The same adjustments, in the same order, reach the same arithmetic. No ledger table, ledger package, matching rule or recovered total changes, so this is not a freeze item. LED-01 to LED-17 and the oracle are its guard. |
| D17 | The CSV keeps its order and its bytes. Each line's row (`csvRow(line).map(csvCell).join(',')` and CRLF) is appended to a byte arena of 1 MiB chunks outside the heap, with its sort key in typed arrays (payer and plan as indexes into an interned list, the line number) and two strings (the claim number and the line ID). After the last batch an index is sorted with today's comparator and the header and rows are streamed in that order through `documents.write`'s `AsyncIterable`. (1a) | 2.2, defect 3. `auditCsv` (`csv.ts:108-110`) stays as the reference the test compares against, and for the other callers. |
| D18 | The report's other per-line reads go by batch: `lineDeadlines` for each batch's lines (today one query for every line, `content.ts:529`); `patientBalanceCases` folded over batches of 2,000 case lines; the practice's ledger entries read once and passed to `lineCorrections`. (1a) | Each held a whole month's rows at once. The functions' answers are unchanged; CAS-41.1 compares. |
| D19 | The worker records its live heap: a process-wide `PerformanceObserver` on major collections keeps the heap in use just after the latest one, and each practice job, as it ends (completed or failed), logs `job heap` with `job_id`, `job_type`, `heap_live_peak_mib` (the largest seen while it ran) and `heap_limit_mib` (`v8.getHeapStatistics().heap_size_limit`). IDs and numbers only. The two fields join the numeric log fields (`packages/observability/src/fields.ts`, a #42 file). (1b) | F2 of the review: a measure of the quantity that crashes the worker, from every real-size run and from production. |
| D20 | The release-capacity run gains a phase, "the large jobs together": A's second audit report (its inline triage a re-triage), D's triage of its 100,000-line month (priced during setup), E's price job of its 100,000-line month, and C's four parses of a second set of 835s, queued within a second, with `memory.current` sampled each second until all finish. D and E are SYNTHETIC practices seeded as A is. (1b) | F1 of the review: the overlap that decides whether one practice can crash another's jobs, at real size, under `heapFlag('worker')`, with Chromium printing in the same task. |
| D21 | SUITE-CAP-1a ships before SUITE-CAP-1b. From launch on, 1a reaches production in an earlier release than 1b, and the runbook's rollback note for 1b's release says so. (both) | F3 of the review (2.4): the image before the new trigger must already read in batches. |
| D22 | The migration takes its table locks without queueing behind long transactions: a bounded loop tries `LOCK TABLE … NOWAIT` once a second, up to 300 tries, and fails the migration with a named message after that. (1b) | F4 of the review: a waiting lock request queues every later stage writer behind it, a person's reopen included, for as long as the longest in-flight triage or report holds its transaction (minutes; the report prints inside it). `NOWAIT` never queues anyone; the deploy fails cleanly and is run again if no gap comes in five minutes. |
| D23 | Production alarms on the worker's live heap: a metric filter on `job heap` takes `heap_live_peak_mib`, and an alarm fires when its maximum passes 75% of `HEAP_MIB.worker` in a period, routed as the worker's other alarms are (`infra/lib/constructs/monitoring.ts`, a #42 file). (1b) | The same line the weekly run checks, read in production, so a month that outgrows the margin is seen before it crashes the worker. |

---

## 4. Schema (SUITE-CAP-1b): one migration, `20261109090000_line_status_heads.sql`

It comes after #42's `20261107090000_mail_streams.sql` and SS-01's `20261108090000_suspension_refusal.sql`. The builders
take the next free timestamp at the time. Like every migration, it runs in one transaction as `tp_owner`
(`packages/db/src/migrate.ts:116-126`).

**#42 and SS-01 overlap: none.** #42's migration creates or replaces only mail, dunning, support and screening
functions and `operator_due_support_notices`; its changed function files are the mail, support, screening and generic
ones. SS-01's replaces the suspension functions and triggers. Neither touches `line_status`, `line_status_rules`,
`ledger_entry_within_*`, `triage_never_deleted`, `triage_no_truncate`, `claim`'s indexes, `case_line` or any triage
function. This was re-checked at #42's head 6f23c42b and in `designs/ss-01-suspension.md` section 4. So this migration
recreates no function from either body. The builders re-check at both PRs' final merged heads before writing.

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

**The table lock, without a queue (D22).** A plain `LOCK TABLE` waits for every in-flight transaction that has written
the table, and while it waits, every later writer queues behind it. A large triage or report holds its transaction for
minutes, the report while it prints its PDF (`generate.ts:85-90`), up to pg-boss's 15-minute expiry, and no
`lock_timeout` is set anywhere (`migrate.ts` sets none). So the migration takes its locks with `NOWAIT`, in a bounded
loop (each try is a subtransaction, so a refused try leaves the migration's transaction usable):

```sql
DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE line_status IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION 'line_status stayed in use for five minutes; run the deploy again (docs/adr/0083)' USING ERRCODE = 'lock_not_available';
END;
$$;
```

A try that fails queues nobody, so stage writers, people's reopens among them, go on as before while the migration
waits for a moment with no stage writer in flight (probe N: while a writer held its transaction open, another writer's
insert took 0.09 s, and the loop took the lock on its fifth try, once the first had ended). If none comes in five minutes, the migration fails, the deploy
stops before any service moves (`docs/runbooks/deploy-and-rollback.md`, the migration task runs first), and the deploy
is run again. Section 4.4 takes `claim`'s lock the same way.

**Backfill, in the same transaction, after the lock and before the trigger changes:**

```sql
SELECT set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true);
INSERT INTO line_status_head (practice_id, service_line_id, stage, seq)
SELECT DISTINCT ON (s.service_line_id) s.practice_id, s.service_line_id, s.stage, s.seq
  FROM line_status s ORDER BY s.service_line_id, s.seq DESC;
SELECT set_config('app.practice_ids', '{}', true);
```

Once held, the lock stops the running image's stage writes for the length of the backfill, so no event can land between
the backfill and the new trigger. No customer data exists before launch, and the read took 0.4 s for 180,000 events in
the probe, so this is a few seconds per million with the insert. The scope setting follows the house precedent for a
backfill under forced row-level security (`20261101090000_billing_review.sql:49-51`), with every practice, deleted ones
included; `tp_owner` reads every practice through `practice_resolver` and is `NOBYPASSRLS`, and the review's probe
confirmed one head row per line across two practices.

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
  the caller's savepoint (the review's probe: rolling back to a savepoint releases the head row's lock).
- The trigger keeps its name and timing (`BEFORE INSERT OR UPDATE … FOR EACH ROW`), so `line_status_ledger_rules` still
  fires first, and the AFTER triggers are untouched.
- The sequence is named by `regclass`. A test asserts `pg_get_serial_sequence('line_status', 'seq')` is
  `public.line_status_seq_seq`, so a renamed sequence fails a test, not production.
- Every stage writer runs at READ COMMITTED (`invoke.ts:465` refuses a one-snapshot mutation; `withJobScope` begins a
  plain transaction), so the upsert raises no serialization failure.

### 4.4 `claim_by_superseded` (unless the interest PR merged first)

```sql
-- claimLines' correction chain (apps/worker/src/reconcile/remittances.ts) looks claims up by the claim they
-- supersede; the twin of claim_by_reversed (docs/adr/0083).
CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL;
```

It is built inside the migration's transaction (no `CONCURRENTLY` in a transaction), after `LOCK TABLE claim IN SHARE
MODE NOWAIT` in the same bounded loop as 4.2: 835 loads in flight finish first, and later ones wait only for the
index build, seconds at launch size.

### 4.5 The ledger triggers (only under Q1; on `20261027090000:147-201` and :219-270)

`CREATE OR REPLACE FUNCTION ledger_entry_within_evidence()` and `ledger_entry_within_line()`, each a copy of its
20261027090000 body with one line changed:
- :172 `PERFORM pg_advisory_xact_lock(hashtextextended('ledger_evidence:' || row_id::text, 0));` becomes
  `PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));`;
- :246 `PERFORM pg_advisory_xact_lock(hashtextextended('ledger_line:' || NEW.service_line_id::text, 0));` becomes the
  same `ledger:` line.

Each gets a one-line comment naming ADR 0083 and the exception. Both stay invokers, keep `SET search_path`, and keep
`REVOKE ALL … FROM PUBLIC` as before. A db test diffs each new body against 20261027090000's, apart from the lock line
and the comment. The `ledger_line:` and `ledger_evidence:` keys appear nowhere else (the review's search), so no other
code pairs with them.

### 4.6 Grants, exactly

- `line_status_head`: `REVOKE ALL … FROM PUBLIC`; no grant to `tp_app`, `tp_operator`, `tp_billing`, `tp_esign`,
  `tp_screening` or `tp_job`. Owned by `tp_owner`.
- `line_status_rules()`: owned by `tp_owner`, `SECURITY DEFINER`, `REVOKE ALL … FROM PUBLIC`, no `EXECUTE` grant (a
  trigger function needs none to fire).
- `line_status` and `claim`: grants unchanged.
- No sequence grant.
- Under Q1, the two ledger functions: unchanged ownership and grants.

### 4.7 Safe with the previous image running, and on rollback

The previous image is SUITE-CAP-1a's (D21), so it already reads in batches.

| The previous image does | On the new schema |
| --- | --- |
| Inserts stage events (triage, report, open case, reconcile, manual ledger, reopen) | The same statements, the same refusals and messages; the head row is written inside the trigger. While the migration tries its lock (D22), writers are not queued; once it holds the lock, they wait for the backfill's seconds, then proceed. |
| Reads the current stage by `seq DESC` (16 sites) | Unchanged, and now right under concurrency. |
| Triages and reports a large month with 1a's bounded reads | Now completes instead of failing 53200, within the heap, as CAS-42 measures for the new image (the reads are the same code). It does not yet log D19's heap line. |
| Loads 835s (inserts `claim`) | Waits only for the index build, then proceeds. |
| Inserts ledger entries (under Q1) | The same; the trigger re-takes the `ledger:` lock the writer holds. |

Rollback is the previous image on this schema (ADR 0009:42-43), the table above: nothing in the previous image depends
on the new table or index. A rollback to an image before SUITE-CAP-1a, which D21 rules out from launch on, would run
whole reads on the new trigger, and a large report would then take the worker down with a heap out-of-memory instead
of failing 53200; ADR 0083 and the runbook's note for 1b's release say so. Migrations are forward-only. If the trigger
itself had to be undone, a later migration would restore 20261023120000's body; the head table could stay, unused,
since it is derivable. The dry run, forward, is the house check (ADR 0009:37-43).

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

### 5.2 SUITE-CAP-1a: triage (`apps/worker/src/triage/execute.ts`, `patterns.ts`)

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

   The review's probe ran it on a database whose empty tables had just been analysed (reltuples 0): it used
   `line_status_by_line` and wrote 20,000 actionable events after 40,000 validated ones in the same transaction in 2.7 s.

2. **`judgedCandidates`** (new, beside `candidateRows`), D13:
   - `DECLARE triage_candidates NO SCROLL CURSOR FOR <candidateRows' query>` with the same two parameters. Moving the
     query text into one constant both use keeps them identical.
   - Then `FETCH 2000` in a loop. Each batch goes through `readWithAudit` (purpose `triage`, one event per row, as today),
     then through `candidateLines(client, batch)`; the batch's `CandidateLine`s are appended. Then `CLOSE`.
   - `triageInScope` (:447) and `planWaiting` (`patterns.ts:63-66`) call it.
   - The cursor lives in the transaction both already run in. The web's Cases page runs `waitingPatterns` inside
     `withPracticeScope`, which is a transaction.
   - The batch size is a named constant, `CANDIDATE_BATCH_LINES = 2000`.

### 5.3 SUITE-CAP-1a: the report (`apps/worker/src/report/content.ts`, `csv.ts`, `generate.ts`)

1. **`gatherReport` becomes a fold** (D14). It reads, before the lines as today, the run, the practice, the release's
   references and spans, the anomalies and the run's cases (:500-526). Then `DECLARE report_lines NO SCROLL CURSOR FOR
   <runLines' query>` (the text moved into one constant) and `FETCH 2000` in a loop. For each batch:
   - `readWithAudit` (purpose `audit_report`, one event per row, as today);
   - `lineDeadlines(client, <the batch's priced line IDs>)` (D18);
   - each row mapped to its `ReportLine` by today's mapping (:535-619), unchanged, its trace parsed and dropped in it;
   - the line folded into a `ReportFigures` accumulator (below), and its CSV row appended to the arena (D17).
   Then `CLOSE`, and the rest of `gatherReport` (:620-877) runs on the accumulator instead of `lines`, `validated` and
   `rows`: the same expressions, each reading a running total where it filtered an array before.
2. **`ReportFigures`** (new, in `content.ts`), one field per filter the code runs over the lines today, each exact in
   integer cents:
   - validated: lines and the sum of `validated_cents` (:629, read at :757-767 and :864-870);
   - patterns: per key (:633-653), lines and the sum, keeping the key's fields from the first line, as today;
   - not actionable: per reason, lines and the sum (:654-672), with the content-gap key computed in the batch;
   - overpaid: lines and the sum of `overpaidCents` (:630-632);
   - per case: the lines still actionable and their variance (`actionableNow`, :685), and the set of this run's lines in
     the case (`inRun`, :679-684; one ID string per case line of the run);
   - no window and deadline unverified (:778-799): lines, the sum of charges, and the set of unverified causes
     (`deadlineRemedy` reads membership only, :151-156).
3. **The arena** (D17, `apps/worker/src/report/csv-arena.ts`, new): `append(line)`, `rows()` (an `AsyncIterable<Uint8Array>`
   of the header and the rows in the report's order) and `release()`. 1 MiB `Buffer` chunks, `Uint32Array`s grown by
   doubling, the comparator of `content.ts:620-627` over the stored keys.
4. **`generateAuditReport`** (`generate.ts:82-96`): gather; write the CSV from `arena.rows()`; release the arena; then
   `auditReconciliation` and the PDF print as today; then write the PDF; then the same `UPDATE`. The keys are drawn as
   today, so only the order of the two writes changes, inside the same transaction.
5. **`lineShares`** (`apps/worker/src/reconcile/patient-share.ts:107-130`), D16: one pass builds `claimLevelOf`
   (adjustments with no line, by claim) and `lineLevelOf` (by line), in query order; the two `filter` calls read from
   them.
6. **`patientBalanceCases`** (`content.ts:443-466`), D18: the case lines in batches of 2,000; per case two booleans
   folded ("some open line is a patient balance", "every open line is a patient balance or past actionable"), which is
   `casePatientBalance`'s rule (`patient-share.ts:176-182`); `lineCorrections` takes the ledger entries the report read
   once (`ledgerEntries`, `reconcile/ledger.ts:61-64`) instead of reading them again. The reconcile screens' own calls
   keep today's signature through a default.

### 5.4 SUITE-CAP-1b: the worker's heap line (D19)

- `apps/worker/src/heap.ts` (new): `startHeapWatch()` registers one `PerformanceObserver` for `gc` entries of the major
  kind and keeps `latestLiveBytes`; `jobHeap()` returns a handle whose `end()` gives the largest value seen since it
  began. The observer is process-wide, so concurrent jobs each see the whole heap, which is the quantity that decides a
  crash.
- `attempt()` (`worker.ts:88-98`) opens the handle before `run()` and logs, in a `finally`, `logger.info('job heap',
  { job_id, job_type, heap_live_peak_mib, heap_limit_mib })`. A job with no major collection while it ran logs the
  latest value from before it began.
- `packages/observability/src/fields.ts`: `heap_live_peak_mib` and `heap_limit_mib` join `NUMERIC_LOG_FIELDS` (:54 at
  #42's head; `lint:logs` reads that list), and `fields.test.ts` (:30-33, which pins the list) gains them. The message
  is fixed text.
- `worker.test.ts`: the line is logged once per attempt, with numbers only and no other field.

### 5.5 SUITE-CAP-1b: the release-capacity harness (D10, D20, `tools/release-capacity`)

- `scenario.ts`: `ScenarioSize` gains `largeTogetherLines` (100,000 at `FULL_SIZE`, 2,000 at `SMALL_SIZE`) for D and E,
  and the second set of C's 835s (`capacity835(index + remittances, …)`); `seedPractice` for D and E as for A.
- `run.ts`:
  - setup: D's run priced after B's (`waitForJobs`, not measured);
  - after the chain, the phase "large jobs together" (D20): A's second report requested, E's run created, then A's
    report, D's triage, E's price and C's four parses queued together, `memory.current` sampled each second until all
    finish; its peak reported beside the concurrent phase's;
  - `jobOutcome` (:228-240) also reads `pgboss.job.retry_count`;
  - the chain's `waitForJobs` gets a tick that samples `memory.current` each second, for A's triage and for A's report
    separately;
  - a sampler reads, each second over the whole run, the largest advisory-lock count held by any one backend:
    `SELECT coalesce(max(n), 0) FROM (SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' GROUP BY pid) x`;
  - the worker log's `job heap` lines read back by job ID (the harness already parses the log for error codes).
- `checks.ts`, new failing checks:
  - a measured job completed on attempt N > 1;
  - a backend held more than `ADVISORY_LOCKS_PER_TRANSACTION` (64, the value of `TRACE_LOCK_BUCKETS`, imported, not
    copied);
  - a job's `heap_live_peak_mib` above 75% of its `heap_limit_mib` (`HEAP_LIVE_PERCENT = 75`), or a measured job with no
    `job heap` line;
  - a phase's sampled peak, or a chain job's, above 90% of the task (921.6 MiB), reported with its job;
  - any job of the new phase not completed.

  The summary's table gains "Attempts" and "Live heap" columns, and the memory line names each phase's and each chain
  job's peak.
- Under Q1, `scenario.ts` and `run.ts` add step 7b, "A's reconcile". A SYNTHETIC posting export posts every one of A's
  actionable lines at its expected amount (`packages/synth/src/formats` writes it). It is uploaded through intake,
  parsed, reconciled by the reconcile job, and measured like the chain.
- `checks.test.ts` and `scenario.test.ts`: each new rule and the new phase's jobs, failing and passing.

### 5.6 SUITE-CAP-1b: the alarm (D23)

`infra/lib/constructs/monitoring.ts`: a metric filter on the worker log group for `$.msg = "job heap"`, value
`$.heap_live_peak_mib`, and an alarm on its maximum over five minutes above `HEAP_MIB.worker × 0.75` (imported from
`infra/lib/heap.ts`), with the worker's other alarms' actions. `infra/test/monitoring.test.ts` asserts the filter, the
threshold and the actions.

### 5.7 Documents

- ADR 0083 (new, in SUITE-CAP-1a): sections 2 and 3; the rule that a statement over a month's lines looks each line up
  through an index (the planner cannot count a transaction's own rows); the rule that a job's heap does not hold a
  month's lines beyond a small, measured per-line holder; "The split" (1a, then 1b) and D21's release order. SUITE-CAP-1b
  updates its status line and adds the lock's section as built.
- ADR 0038: a dated note under "Who triages and when", saying that the per-line lock is a row lock (0083). Its sentence
  "an advisory lock per practice" stays true. (1b)
- `docs/runbooks/ci.md` (the `release-capacity` rows, :44-45): the new checks and phase, and how to read a lock-count,
  attempt or live-heap failure. (1b)
- `docs/runbooks/deploy-and-rollback.md`: for 1b's release, the migration's lock loop (what its failure message means:
  run the deploy again) and D21's rollback note. (1b)
- `docs/runbooks/incident-response.md`: the heap alarm, what it means and the first steps (find the job by ID in the
  log; the weekly run's last summary). (1b)

---

## 6. Every sentence a person reads, word for word

**None changes, and none is added.** No page, notice, email, PDF, CSV column or row, or job message changes. These are
the sentences this change runs through, kept byte for byte. The database raises them as 23514, and the web shows them as
the reopen form's error (`apps/web/src/lib/http/invoke.ts:317-321`):
- "line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason"
- "a reopen names the stage the line is at"
- "a reopen keeps the line at its stage or moves it back; moving forward is not a reopen"
- "a reopen is a person's explicit action"
- "a line's stage events never change; a reopen is a new event"

Under Q1, the ledger's messages ("the posted or deposited entries of a posting or EFT row never sum past the row's
amount", and the others in the two bodies) are unchanged too.

The audit report's content, its CSV's bytes and the HTML its PDF is printed from are identical to today's for the same
run and date (CAS-41.1).

**What people stop seeing**, because the cause is gone: for a large month, the practice home's failed-job notice for
triage and for the audit report (`apps/web/src/app/p/[practiceId]/page.tsx:43-56` names the jobs), and the report's
failure sentence, "The report job failed three times (…) and the operator was alerted; generate a new report once it is
fixed." (`apps/web/src/lib/reports/queries.ts:61-69`). Their words do not change.

The words this work adds are for operators and builders, never product copy: the migration's lock-loop message ("line_status
stayed in use for five minutes; run the deploy again (docs/adr/0083)"), the log message `job heap`, the alarm's name, ADR
0083, the migration's comments, the domain model's rows and the runbook paragraphs, all in the house style. Brand rules
(CO-11, BRAND.md) are therefore untouched.

---

## 7. Tests

Each test fails first on its PR's base and passes after it, except where it says it is a guard. Coordination between
two connections waits on `pg_stat_activity` (the second backend's `wait_event_type = 'Lock'`), never on a sleep.

### CAS-40 (SUITE-CAP-1b): a line's stage events keep their rules and their commit order under concurrent writers, and no transaction holds a lock per line

`packages/db/src/line-status.db.test.ts` (new), on a database migrated from empty, with two application-role
connections in the practice's scope and lines from the row factory, unless a test says otherwise:
1. **Two forward events for one line.** A writes validated and holds its transaction. B's validated waits. A commits,
   and B is refused with "line stages move forward only; …". The line has one validated event, and its head row equals
   it. (A guard: passes today.)
2. **Order follows commits.** A writes flagged. B's actionable waits. A writes validated and commits, then B commits.
   By `seq` the events are flagged, validated, actionable; the head row says actionable at the last `seq`; a third
   writer's actionable is refused. **Fails first:** B's event sorts before validated, and the third actionable is
   accepted (probe R2).
3. **A person's reopen against a forward move.** The line is at validated. A (in no one's name) writes actionable and
   holds. B, as a person, writes a reopen from validated with an encrypted reason (`enc:v1:…`, as
   `line_status_reason_encrypted` requires), and waits. A commits, and B is refused with "a reopen names the stage the
   line is at". (A guard.)
4. **No new deadlock.** The shapes of `execute.ts:444-446` and `triage.ts:522-528`: T1 writes a stage for line F; T2
   updates case line X (and so its case); T1 updates case line X and waits; T2 writes a stage for line X. Both commit.
   (A guard: a practice lock in the trigger raises 40P01 here, probe R3.)
5. **The rules and the head row, as a property** (fast-check, 100 runs, sequential). Run as the owner with the
   practice in scope (`asOwner`), so the restrictive `line_status_set_by_case_workers` policy, which binds `tp_app`
   only, does not narrow the domain; reasons are `enc:v1:` values. The generator draws sequences of events over three
   lines, each event one of: a forward event to flagged, validated or actionable; a person's reopen from any of those
   stages to any of them; a reopen in no one's name from any of them. The model is the four rules of 1.2 over those
   three stages; payer approved and recovered are outside the generator, because `line_status_ledger_rules` admits them
   only from ledger entries (40.6 covers them). The database accepts an event exactly when the model does, with the
   model's message; after every step each line's head row equals its latest event by `seq`. Rule 4 is exercised: every
   reopen in no one's name from these stages is refused with "a reopen is a person's explicit action".
6. **Payer stages, with the ledger** (`apps/worker/src/reconcile/stage-head.db.test.ts`, new, on the ledger-world
   helper `apps/worker/src/reconcile/test-support/ledger-world.ts`). One case line taken to actionable; the ledger's
   entries put it at payer approved; the stage event to payer approved is accepted and the head row follows; recovered
   is refused until a posted entry exists, then accepted; a recoupment entry leaves the ledger at actionable, and the
   ledger's reopen in no one's name from recovered back to actionable is accepted (rule 4's one admitted case), while a
   reopen in no one's name to any other stage is refused with "the ledger moves a line back only to the stage its
   entries leave it at". After every step the head row equals the latest event. (A guard for the rules; it fails first
   only on its head-row assertions, which have no table to read on the base.)
7. **The backfill.** On a database migrated to SS-01's head, with events written for several lines of two practices
   (reopens included), applying this migration leaves one head row per line, equal to its latest event.
8. **The pieces.**
   - `line_status_rules` is `SECURITY DEFINER`, owned by `tp_owner`, with its `search_path`.
   - `line_status_head` has forced row-level security, its registry row, no grant to any login role, and its two guards.
   - `pg_get_serial_sequence('line_status', 'seq')` is `public.line_status_seq_seq`.
   - `claim_by_superseded` exists with its predicate.
   - The lock loop: while another connection holds an open transaction that inserted a stage event, the migration's
     `DO` block (run alone on a scratch database) retries without blocking a third connection's stage insert, which
     commits; when the holder commits, the block takes the lock.
   - Under Q1, each ledger body equals 20261027090000's except its lock line and comment.
9. **One transaction, 30,000 events.** As the application's login, one `INSERT … SELECT` of 30,000 events completes,
   and the advisory locks its backend holds afterwards are 0. **Fails first:** 53200, or 30,000 locks where the
   cluster's table is larger.
10. **Another practice is unaffected.** While practice A's transaction holds its 30,000 events open, practice B's 2,000
    events commit. **Fails first:** 53200 (probe A2).
11. **Empty statistics.** After `VACUUM ANALYZE` of the empty `line_status` and `line_status_head` (reltuples 0), one
    transaction inserts 40,000 events; across that insert `pg_stat_xact_user_tables.seq_scan` rises by 0 for
    `line_status` and for `line_status_head`. The times for 10,000 and 40,000 events are printed, never asserted.
    **Fails first:** today's trigger plans its lookup as a sequential scan per event (probe S: 4,000 events, `seq_scan`
    +4,000).

### CAS-41 (SUITE-CAP-1a): a month's triage and report read in bounded memory and give the same answers

1. **The same answers** (`apps/worker/src/triage/batched.db.test.ts` and `apps/worker/src/report/streamed.db.test.ts`,
   new; `triage.db.test.ts` and `report.db.test.ts` unchanged). On the existing CAS fixtures through the jobs
   (`executeTriage`, `generateAuditReport`), and on a generated 10,000-line run through the readers alone
   (`judgedCandidates`, `gatherReport`), with several payers and plans, patterns above and below materiality, held
   lines, window-passed lines, per-visit lines, overpaid lines, unpriced lines, content gaps, deadline-unverified lines
   with several causes, written-off case lines, a case of another run, and claim numbers that tie on payer and plan. The
   generated run's stages, cases and case lines are written by the test as the owner, committed in batches of 1,000, so
   today's trigger never holds more than 1,000 line locks while CI's other files share the cluster:
   - `judgedCandidates` returns the same `CandidateLine`s, in the same order, as `candidateLines(candidateRows(…))`;
   - the streamed report's `content` deep-equals the whole read's, its CSV is byte-identical to `auditCsv(lines)` of the
     whole read, and the HTML handed to the PDF renderer (a recording renderer) is identical. The test pins the
     report's ID and date, and keeps the whole read in the test as the reference;
   - `lineShares` and `patientBalanceCases` give the same results as the filtering versions, kept in the test;
   - the audit events are the same set, one per row read.
2. **Bounded memory per line** (`apps/worker/src/report/streamed.db.test.ts` and `triage/batched.db.test.ts`). On the
   same generated shape at 2,000 and at 10,000 lines, the heap in use after two full collections (`heapUsed` after two
   `gc()` calls; `intake.large.db.test.ts` adds `arrayBuffers`, which here are the arena's and are checked apart),
   sampled every 250 ms while `gatherReport` runs and again before the CSV is written, grows by at most 400 bytes per
   added line between the two sizes, and the arena's buffers equal the CSV's bytes within one chunk. The same for
   `judgedCandidates`, at most 1,000 bytes per added candidate (probe T: about 720). **Fails first:** run against
   today's readers (`gatherReport` as it is, `candidateLines(candidateRows(…))`), which hold every line's trace and
   `ReportLine` (965 bytes of `ReportLine` alone, probe M).
3. **The arena** (`apps/worker/src/report/csv-arena.test.ts`, unit). Rows appended in random order come out in the
   comparator's order; the stream equals `auditCsv` of the sorted lines byte for byte, across chunk boundaries, with
   non-ASCII payer names, values needing quotes or the formula prefix, and ties broken by line ID; `release()` frees
   the chunks.

### CAS-42 (SUITE-CAP-1b): a real-size month triages and reports alone and beside other practices' large jobs

1. **Each job alone at real size** (`apps/worker/src/triage/triage.large.db.test.ts`, new; `TP_LARGE_TRIAGE_LINES`,
   100,000 by default). It has the harness's shape, which probes F to T used: B's 20,000-line month is priced, triaged
   and analysed first. Then A's month is priced, triaged by `executeTriage` and reported by `generateAuditReport`, each
   in its own child process (as `era-export.large.db.test.ts` runs its bound) with the heap flag
   `--max-old-space-size=420`, 75% of `HEAP_MIB.worker` (`infra/lib/heap.ts`), and with Chromium where it is installed
   (CI installs it for the db shards, `tools/test/ci-chromium.ts`). It asserts:
   - both complete, each child exits 0, and no heap error is logged;
   - every candidate's stage events are present;
   - the advisory locks held by any backend, sampled every 25 ms (`era-export.large.db.test.ts:115-150`'s pattern),
     never exceed 1 (the practice's `triage:` lock);
   - A's actionable write takes under 30 s;
   - the times are under the budgets in section 8.4.

   **Fails first:** 53200 at the validated insert. The file joins `SLOW_FIRST` (`vitest.config.ts`), so its shard starts
   it first.
2. **Together** (the same file). Y's month (100,000 lines, priced, not triaged) is seeded as A's. In one child process
   under `heapFlag('worker')` (560 MiB), A's second audit report (its inline triage a re-triage) and Y's triage run at
   once, as the worker runs them, with Chromium. Both complete, the child exits 0, and the largest heap after a full
   collection (D19's observer) stays under 75% of the limit. **Fails first:** on SUITE-CAP-1a's merge, 53200: the lock
   stops Y's triage at its validated insert.
3. **Under Q1, reconcile at size** (`apps/worker/src/reconcile/reconcile.large.db.test.ts`, new): 20,000 case lines,
   each posted by one row of a SYNTHETIC posting export, reconciled in one pass. The pass completes; the 20,000 posted
   entries are written; each line reaches the stage its entries put it at; and no backend holds more than 1 advisory
   lock (the practice's `ledger:` lock). **Fails first:** 53200 (about 40,000 evidence and line locks).
4. **The harness's rules** (`tools/release-capacity/checks.test.ts`, `scenario.test.ts`): each new rule fails when it
   should and passes when it should: a job completed on its second attempt; a backend sampled at 65 advisory locks; a
   job's live heap at 421 of 560 MiB; a measured job with no `job heap` line; a phase peak above 90%; a job of the new
   phase not completed; and an unread attempt count, lock sample or heap line fails closed.
5. **The weekly run** (`.github/workflows/release-capacity.yml`, unchanged, at `FULL_SIZE`: A, D and E 100,000 lines, B
   20,000, under release 900110):
   - A's triage and A's reports, D's triage and E's price job (and, under Q1, A's reconcile) complete on attempt 1;
   - no backend holds more than 64 advisory locks at any sample;
   - no job's live heap passes 75% of the heap limit;
   - `memory.peak` stays at or under 90% of 1,024 MiB, over the run and in each phase;
   - the peaks are reported per phase and per chain job.

   **Fails first:** today's run (A's triage and report failed, capacity summary).
6. **Before and after on the PR:** run the harness once with `--worker-image` on the base's image and once on the
   head's, against the same release directory (section 8.2), and put both summaries in the PR. The base is
   SUITE-CAP-1a's merge, so the "before" isolates the lock.

### Tests updated, not added

- `packages/db/src/catalog.db.test.ts`: the registry list (from :66) gains `line_status_head`. (1b)
- `packages/db/src/migrate.db.test.ts`: the owners list (from :100) gains `line_status_head`. The Drizzle mirror check
  (:596-618) passes with `lineStatusHead` in `packages/db/src/schema/triage.ts`, and `claim_by_superseded` in
  `schema/remittances.ts`. (1b)
- The generated cross-tenant tests (`cross-tenant.db.test.ts`) cover the new table from its registry row. It has no
  application INSERT grant, which the test already handles (:212-215). (1b)
- `apps/worker/src/worker.test.ts`: the `job heap` line (5.4). `infra/test/monitoring.test.ts`: the alarm (5.6). (1b)
- Unchanged and still passing:
  - `apps/worker/src/triage/triage.db.test.ts` (:296-340 among them), `apps/worker/src/report/report.db.test.ts`, the
    ledger tests LED-01 to LED-17 and the oracle;
  - the e2e journeys J8 (`apps/web/e2e/triage.spec.ts:41`) and J12 (`apps/web/e2e/reports.spec.ts:88`);
  - the helpers that insert stage events directly (`apps/web/src/lib/routes/test-support/triage-world.ts:109`,
    `packet-world.ts:97` and :112, `apps/web/e2e/packets.ts:199`, `apps/worker/src/packets/test-support/packet-world.ts:150`),
    which run inside `asOwner` and so set `app.practice_ids` for the definer's head write.
- No new e2e journey: nothing a person sees changes.

### Test matrix rows (`docs/product/test-matrix.md`, after CAS-39; `packages/synth/src/cases/matrix.ts` word for word)

| ID | Title | Expected |
| --- | --- | --- |
| CAS-40 | Concurrent writers of one line's stages | The second of two forward events is refused; a reopen naming a stage that has since moved is refused; a line's events sort by commit order, so a duplicate forward event is refused; no new deadlock; every line's head row equals its latest event, through the ledger's stages too; 30,000 stage events in one transaction hold no advisory lock per line, and another practice's events commit meanwhile; an empty table's statistics add no sequential scan per event |
| CAS-41 | A month's triage and report read in bounded memory | Triage's candidates and the audit report are read in batches; the judged candidates, the report's content, its CSV's bytes and its PDF's HTML equal the whole read's; what the report holds grows by at most 400 bytes per line, its CSV rows kept outside the heap |
| CAS-42 | A real-size month triages and reports | A 100,000-line run triages and reports in one transaction each under 75% of the worker's heap, holding at most its practice's one advisory lock, within the time budget; a 100,000-line report and another practice's 100,000-line triage complete together under the worker's heap; the weekly run under release 900110 completes every measured job on its first attempt, with no backend above 64 advisory locks, no job's live heap above 75% of the limit and the worker's memory at or under 90% |

`packages/synth/src/cases/registry.ts`, each entry with the test files above:
- `'CAS-40': none(8, 'Concurrent stage events on generated lines: no file.', […])` (1b);
- `'CAS-41': none(8, 'Generated at size by the test: no file.', […])` (1a);
- `'CAS-42': none(8, 'Generated at size by the test, and release 900110 built outside the repository by the weekly run: no file.', […])` (1b).

---

## 8. The measurement

### 8.1 What "within the worker task" means

- The worker task: 0.5 vCPU and 1,024 MiB (`infra/lib/environments.ts:111`), Node's heap at 560 MiB (`infra/lib/heap.ts:9`),
  one process running every practice queue at once (1.1).
- A job attempt expires after pg-boss's 15 minutes, with three attempts in all (`apps/worker/src/jobs/registry.ts:110-142`).
- The weekly run fails above 90% of the task's memory (921.6 MiB, `tools/release-capacity/checks.ts:12`).
- This design adds: a measured job completes on its first attempt; the worker's live heap, read just after full
  collections, stays at or under 75% of its limit (420 MiB) in every job, alone or beside the others.

### 8.2 The weekly workflow, and the local reproduction

- **Weekly.** `release-capacity.yml` runs on Tuesdays at 03:29 UTC and on request, from the default branch
  (`claude/build-platform`, since repository setting F1 (a)). With SUITE-CAP-1b it reads the new checks (D10) and runs
  the new phase (D20), and under Q1 one more. On a failure it opens or comments on the issue "Release capacity test failing"
  (`docs/runbooks/ci.md:44-45`).
- **Locally, the same harness**, under `flock /tmp/laneb-heavy.lock`:
  `pnpm exec tsx tools/release-capacity/run.ts --out <dir> --runtime process --images <dir> --admin-url
  postgres://postgres:test@localhost:5433/postgres --database tp_capacity_<name> --release-dir <dir>`. The release
  directory is built once with `tools/release/scale.ts --shape quarterly`. `--small` proves the harness end to end and
  measures nothing. The images directory holds the worker image's Chromium, as #49's run did.
- **Locally, the large tests alone** (CAS-42.1 and .2; minutes rather than the hour the release load takes), under the
  same lock, with Chromium from this container's install:
  `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm exec
  vitest run --project db apps/worker/src/triage/triage.large.db.test.ts`.
- **Before building SUITE-CAP-1b** (the review's F2): its first slice runs CAS-42.1 and .2 on SUITE-CAP-1a's merge with
  the lock fix applied, with Chromium, and records A's triage, A's report and the pair's live-heap peaks in the PR. If
  any is above 75% of the heap, SUITE-CAP-1b stops and the bound goes back to 1a's readers before anything else is built.

### 8.3 What the probes measured (100,000 lines through the job code)

The probes ran this container's PostgreSQL 18 (64 locks per transaction, 100 connections) and the job code, in the
shape of `price.large.db.test.ts`:
- half the lines Medicare Advantage non-contracted, and half under a SYNTHETIC 110% contract with a 365-day window;
- encrypted SYNTHETIC claim numbers;
- 66,666 lines validated, and 33,334 actionable in one case.

Probes F to T first triaged a 20,000-line practice and analysed, as the harness does. E, G, G2 and T ran under the
worker's heap flag, `--max-old-space-size=560`. Probes B to G2 printed the PDF with the test stand-in (1.4); probe T
printed it with Chromium. The candidate fixes were applied in the probe's own clone, never committed. A probe's heap
peak is sampled `heapUsed`, which includes garbage V8 has not collected yet; its "live" figure is `heapUsed` after two
full collections.

| Probe | Code | A's triage | A's report |
| --- | --- | --- | --- |
| B | Today | Fails 53200 at 47.9 s, 14,844 locks | Fails 53200 at 51.1 s |
| C | Lock fixed, index | 259.7 s (actionable 208.0 s); heap peak 626 MiB | 126.0 s; heap peak 1,125 MiB |
| D | Lock fixed, no index | 261.0 s | 693.1 s (patient balance 616.0 s) |
| E | As C, heap flag 560 | 267.3 s; heap peak 531 MiB | **Heap out of memory** |
| F | As C, harness shape | 244.1 s (actionable 196.8 s) | 112.8 s; heap peak 849 MiB |
| G | All of the first design's fixes but D16, heap flag 560 | **53.9 s** (candidates 34.2, validated 9.3, case lines 3.9, actionable 5.3); heap peak 209 MiB | **Completes**, 187.0 s (patient balance 111.9 s); heap peak 405 MiB |
| G2 | All of the first design's fixes (the report's traces dropped per batch, its lines still held), heap flag 560 | **49.8 s** (candidates 32.7, actionable 5.0); heap peak 213 MiB | **73.1 s** (gather 51.4, of which patient balance 3.4); heap peak 483 MiB |
| T | The first design's reads (G2's code), the lock fix and the index, heap flag 560, Chromium | 52.4 s; heap peak 213 MiB; live 107 MiB after judging 66,666 candidates (84 MiB after 33,332 on a re-triage) | 84.5 s (the PDF 0.7 s); heap peak 419 MiB; live 154 MiB after gathering 100,000 lines; Chromium 165 MiB across six processes |
| T together | As T: X's report and Y's triage at once in one process | Y's triage completes | X's report completes; the pair in 83.7 s; heap peak 483 MiB; Chromium 153 MiB |

Every probe held at most 1 advisory lock after the fix (the practice's `triage:` lock).

Probe T ran in vitest's process, whose own code and modules hold about 250 to 350 MiB outside the heap (its resident
memory less `heapUsed`), so its process-tree figure (910 to 919 MiB with Chromium) says little about the worker task;
the harness measures that with the worker's production command. What T shows is the heap: live sets far below the
sampled peaks, and sampled peaks near the limit. That is why D19 measures the live heap, and why the weekly check
reads it rather than a sampled `heapUsed`. The stream itself was measured by its parts (probe M); CAS-41.2 and CAS-42
hold it to its bound once built.

### 8.4 Budgets

CAS-42's limits, set at about two and a half times the probes (this container's 4 CPUs are a GitHub runner's), so they
catch a return of any defect in 1.4, each of which cost minutes or the heap, without flaking on a slow runner:
- A's triage under 120 s (G2: 49.8 s; T: 52.4 s), and its actionable write under 30 s (G2: 5.0 s; the quadratic
  statement took 196.8 s);
- A's audit report under 180 s (G2: 73.1 s; T, printing with Chromium: 84.5 s; without the index 693.1 s);
- each job alone completes under a 420 MiB heap flag, and the report and the triage together under 560 MiB;
- the live heap after full collections under 75% of the flag in force;
- at most 1 advisory lock held by any backend.

The weekly run measures the same jobs at the worker task's 0.5 vCPU. Its times stay advisory, as the founder ruled for
the screening's capacity test (2026-10-23), which this run follows (`checks.ts:1-9`). Its hard limits are the job's
15-minute attempt, the first-attempt check, the lock bound, the live heap at 75% and 90% of memory. At half a CPU the
JavaScript parts take about twice as long, so A's triage and report should take minutes, well inside one attempt.

---

## 9. The domain model and the function files (SUITE-CAP-1b)

**Regenerate in SUITE-CAP-1b, on the tree with #42, SS-01 and SUITE-CAP-1a merged:** `pnpm db:domain-model --out`, from
a database migrated from empty. SUITE-CAP-1a changes no schema object and regenerates nothing.

**What changes in `docs/product/domain-model.md`:**
- the new `line_status_head` table, in the "Pricing, triage and cases" area;
- `claim`'s new index, `claim_by_superseded` (unless the interest PR carried it first);
- `line_status_rules`'s row, now `SECURITY DEFINER`;
- the trigger lists of `triage_never_deleted` and `triage_no_truncate`, which gain `line_status_head`'s two guards;
- under Q1, the two ledger functions' rows (their bodies, through the function files).

**What changes in `packages/db/functions`:**
- changed: `line_status_rules.sql` (its body, `SECURITY DEFINER` and its owner's settings);
- changed: `triage_never_deleted.sql` and `triage_no_truncate.sql`, each one header line only: `-- Trigger function of:
  line_status_head.line_status_head_never_deleted` and `… line_status_head.line_status_head_no_truncate`, the new
  guards on `line_status_head` (D6). Their bodies are unchanged;
- under Q1, changed: `ledger_entry_within_evidence.sql` and `ledger_entry_within_line.sql`.

**Inputs the generator needs:**
- `packages/db/domain-model/areas.json` (#42's file) places `line_status_head` in the triage area (:74-93). The area's
  "about" gains one clause: "each line's current stage is also kept on one head row, which orders its events".
- `docs/product/data-dictionary.md` stays verbatim. An "extra table" divergence is informational, so `--strict` asks no
  explanation; if it ever does, the builders add the `divergence-explanations.json` entry it names.

**Gates:**
- `pnpm db:domain-model --check --require-approval` passes only with the founder's line.
- The PR is opened with `pnpm db:domain-model --summary-since origin/claude/build-platform --function-diffs list`. The
  summary names the five changed function files (three without Q1), each with its one-line reason above.
- The regenerated function files are committed before the founder signs, since a commit after the approval dismisses it.
- The approval line goes up as one suggested-change comment on that line (CLAUDE.md "Schema gate";
  `.claude/skills/new-migration`), never written by a session and never as a review.

---

## 10. What the founder must approve or rule

1. **Approve `docs/product/domain-model.md`** of SUITE-CAP-1b by its SHA-256, on the PR's latest commit (CO-02; ADR
   0063).
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
     with this design's section 4.5 and CAS-42.3), and the release-capacity run gets its reconcile phase with that item.
     Until then, a real-size reconcile can fail.
   - **With the "Interest credited twice" item** (LED-23 to LED-25, which also waits for a ledger freeze exception), the
     two can be granted together. Whichever PR lands second recreates any shared ledger function on the first's body.
     Neither changes the other's lines. They also share `claim_by_superseded` (D15).

Nothing else goes to the founder:
- D16 and D18 (`lineShares`' grouping, the folded patient balance and the ledger read once) change reconcile code that
  the report reads, not ledger semantics: no ledger table, ledger package, matching rule, stage or recovered total
  changes, and the LED tests guard it. So they need no exception.
- The split into two pull requests and their order are the orchestrator's (LANES.md rules 2 and 7).
- No legal text, no founder ruling reversed, no engine or content freeze exception, no product change (the CSV's order
  and bytes stay).
- No new service and no parameter. The one cost is the heap alarm's custom metric and alarm (D23), under a dollar a
  month at CloudWatch's list prices, inside the monitoring the platform already runs.

---

## 11. Files

#42's files are marked **(#42)**. SUITE-CAP-1b follows #42, SS-01 and SUITE-CAP-1a, so it edits their final text, and
re-reads each file at the merged head before changing it. SUITE-CAP-1a changes no #42 code file, so it can open while
#42 is open; its three shared documents and the generated watched list follow LANES.md rule 6 (the PR merged second
resolves the documents and runs the generator again).

**SUITE-CAP-1a (bounded reads)**
- `apps/worker/src/triage/execute.ts` (`advanceStages`, `judgedCandidates`), `patterns.ts` (`planWaiting`)
- `apps/worker/src/report/content.ts` (the fold, `ReportFigures`, `patientBalanceCases`), `csv-arena.ts` (new),
  `generate.ts` (the order of the writes)
- `apps/worker/src/reconcile/patient-share.ts` (`lineShares`, `lineCorrections`' entries)
- `apps/worker/src/triage/batched.db.test.ts` (new), `apps/worker/src/report/streamed.db.test.ts` (new),
  `apps/worker/src/report/csv-arena.test.ts` (new)
- `docs/adr/0083-…md` (new); `docs/product/test-matrix.md` **(#42)** (CAS-41); `packages/synth/src/cases/matrix.ts`
  **(#42)** and `registry.ts` **(#42)** (CAS-41)
- `tools/screening-capacity/watched-paths.txt` (regenerated by `watched.ts --write`, since it watches `triage/execute.ts`,
  `report/*` and `reconcile/*`) **(#42)**: regenerated by whichever of the two merges second (LANES.md rule 6).

**SUITE-CAP-1b (the stage lock)**
- Database:
  - `packages/db/migrations/20261109090000_line_status_heads.sql` (new)
  - `packages/db/src/schema/triage.ts` (`lineStatusHead`) and `schema/remittances.ts` (`claim_by_superseded`);
    `packages/db/src/schema/index.ts` (the export) **(#42)**
  - `packages/db/functions/line_status_rules.sql`, `triage_never_deleted.sql` and `triage_no_truncate.sql` (generated);
    under Q1, `ledger_entry_within_evidence.sql` and `ledger_entry_within_line.sql` (generated)
  - `packages/db/domain-model/areas.json` **(#42)**; `docs/product/domain-model.md` (generated) **(#42)**
  - `packages/db/src/line-status.db.test.ts` (new); `catalog.db.test.ts` **(#42)**; `migrate.db.test.ts` **(#42)**
- Worker:
  - `apps/worker/src/heap.ts` (new), `apps/worker/src/worker.ts` (`attempt`), `worker.test.ts` **(#42)**
  - `packages/observability/src/fields.ts` **(#42)** and `fields.test.ts`
  - `apps/worker/src/reconcile/stage-head.db.test.ts` (new), `apps/worker/src/triage/triage.large.db.test.ts` (new) and
    `vitest.config.ts` (`SLOW_FIRST`); under Q1, `apps/worker/src/reconcile/reconcile.large.db.test.ts` (new)
- Harness: `tools/release-capacity/run.ts`, `checks.ts`, `checks.test.ts`, `scenario.ts`, `scenario.test.ts`;
  `tools/screening-capacity/watched-paths.txt` (regenerated) **(#42)**, so the screening-capacity gate runs on this PR
- Infra: `infra/lib/constructs/monitoring.ts` and `infra/test/monitoring.test.ts` **(#42)**
- Documents:
  - `docs/adr/0083-…md` (status and the lock's section), `docs/adr/0038-…md` (the dated note)
  - `docs/product/test-matrix.md` **(#42)**; `packages/synth/src/cases/matrix.ts` **(#42)**;
    `packages/synth/src/cases/registry.ts` **(#42)** (CAS-40, CAS-42)
  - `docs/runbooks/ci.md` (:44-45), `docs/runbooks/deploy-and-rollback.md` **(#42)**, `docs/runbooks/incident-response.md`
  - under Q1, `docs/product/reconciliation-001.md` **(#42)**: the exception, dated and attributed, under "Ledger
    semantics", in the form of the other granted exceptions

No web file changes in either: the Cases page reaches the new reader through `@tp/worker/triage`.

---

## 12. Risks

| Risk | What keeps it small |
| --- | --- |
| The head row drifts from the latest event | One writer (the definer trigger), no grant to anyone, and guards against delete and truncate. CAS-40.5's property and CAS-40.6's ledger sequence after every step, and CAS-40.7 for the backfill. Line events are append-only, so the only way to drift is the owner bypassing triggers, which no code does. |
| An event is refused after its head row was written | The exception undoes the statement's writes, the head row included. CAS-40.1 and .3 read the head row after the refusal. |
| The definer trigger writes outside the writer's practice | Row-level security is forced on the head table, for its owner too, and reads the session's `app.practice_ids`. `line_status`'s own policy and `line_status_belongs` still apply. The cross-tenant tests cover the table. A writer scoped to one practice naming another's line is refused at once (42501) without waiting on that practice's head row (the review's probe), which is better than today's advisory key. |
| `RETURNING OLD` needs PostgreSQL 18 | Every environment runs 18 (RDS `VER_18`, the pinned `postgres:18` images, CI). RDS cannot downgrade, and on an older server the migration fails to compile rather than misbehave. |
| The streamed report changes an answer | CAS-41.1 compares the content, the CSV's bytes, the PDF's HTML and the audit events with the whole read on the fixtures and a generated run that exercises every figure. The query text is shared, not copied, and the per-line mapping is today's code. |
| A cursor outlives its use | It is declared in the job's or the request's transaction and closed after the last batch; a rollback drops it. Names are fixed per reader, so a second declare in the same transaction fails loudly. |
| The deploy's table locks (the backfill, the index build) | The lock loop never queues a writer (D22): a person's reopen and every job go on until the migration finds a moment with no stage writer in flight; then the backfill's seconds and the index build's seconds. If no moment comes in five minutes, the migration fails before any service moves and the deploy is run again. Before launch there are no customer rows. |
| A rollback past SUITE-CAP-1a | D21: from launch on, 1a ships in an earlier release than 1b, so the previous image reads in batches. A rollback past 1a is not a supported step on 1b's schema; ADR 0083 and the runbook's note for 1b's release say why (whole reads on the new trigger take the worker down on a large month). |
| About 17% more time per stage event (2.7 s per 180,000) | Measured (probes V0 and H2). Triage at 100,000 lines is dominated by its reads (section 8.3). |
| Contention on one line is today's contention | Same grain and order, so no new waits. A row-lock wait shows in `pg_stat_activity` as a `transactionid` wait instead of `advisory`; the runbook says so. |
| Under Q1, a future ledger writer forgets `lockLedger` | The trigger still serializes it, taking the practice key late: the worst case is a detected deadlock and a retry, never a wrong amount. ADR 0083 states the rule (a ledger writer takes `lockLedger` before any row), and CAS-42.3's bound catches a writer that adds per-row locks again. |
| A month larger than 100,000 lines | The per-line holders are small and measured: triage's judged candidates (about 720 bytes per candidate, probe T) and the report's arena index (about 110 bytes, plus the CSV's bytes outside the heap). Every job logs its live heap (D19); the weekly run fails at 75% of the heap and production alarms at the same line (D23), before the margin is used. |
| Another job type grows with a month's lines | The worker's other queues (`export`, `packet_export`, `roi_statement`, `report_document`, `parse_835`) are outside this item, and each logs its live heap from SUITE-CAP-1b on, so the weekly run and the alarm see any of them that grows (section 14). |
| The weekly run's new checks fail for another reason (a slow runner, a flaky retry) | The checks fail closed and name the job and attempt. A retry that hides a real fault is exactly what the first-attempt check exists to catch. |

---

## 13. The builders' slices, in order

**SUITE-CAP-1a (bounded reads; can start now)**
1. **CAS-41.1 first**, against the whole reads, to pin the answers (content, CSV bytes, PDF HTML, audit events) before
   the code changes; then CAS-41.3's arena test.
2. **Triage:** D12 and D13.
3. **The report:** D14, D17 and D18, then D16.
4. **CAS-41.2** (memory per line), seen failing on the base first.
5. **Documents:** ADR 0083 (with "The split"), the CAS-41 matrix and registry rows.
6. **The full local suite,** the draft PR, two adversarial reviews (a payment-engine reviewer for the report's figures
   and CSV, and a reliability reviewer for the memory and the cursors), the fix round and the fresh-clone verification.
   No screen changes, so no UX and brand review is due (LANES.md rule 1).

**SUITE-CAP-1b (the stage lock; after #42, SS-01 and SUITE-CAP-1a merge)**
1. **The measurement gate** (8.2): CAS-42.1 and .2 written first, and run on 1a's merge with section 4.2 and 4.3's SQL
   applied to the test database as a scratch script, with Chromium; the live-heap peaks recorded in the PR before
   anything else is built.
2. **Migration and schema** (database builder): section 4 (with 4.5 under Q1), the Drizzle mirror, the generated
   function files (five, or three without Q1), `areas.json`, the domain model and `watched-paths.txt`. Gate: `pnpm
   db:migrate` from empty, the dry run, and `pnpm test:db` (catalog, cross-tenant, migrate).
3. **CAS-40** (database tests): written first against the base, to see each fail first, then run on slice 2.
4. **The heap line** (D19) and the alarm (D23).
5. **CAS-42.1 and .2, and CAS-42.3 under Q1** (worker large tests), with the budgets of section 8.4.
6. **The harness** (CAS-42.4 and .5): `scenario.ts`, `run.ts`, `checks.ts` and their tests, then the before-and-after
   real-size runs on the base's and the head's worker images, under the lock, and under Q1 the reconcile phase.
7. **Documents:** ADR 0083's status and lock section, ADR 0038's note, the CAS-40 and CAS-42 matrix and registry rows,
   the three runbooks, and under Q1 reconciliation-001's exception.
8. **The full local suite,** then the draft PR opened with the domain model's summary, and two adversarial reviews: a
   database and concurrency reviewer, and a reliability reviewer for the harness, the heap line and the alarm (and a
   payment-engine reviewer for the ledger part under Q1). Then the fix round and the fresh-clone verification.

---

## 14. Handed on, and kept out (each with why)

- **Stored per-content windows (#8).** D11: a different table and a different path.
- **The Cases page recomputes its waiting patterns on every load.** `waitingPatterns`
  (`apps/web/src/lib/routes/triage.ts:253`) reads and judges every validated line waiting outside a case, with its
  trace, each time the page opens. D13 bounds its memory, not its time. In the probes' re-triage the same read and
  judgement of 33,332 waiting candidates took 20.6 to 23.7 s per run on this container's 4 CPUs (the whole re-triage 20.5
  to 25.3 s), so a large practice's Cases page would take over 20 s per load, more on the web task's half vCPU, and the
  load balancer gives up at 180 s. Storing the waiting patterns when triage computes them is a product change (what the
  page shows between triages) and needs a table, so it is a Lane A item. The orchestrator records it under LANES.md
  "Handed to Lane A" when this design is accepted, with this text: "2026-10-27, from SUITE-CAP-1's design: the Cases
  page recomputes its waiting patterns on every load (`waitingPatterns`, `apps/web/src/lib/routes/triage.ts:253`):
  reading and judging 33,332 waiting candidates took 20.6 to 23.7 s per load on 4 CPUs; store the waiting patterns at
  triage (a table, so a migration)."
- **Reading the current stage from the head row** elsewhere: the 16 TypeScript sites and the SQL functions that take the
  latest event by `seq DESC`, and `candidateRows`' DISTINCT ON over a practice's whole log (`execute.ts:217-219`, which
  grows with the practice's history). It would make those reads O(1) per line, but it changes many readers for a speed
  this item does not need. This design keeps the head row exact and internal, so a later performance item can rely on it.
- **The report's read of the practice's whole ledger** (`ledgerEntries`, `reconcile/ledger.ts:61-64`): it grows with
  the practice's recovery history, not with a month's lines, and D18 halves it (read once, not twice). Reading only the
  run's cases' entries changes which entries the correction chains resolve against (`entriesById`), a change to how
  the reconcile module reads the ledger that deserves its own review; D19's heap line and the weekly run measure it as
  the history grows.
- **The worker's other queues' heap.** `parse_835` runs four at once, each bounded at 128 MiB of heap for the normalizer
  (`era-export.large.db.test.ts`), and `export`, `packet_export`, `roi_statement` and `report_document` read a
  practice's data too. None is this item's, and D19 now logs each one's live heap, so the weekly run and the alarm see
  them; a queue that grows with a month becomes its own item then.
- **`lock_timeout` for people's requests.** Not needed: option H adds no wait. The general question (a request that waits
  on a row a long job holds, toward the load balancer's 180 s) exists today and is unchanged.
- **The report's long transaction** (it holds `triage:` while it prints): unchanged, and ADR 0038's promise needs it.
- **The audit-event volume of triage's reads** (one row per line read, `readWithAudit`,
  `packages/db/src/authz/audit.ts:59-88`): required by the audit rule, and measured inside the budget.

---

## 15. Probes run for this design

All on SYNTHETIC rows, as the worker's login unless said, on databases migrated from empty at e908c21 (44 migrations),
PostgreSQL 18.4. Databases `tp_design_suitecap1_1` to `_13` were used on port 5433, plus a private cluster on port 5493
(`max_locks_per_transaction` 1,024, the same `shared_buffers`) for the comparisons today's trigger cannot run at 64. The
revision used `tp_design_suitecap1rv_1` to `_3`. Heavy runs held `/tmp/laneb-heavy.lock`. All were dropped, and the
private cluster removed, at the end.

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
| S (revision) | After `VACUUM ANALYZE` of the empty tables (reltuples 0), as the owner with the practice in scope: today's trigger, 4,000 events in one transaction, `pg_stat_xact_user_tables.seq_scan` on `line_status` +4,000 and 4,000 advisory locks; H2, 40,000 events, `seq_scan` +0 on `line_status` and on `line_status_head` (`idx_scan` on the head +40,000), 0 advisory locks, 3.57 s (10,000: 0.92 s) |
| N (revision) | The lock loop of 4.2 (20 tries) while one connection held a transaction that had inserted a stage event for 4 s: a third connection's stage insert committed in 0.09 s, unqueued; the loop took `ShareRowExclusiveLock` on its fifth try, after the holder ended |
| L1 | One transaction re-takes the practice's `ledger:` key 50,000 times: 1 lock-table entry (D8's premise) |
| Backfill | The DISTINCT ON read of 180,000 events with every practice in scope: 0.41 s |
| B to G2 | 100,000 lines through the job code: section 8.3 |
| T (revision) | Four practices through the job code with Chromium, under the 560 flag: section 8.3 |
| M (revision) | 100,000 SYNTHETIC `ReportLine`s built as a cursor delivers them, after full collections: whole `ReportLine`s 965 bytes of heap per line (92.0 MiB); each row kept as a string with its key 437 (41.7 MiB); the arena 108 bytes of heap per line (10.3 MiB) and 27.4 MiB of buffers for 24.6 MiB of CSV, sorted in 0.21 s |
| Actionable | On probe E's database: `case_rules`' aggregate over 33,334 case lines, 0.54 s; a plain `INSERT … SELECT` of 3,000 and 6,000 actionable events, 0.50 and 0.78 s; `advanceStages`' statement with committed statistics and literal arrays, a hash join. So the 197 s is the in-transaction plan of `advanceStages` (1.4, defect 1) |
| Claim lines | `claimLines`' query for the case's 12,500 claims with `claim_by_superseded`: 0.97 s, the index used for the recursive step and the correlated lookup |
| Trace size | 4,735 bytes of JSON per priced line on average (3,064 stored) |

The scouts' probes agree where they overlap (`progress/design-suitecap1-database.md`): 53200 between 14,000 and 16,000
on one `INSERT`; V2, the `service_line` row lock, 11.6 s with 0 advisory locks; and the ANALYZE-on-empty plan, 7 min 51 s.
The design review's probes (`probes/suitecap1rev/`) confirmed sections 4.2 and 4.3 on a database migrated from empty
(the races, the first-event race, two rows for one line in one statement, a savepoint, the cross-tenant refusal, the
backfill) and D12's plan on empty statistics.

---

## 16. After the design review

The review (verdict "build with changes") found three should-fix items and five nits. Each was checked against the
code, and the memory ones by probe, before it was taken.

| Finding | Checked | Disposition |
| --- | --- | --- |
| **F1, concurrent large jobs share one heap** (should fix) | The structure is true. `startWorker` works every practice queue in one process (`worker.ts:224-229`; the review cited :236, the platform loop), one job per queue (`registry.ts:160-162`), on one task (`environments.ts:111`). The particular crash did not reproduce at 100,000 lines: probe T ran X's report and Y's triage together under the 560 flag with Chromium, and both completed (83.7 s; sampled heap peak 483 MiB; live heaps 154 and 107 MiB alone). Adding the two sampled peaks counts each job's uncollected garbage. But the margin was unmeasured, the sampled heap reached 86%, and the report's held lines coincided with Chromium. | **Taken**, for the margin and the measure rather than a crash at 100,000. The report now streams (D14, D17, D18): it folds its figures per batch, keeps each CSV row in a byte arena outside the heap (108 bytes of heap per line, probe M), writes the CSV before it prints, and reads deadlines and the patient balance by batch. Triage's judged candidates are its only per-line holder (2.2). New: the harness phase "large jobs together" (D20: A's report, D's triage, E's price and C's parses at once) and CAS-42.2 (a 100,000-line report and another practice's 100,000-line triage in one process under 560 MiB). The gate was considered and rejected (2.3: pg-boss's expiry runs while a fetched job waits, and small practices would wait on large ones), so it is not added. |
| **F2, the memory trigger measured the wrong quantity** (should fix) | True: the binding limit is the 560 MiB heap; G2's report peaked at 86% of it; the probes printed with the stand-in (`triage-world.ts:80`); #49's run peaked at 803.9 MiB. One correction: Chromium is installed in this container, at `/opt/pw-browsers` (revision 1194, the one playwright-core 1.56.1 launches), only not at Playwright's default path. | **Taken.** The 70% container trigger is gone, and so is the deferral it guarded. The heap is measured as the live heap after full collections, per job (D19), checked at 75% of the limit in the weekly run (D10) and alarmed in production (D23). CAS-42.1 runs each job alone under a 420 MiB flag (75%). Probe T re-measured with Chromium, and 8.3 states which probes used the stand-in. SUITE-CAP-1b's first slice re-runs the large tests with Chromium before anything is built (8.2). |
| **F3, a rollback to the previous image runs out of heap** (should fix) | True: probe E is the previous image's reads on the new trigger, and it ends in a heap out-of-memory where today the report fails 53200 at 48 s. D12, D13, D14 and D16 depend on nothing in the migration. | **Taken.** Two pull requests (2.4, D21): SUITE-CAP-1a, the bounded reads, with no migration and outside the serial chain, then SUITE-CAP-1b. From launch on 1a ships in an earlier release; 4.7, ADR 0083 and the runbook say so. |
| **F4, the deploy's lock waits behind long transactions** (nit) | True: `LOCK TABLE` waits for in-flight stage writers and queues later ones; the report prints inside its transaction; no `lock_timeout` exists (`migrate.ts` sets none). | **Taken, as a loop of `NOWAIT` tries** (D22, 4.2, 4.4) rather than `lock_timeout = '10s'`: a `NOWAIT` try queues nobody, so no reopen waits even ten seconds, and the migration fails cleanly after five minutes without a gap. 4.7 and section 12 corrected. |
| **F5, the property test's domain** (nit) | True: `line_status_ledger_rules` (`20261023120000:587-606`) refuses the payer stages without ledger entries, `line_status_set_by_case_workers` (`20261027090000:278`) binds `tp_app`, and `line_status_reason_encrypted` (:296) requires `enc:v1:` reasons. | **Taken.** CAS-40.5 runs as the owner with the practice in scope and encrypted reasons, over flagged, validated and actionable, with every kind of reopen, so rule 4 is exercised by refusal; CAS-40.6 (new) takes one line through the ledger's stages with ledger-world, including the ledger's admitted reopen and its refusals. |
| **F6, a wall-clock ratio in CI** (nit) | True, and the deterministic quantity was probed (probe S): `seq_scan` +4,000 for 4,000 events today, +0 for 40,000 with the head row. | **Taken.** CAS-40.11 asserts the `seq_scan` deltas; the times are printed only. |
| **F7, two function files missing from the lists** (nit) | True: each generated file lists its callers (`triage_never_deleted.sql:6-11`, `triage_no_truncate.sql:6-12`). | **Taken.** Sections 9 and 11 list both, each with its one-line reason (the new guards on `line_status_head`). |
| **F8, the Cases page sentence** (nit) | True that "seconds" understated it. The count was wrong too: the probes' re-triage read 33,332 waiting candidates (its summary's `validatedLines`), not 66,666. | **Taken, corrected.** Section 14 gives 20.6 to 23.7 s per load for 33,332 waiting candidates on 4 CPUs, the web task's half vCPU and the load balancer's 180 s, and the text of the LANES.md "Handed to Lane A" entry the orchestrator records. |
| The claim's row (from the review's "checked" list) | True: the claim is LANES.md row 188. | Corrected in the header. |

The review's other checks stand and are now cited where the design relies on them: READ COMMITTED writers (4.3), the
test helpers' scope (7), the ledger keys used nowhere else and the practice-scope check before the ledger lock (D8,
4.5), the immediate cross-tenant refusal (section 12), and D12's plan on empty statistics (5.2).
