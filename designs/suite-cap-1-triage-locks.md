# SUITE-CAP-1: triage at real size takes one row lock per line, not one shared-memory lock per line (Lane A schema PR)

Design contract, 2026-10-27, against `claude/build-platform` at e908c21 and PR 6b-4 (#42, `co-001/pr-06b-mail-streams`,
head 098636e3, migration `20261107090000_mail_streams.sql`). Branch `co-001/suite-cap-1-triage-locks`. It follows SS-01
in Lane A's serial chain (`20261108090000_suspension_refusal.sql`, `designs/ss-01-suspension.md`), and its PR opens only
after #42 and SS-01 merge (LANES.md rule 2: one schema PR at a time). Reserved: ADR 0083; test-matrix CAS-40 to CAS-42;
`packages/synth` cases CAS-40 to CAS-42 (module 5, no fixture files); no fixture release. Claim: LANES.md row 186.

Sources: LANES.md "Handed to Lane A" (2026-10-26, from #49); `approval-summaries/lane-b-release-content-checks-status.md`
and `lane-b-release-content-checks-capacity-summary.md`; the release-capacity workflow and harness #49 added
(`.github/workflows/release-capacity.yml`, `tools/release-capacity/*`); the two scouts' reports
(`progress/design-suitecap1-database.md`, `progress/design-suitecap1-application.md`). Every claim below was re-read at
e908c21 (and at #42's head where #42 touches the file), and the claims the design rests on were probed on databases
migrated from empty (section 15).

This is a schema change, so it needs the founder's SHA-256 approval of the regenerated domain model. Its second part
changes two trigger functions on `ledger_entry`, which reconciliation-001's ledger freeze covers, so that part needs a
freeze exception (Q1). It reverses no founder ruling, touches no money computation, no pricing engine and no
`content/releases`, and changes no sentence a person reads.

---

## 0. In ten lines

1. **The defect.** `line_status_rules()` takes one `pg_advisory_xact_lock` per line. A 100,000-line triage holds one per
   line until it commits, and the cluster's shared lock table (64 slots per connection by default) runs out: Postgres
   53200 "out of shared memory". The audit report triages inline, so it fails the same way.
2. **It is also a cross-tenant fault.** The lock table is shared by the whole cluster: while one practice's triage holds
   13,000 locks, another practice's 2,000-line insert fails 53200 (probe A2).
3. **The fix.** Each line gets one head row, `line_status_head` (the line's current stage and the order number of its
   latest event). The trigger takes the line's lock as a row lock on that head row, with one
   `INSERT … ON CONFLICT DO UPDATE … RETURNING`. A row lock lives in the row, not in shared memory, so a transaction of any
   size holds no lock-table entry per line.
4. **The protection is unchanged.** One writer at a time per line, the same waits, the same lock order as today. No
   writer's code changes, no person waits on anything new, and no new deadlock appears (probe R3).
5. **A latent race closes with it.** Today an event's order number (`seq`) is drawn before the lock, so a writer that
   waited can commit an event that sorts before the event it waited on. That lets a duplicate forward event through
   (probe R2). The head row draws `seq` after the lock, so a line's events sort in commit order.
6. **The reconcile side, under a freeze exception (Q1).** Two ledger triggers take one lock per posting or EFT row and
   per line, so a real-size reconcile fails the same way. Every ledger writer already holds the practice's
   `ledger:` lock first, so both triggers take that same key instead: one lock-table entry per transaction.
7. **No database parameter change.** Raising `max_locks_per_transaction` only moves the ceiling (section 2, option A).
8. **Proof.** CAS-40 (the races, deterministic), CAS-41 (the lock-table bound and a 100,000-line triage and report in
   CI, failing first), CAS-42 (the weekly release-capacity run passes, with new checks that a job completes on its first
   attempt and that no transaction holds more than 64 advisory locks).
9. **Stored windows stay with #8.** The 10-to-13-second windows query reads `rule_record`, never `line_status`, and no
   triage or report path calls it.
10. **One migration, one ADR (0083).** The founder approves the domain model, and rules Q1.

---

## 1. The problem, with evidence

### 1.1 What the code does (e908c21)

**The lock.** `line_status_rules()` (latest body `packages/db/migrations/20261023120000_recovery_ledger.sql:550-579`;
earlier `20261022090000_review_guards_visit_shortfalls_and_practice_settings.sql:42-73` and
`20261019160000_triage_cases_and_audit_reports.sql:344-378`) is a `BEFORE INSERT OR UPDATE … FOR EACH ROW` trigger on
`line_status` (`20261019160000:378`). For every row it:
- refuses an update (:554-556);
- takes `pg_advisory_xact_lock(hashtextextended('line_status:' || NEW.service_line_id::text, 0))` (:557);
- reads the line's current stage, the latest event by `seq` (:558). The lookup has no `practice_id`, so only row-level
  security narrows it to the index's leading column;
- checks the new event against it (:559-574) and stamps `set_at` (:575).

`seq` is `bigint GENERATED ALWAYS AS IDENTITY` (`20261019160000:137`), indexed by `line_status_by_line (practice_id,
service_line_id, seq DESC)` (:152). The identity value is drawn when the row is formed, before any BEFORE trigger runs.

**The other triggers on `line_status`** stay as they are: `line_status_ledger_rules` (BEFORE ROW, which fires first by
name, `20261023120000:587-606`), `line_status_belongs` (AFTER ROW, `20261022090000:76-90`), `line_status_refresh_cases`
(AFTER STATEMENT, definer, `20261023090000_packets_submissions_and_responses.sql:837-845`), `line_status_never_deleted`
(`20261019160000:392`) and `line_status_no_truncate` (:655).

**Every writer of `line_status`** (non-test), and the outer lock it already holds:

| Writer | Where | Outer lock | Shape |
| --- | --- | --- | --- |
| Triage job | `apps/worker/src/triage/job.ts:21` → `execute.ts:480-483`, one transaction → `triageInScope` :424 | `triage:<practice>` (`lockPractice` :396-398, taken :426) | `advanceStages` (:326-344): one `INSERT … SELECT` per stage, `ORDER BY service_line_id`; flagged :444, `closeWindows` (UPDATE `case_line`) :446, validated :450, case lines :456/:460, actionable :464 |
| Audit report job | `apps/worker/src/report/generate.ts:54-91`, one transaction | `audit_report … FOR UPDATE` (:57), then `triage:<practice>` | `triageInScope` inline (:73), then reads, prints and stores the report |
| Open a case on a pattern (a person) | `apps/worker/src/triage/patterns.ts:152-180` (web workbench) | `triage:<practice>` (:157) | one multi-row insert at actionable (:173) |
| Reconcile job | `apps/worker/src/reconcile/pass.ts:35-52`, one transaction | `ledger:<practice>` (`reconcile/ledger.ts:16-18`, taken `pass.ts:39`) | `syncLineStages` (`stages.ts:72-103`) → `insertStage` (:61-70), one row at a time, `ORDER BY service_line_id` |
| Manual ledger work (a person) | `apps/worker/src/reconcile/manual.ts:46-50` (`begin`), `finish` :64-68 | `ledger:<practice>` | `syncLineStages` |
| Reopen a line (a person) | `apps/web/src/lib/routes/triage.ts:503-538` | none | `UPDATE case_line` (:522-525), current stage read in TypeScript (:526), insert a reopen (:528) |

`closePassedWindows` (`execute.ts:418-421`, the monitor job) takes `triage:<practice>` and writes no stage.

Writers run at READ COMMITTED (only read-only snapshots use REPEATABLE READ), so each statement inside the trigger sees
what committed before it.

**Why triage holds tens of thousands at once.** `triageInScope` runs in one transaction (`executeTriage`,
`execute.ts:480-483`), and an advisory transaction lock is released only at commit. A 100,000-line month makes up to
100,000 validated events, then the actionable ones for the same lines (already locked), so it holds about one lock per
line it moved. The shared lock table has `max_locks_per_transaction × (max_connections + max_prepared_transactions)`
slots: 64 × 100 locally and in CI, 64 × 200 in the harness (`tools/screening-capacity/containers.ts:258-266`), and the
RDS default on db.t4g.medium (`infra/lib/environments.ts:150-156`; the parameter group sets only TLS,
`infra/lib/constructs/database.ts:128-132`).

**What failed (#49's real-size run, capacity summary):** A's triage failed each of its three attempts at 48.1 s (265.5 s
in all), and A's audit report failed each of its three at 47.2 s (309.7 s). B's 20,000-line triage passed in 10.4 s.
The worker logged `JOB_FAILED` twice.

**The same pattern on the reconcile side.** Two `BEFORE INSERT` triggers on `ledger_entry` take a lock per row:
`ledger_entry_within_evidence()` takes `ledger_evidence:<posting or EFT row>`
(`20261027090000_packet_and_ledger_review.sql:147-201`, lock :172; earlier `20261026090000_recovery_ledger_review.sql:188`)
and `ledger_entry_within_line()` takes `ledger_line:<line>` (`20261027090000:219-270`, lock :246). A reconcile pass is
one transaction (`pass.ts:37-51`), so a pass that posts N case lines holds about 2N locks (one per posting row and one
per line), on top of today's N line-stage locks. A practice's monthly posting export for a 60,000-line dispute set
would fail 53200. The release-capacity run has no reconcile phase, so nothing measures it today.

### 1.2 What the per-line lock protects

The invariants (PRD 8, the status machine; CLAUDE.md "Five line stages … Monotonic; reopen is explicit"):
1. a line's stages move forward only; setting a stage again or an earlier one is a reopen;
2. a reopen names the stage the line is at;
3. a reopen keeps the line at its stage or moves it back;
4. a reopen in no one's name comes only from payer approved or recovered (the ledger's).

The trigger checks each new event against the line's current stage. Without serialization, two transactions can read
the same current stage and both insert, so the lock serializes "read the current stage, check, insert" per line. The
races it closes, among writers that can meet on one line:
- a person's reopen (no outer lock) against reconcile or manual ledger work (`ledger:`) against triage or a case opened
  on a pattern (`triage:`);
- two forward events for one line from any two writers (probe R1: the second is refused).

Triage and reconcile touch disjoint lines in practice: `candidateRows` leaves out lines already in a case
(`execute.ts:253`), and actionable is written only for lines attached in the same transaction. The database does not
rely on that, and neither does this design.

**What the lock does not protect today: the order of a line's events (probe R2).** The identity value is drawn before
the lock. Writer B forms its row (seq 525) and waits on the line's lock held by writer A, whose earlier event was
flagged (524). A then inserts validated (526) and commits. B wakes, reads the current stage (validated), accepts its
actionable, and commits it with seq 525. Every reader takes the latest event by `seq DESC` (16 sites in 10 TypeScript
files, and `case_rules`, `ledger_line_stage`, `packet_version_*`, `priced_line_deadline_status`,
`case_next_window_deadline_status`), so the line reads as validated, and a second actionable passes the trigger. The
line then holds flagged, actionable, validated, actionable: a duplicate forward event, which invariant 1 forbids.

### 1.3 The defect reproduced

Probes on databases migrated from empty at e908c21 (44 migrations), PostgreSQL 18.4, synthetic lines only (section 15).
- **A1, the failure.** As the worker's login, one `INSERT … SELECT` of 12,000 flagged events succeeds in 0.90 s and its
  transaction then holds 12,000 advisory locks. 20,000 fails: `ERROR: out of shared memory`, `HINT: You might need to
  increase "max_locks_per_transaction"`, at `line_status_rules() line 8 at PERFORM`.
- **A2, another practice's failure.** While practice P1's open transaction holds 13,000 of these locks, practice P2's
  2,000-line insert fails 53200 in 68 ms.
- **R2, the order.** Reproduced as described in 1.2: events flagged@…524, actionable@…525 (committed last),
  validated@…526, then a second actionable accepted.
- **E1, an empty table's statistics.** After `VACUUM` of an emptied `line_status` (reltuples 0), the trigger's cached
  generic plan for the lookup is a sequential scan, and a 100,000-line insert in one transaction did not finish in 9.5
  minutes (the scout saw 7 min 51 s). This happens only while the table's statistics say it is empty (a new
  environment, a test database), but a migration-time `ANALYZE` or `VACUUM` of an empty table is enough to cause it.

---

## 2. The options

Each option is judged on the standing rule's terms. The two that matter most here are reliability (no customer's month
fails, and no practice can make another fail) and the user experience (no person waits on a job they did not start).

| Option | What it does | Verdict |
| --- | --- | --- |
| A. Raise `max_locks_per_transaction` | An RDS parameter | Rejected: the weakest (below) |
| B. Batch triage into transactions of N lines | Each batch commits, so locks are released | Rejected |
| C. One practice lock, taken inside the trigger | `line_status:<practice>` instead of per line | Rejected: deadlocks (probe R3) |
| D. One practice lock taken first by every writer | As C, but each writer locks before touching any row | Rejected: people wait on jobs |
| E. 64 lock buckets per practice, taken first in order (ADR 0060's shape) | Bounded locks, as the 835 loader does | Rejected: D's costs for bulk writers, more parts |
| F. A row lock on `service_line` | `SELECT … FOR NO KEY UPDATE` through a definer helper | Rejected |
| G. Set-based checking in a statement trigger | Check the whole statement's rows at once | Rejected |
| **H. A row lock on a per-line head row** | **`line_status_head`, one row per line, locked by `INSERT … ON CONFLICT DO UPDATE`** | **Recommended** |

**A. The parameter alone is the weakest, for six reasons.**
1. It moves the ceiling, it does not remove it. Locks still grow with the largest practice's month, and two large
   triages, or a triage and a reconcile, add up.
2. The table stays shared by every tenant, so one practice can still make another's work fail (probe A2).
3. Shared memory grows with it: about 400 bytes per slot per connection (the scout measured `shared_memory_size` 150 MB
   at 64 and 202 MB at 1,024), on a 4 GiB instance.
4. It is a static parameter: changing it needs a reboot, so a multi-AZ failover.
5. It does nothing for the order race (R2) or the plan (E1).
6. It does nothing for the ledger's per-row locks.

**B. Batches.** Batching breaks triage's one transaction: a crash between batches leaves lines validated but not
grouped, or a case with part of its lines, visible to people. The report could no longer triage and read in one
transaction (ADR 0038:63-66; `generate.ts:16-18`), so its numbers could mix two triages. Each batch still takes one lock
per line.

**C. A practice lock inside the trigger** takes the lock lazily, at a writer's first stage insert, after the writer may
already hold row locks. The real shapes cross: triage inserts flagged events (`execute.ts:444`), then `closeWindows`
updates case lines and so their case rows (:446); a person's reopen updates a case line, and so its case row
(`triage.ts:522-525`), then inserts its stage (:528). Probe R3 reproduces the cycle with a shared row standing in for the
case row: Postgres detects a deadlock (40P01). Today's per-line lock, and option H, let both finish.

**D. A practice lock taken first by every writer** is correct and is the fastest (probe V1: 14.9 s against today's
15.9 s for 180,000 events). Its costs:
- **People wait on jobs.** A person's reopen, which waits on nothing today, would wait for a whole triage, reconcile or
  audit report. The report holds its transaction while it prints the PDF and stores it (`generate.ts:79-90`); B's
  20,000-line report took 103 s in #49's run. No `lock_timeout` or `statement_timeout` is set anywhere
  (`packages/db/src/connect.ts`), and the load balancer gives up after 180 s (`infra/lib/constructs/edge.ts:35`), so D
  needs a lock timeout, a new refusal and new words.
- **Every writer, present and future, must take it first,** or a deadlock follows. The database cannot check that
  cheaply.
- **Triage and reconcile serialize** for the whole of each.
- It still needs the `seq` fix.

**E. Buckets.** A large triage or reconcile takes all 64 buckets, so it behaves like D for the jobs that matter, with D's
waits and D's rule that every writer locks first, and 64 keys to order. ADR 0060 chose buckets because two loads of
one practice must run side by side. Stage writers do not need that.

**F. A row lock on `service_line`.** Per-line serialization with no lock-table entry (probe V2: 11.6 s, 0 advisory locks),
but:
- it writes the lock into the tuple headers of the practice's immutable PHI table on every stage event. That dirties
  its pages, clears their all-visible bits and creates freeze work;
- pricing a re-run of the same lines inserts `priced_line` rows whose foreign-key checks take `FOR KEY SHARE` on the
  same lines, so a concurrent triage turns each locked line into a multixact;
- `tp_app` has no `UPDATE` on `service_line` ("loaded records never change", `20261016120000_remittances.sql:485-488`),
  so every row needs a definer helper call.

**G. Set-based checking.** A statement-level trigger cannot see its rows before they are written, so it cannot lock
before it reads. Checking after the insert brings back C's lazy lock and the `seq` order problem. The whole trigger
costs about 4 s per 180,000 events against a floor of 11.9 s (probe FLOOR). That is not decisive either way.

**H. A head row per line (recommended).** The head row carries the line's current stage and the `seq` of its latest
event. The trigger writes it first, which takes the line's row lock, and reads the stage it replaced in the same
statement:
- **Reliability.** No lock-table entry per line (probe H2: 180,000 events in one transaction, 0 advisory locks, 40
  lock-table entries, all relation locks). No practice can exhaust the table for another.
- **The same protection, and no new waits.** One writer per line at a time, in the same order (`ORDER BY
  service_line_id`), so the waits and the deadlock-freedom are today's (probe R1, R3).
- **Correct order.** `seq` is drawn after the lock, so a line's events sort in commit order (probe R2).
- **No planner risk.** The lookup is the upsert's arbiter check on the primary key, which the executor does through the
  index, not a planned query. So the empty-statistics plan cannot recur (probe E2: linear, 20.9 s for 180,000 events with
  reltuples 0).
- **No writer changes,** so ADR 0038's one transaction per triage and per report stands, and every future writer is
  covered without remembering anything.
- **Cost.** Probe H2 took 18.6 s against today's 15.9 s for 180,000 events (17%, about 2.7 s), plus one small row per
  line ever staged. The head row is a second copy of "the current stage", kept exact by the only code that writes it
  and proved by CAS-40's property.

---

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | A new practice-scoped table `line_status_head`: one row per line that has any stage event, with the line's current stage and the `seq` of its latest event. Primary key `(practice_id, service_line_id)`. | Option H. The key leads with `practice_id` for the catalog rule (`packages/db/src/catalog.ts:369-370`) and the tenant policy, and it is the upsert's arbiter. |
| D2 | `line_status_rules()` takes the line's lock by writing its head row with one `INSERT … ON CONFLICT (practice_id, service_line_id) DO UPDATE … RETURNING WITH (OLD AS prior, NEW AS next) prior.stage, next.seq`. The `pg_advisory_xact_lock` call is removed. | The upsert waits for any other writer of the line, then locks the row. `prior.stage` is the stage before this event (null for a line's first event), and the checks run against it, unchanged. A refusal raises and undoes the head write with the statement. PostgreSQL 18's `RETURNING OLD` is available everywhere this runs: RDS `VER_18` (`database.ts:127`), the compose and harness images (`postgres:18`), CI. |
| D3 | `NEW.seq` is set from the head row: the identity value the row already drew for a line's first event, and a new `nextval` drawn after the lock otherwise. | A line's first event cannot race an earlier one: any committed or in-flight event of the line holds or waits on the head row, so the insert would conflict instead. Every later event draws its number while it holds the lock, so `seq` follows commit order. |
| D4 | `line_status_rules()` becomes `SECURITY DEFINER`, owned by `tp_owner`, with `SET search_path = pg_catalog, public, pg_temp` and `REVOKE ALL … FROM PUBLIC`. `line_status_head` has no grant to any login role. | The trigger is then the only writer of the head rows, and `nextval` on `line_status_seq_seq` needs no sequence grant (none exist anywhere today). Row-level security still applies to the owner (`FORCE`) and reads the session's `app.practice_ids`, so a head row can only be written in the writer's own practice. Precedent: `line_status_refresh_cases` (`20261023090000:837-845`). |
| D5 | No foreign keys on `line_status_head`. | The `line_status` row the trigger is checking carries the same references (`practice`, `service_line`) and is checked in the same statement, and `line_status_belongs` checks the line's practice. The two extra checks cost 3.9 s per 180,000 events (probe H1 22.4 s against H2 18.6 s). What the head row must satisfy is "equals the line's latest event", which a foreign key cannot express. CAS-40's property and a catalog-level consistency test check it. |
| D6 | `line_status_head` has `line_status`'s guards: `never_deleted` and `no_truncate` triggers, forced row-level security with the tenant policy, and a registry row (so the cross-tenant tests cover it). | It is part of the stage log's state, and its rows go only with the log's. |
| D7 | No writer's code changes for locking. Triage, the report, opening a case, reconcile, manual ledger work and the reopen keep their transactions, their outer locks (`triage:`, `ledger:`) and their statements. | The per-line protection moves inside the database, unchanged in grain. ADR 0038:63-66 ("an advisory lock per practice") stays true. |
| D8 | Under Q1 (a ledger freeze exception): `ledger_entry_within_evidence()` and `ledger_entry_within_line()` take `pg_advisory_xact_lock(hashtextextended('ledger:' \|\| NEW.practice_id::text, 0))`, the same key `lockLedger` takes (`reconcile/ledger.ts:16-18`), instead of one key per evidence row and per line. Nothing else in either body changes. | Every `ledger_entry` insert runs after `lockLedger`: the reconcile pass (`pass.ts:39`) and each manual action's first statement (`manual.ts:46-50`, called at :71, :101, :136, :178, :229). There is no SQL writer of `ledger_entry`. Re-taking a lock the transaction holds adds no lock-table entry and cannot deadlock. The trigger still serializes any writer that forgets `lockLedger`, at a coarser grain. |
| D9 | `max_locks_per_transaction` stays at its default (64), in RDS, CI and the harness. | Option A. The tests instead prove a per-transaction bound that does not depend on it. |
| D10 | The release-capacity run gains three checks: a measured job must complete on its first attempt; no backend holds more than 64 advisory locks at any sample over the run (`TRACE_LOCK_BUCKETS`, the loader's bound); the chain phase's memory is sampled and reported for A's triage and A's report separately. Under Q1 it also gains a reconcile phase. | Today a 53200 that a retry survived would pass, the lock count is not measured, and the status file attributed the run's 803.9 MiB peak to pricing although the concurrent phase, where pricing ran, peaked at 556.7 MiB. |
| D11 | The stored per-content windows stay with #8. | `releaseContentWindows` (`apps/worker/src/price/release.ts:274-291`) aggregates `rule_record`. Its callers are the web's Content through (`apps/web/src/lib/releases/content-through.ts:87`, :90), the price job (`price/execute.ts:389`) and the harness. Triage reads `rule_release_content_span()` (`release.ts:148`, via `execute.ts:261`). It shares nothing with this item's locks or tables. |

---

## 4. Schema: one migration, `20261109090000_line_status_heads.sql`

It comes after #42's `20261107090000_mail_streams.sql` and SS-01's `20261108090000_suspension_refusal.sql`. The builders
take the next free timestamp at the time. Like every migration, it runs in one transaction as `tp_owner`
(`packages/db/src/migrate.ts:116-126`).

**#42 and SS-01 overlap: none.** #42's migration creates or replaces only mail, dunning, support and screening
functions and `operator_due_support_notices`. SS-01's replaces the suspension functions and triggers. Neither touches
`line_status`, `line_status_rules`, `ledger_entry_within_*`, `case_line` or any triage function (re-checked at #42's
head 098636e3 and in `designs/ss-01-suspension.md` section 4). So this migration recreates no function from either
body. The builders re-check at both PRs' final merged heads before writing.

### 4.1 Preflight

The migration begins by asserting the bodies it replaces are the ones this design read, so a later edit elsewhere
cannot be silently overwritten: `line_status_rules()`'s definition contains `'line_status:' || NEW.service_line_id`, and
(under Q1) the two ledger functions contain `'ledger_evidence:' || row_id` and `'ledger_line:' || NEW.service_line_id`.
Otherwise it raises and nothing applies.

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

The lock stops the running image's stage writes for the length of the backfill (no customer data exists before launch;
a DISTINCT ON over a million events takes about a second), so no event can land between the backfill and the new
trigger. The scope setting follows the house precedent for a backfill under forced row-level security
(`20261101090000_billing_review.sql:49-51`), with every practice, deleted ones included.

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
- The `RETURNING` aliases are needed: in PL/pgSQL, bare `old` and `new` are the trigger's own records (the probe's
  first version failed with "column reference "old.stage" is ambiguous").
- The four refusals and their messages are unchanged, byte for byte (section 6).
- A refused event raises after the head row was written. The exception undoes the write with the statement, or with
  the caller's savepoint.
- The trigger keeps its name and timing (`BEFORE INSERT OR UPDATE … FOR EACH ROW`), so `line_status_ledger_rules` still
  fires first and the AFTER triggers are untouched.
- The sequence is named by `regclass`. A test asserts `pg_get_serial_sequence('line_status', 'seq')` is
  `public.line_status_seq_seq`, so a renamed sequence fails a test, not production.

### 4.4 The ledger triggers (only under Q1; on `20261027090000:147-201` and :219-270)

`CREATE OR REPLACE FUNCTION ledger_entry_within_evidence()` and `ledger_entry_within_line()`, each a copy of its
20261027090000 body with one line changed:
- :172 `PERFORM pg_advisory_xact_lock(hashtextextended('ledger_evidence:' || row_id::text, 0));` becomes
  `PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));`
- :246 `PERFORM pg_advisory_xact_lock(hashtextextended('ledger_line:' || NEW.service_line_id::text, 0));` becomes the
  same `ledger:` line.

Each gets a one-line comment naming ADR 0083 and the exception. Both stay invokers, keep `SET search_path`, and keep
`REVOKE ALL … FROM PUBLIC` as before. A db test diffs each new body against 20261027090000's, modulo the lock line and
the comment.

### 4.5 Grants, exactly

- `line_status_head`: `REVOKE ALL … FROM PUBLIC`; no grant to `tp_app`, `tp_operator`, `tp_billing`, `tp_esign`,
  `tp_screening` or `tp_job`. Owned by `tp_owner`.
- `line_status_rules()`: owned by `tp_owner`, `SECURITY DEFINER`, `REVOKE ALL … FROM PUBLIC`, no `EXECUTE` grant (a
  trigger function needs none to fire).
- `line_status`: grants unchanged (`20261019160000:712-716`).
- No sequence grant.
- Under Q1, the two ledger functions: unchanged ownership and grants.

### 4.6 Safe with the previous image running, and on rollback

| The previous image does | On the new schema |
| --- | --- |
| Inserts stage events (triage, report, open case, reconcile, manual ledger, reopen) | The same statements, the same refusals and messages; the head row is written inside the trigger. During the backfill's seconds, inserts wait on the table lock, then proceed. |
| Reads the current stage by `seq DESC` (16 sites) | Unchanged, and now right under concurrency. |
| Inserts ledger entries (under Q1) | The same; the trigger re-takes the `ledger:` lock the writer holds. |

Rollback is the previous image on this schema (ADR 0009:42-43), the table above: nothing in the application depends on
the new table. Migrations are forward-only. If the trigger itself had to be undone, a later migration restores
20261023120000's body, and the head table can stay, unused, since it is derivable. The dry run, forward, is the house
check (ADR 0009:37-43).

---

## 5. Application changes

**No mutation changes, and none is added.** Every mutation that writes a stage keeps its Zod schema, its role check,
its practice-scoped transaction (`SET LOCAL app.practice_ids, app.actor_id`) and its audit event:
- the reopen route: `reopenLineAction`, permission `case.work`, input `z.object({ caseLineId: opaqueId, reason:
  requiredText(500) })`, audit `case_line_reopened` (`apps/web/src/lib/routes/triage.ts:503-538`);
- the triage action: `triageRunAction` only enqueues (:435-449);
- the workbench's open-case route → `openCaseOnPattern`;
- the manual ledger actions → `manual.ts`, each checking its permission in `begin` (:46-50).

The check stays in both places: the handler checks the role and the line's state, and Postgres checks the stage rules,
now with a lock that holds at any size.

**What the application PR does change:**
1. **The release-capacity harness** (D10), in `tools/release-capacity`:
   - `run.ts`: `jobOutcome` (:228-240) also reads `pgboss.job.retry_count`. The chain's `waitForJobs` gets a tick that
     samples `memory.current` each second for A's triage and for A's report separately. A sampler reads the largest
     advisory-lock count held by any one backend each second, over the whole run: `SELECT coalesce(max(n), 0) FROM
     (SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' GROUP BY pid) x`.
   - `checks.ts`: three new failing checks: a measured job completed on attempt N > 1; a backend held more than
     `ADVISORY_LOCKS_PER_TRANSACTION` (64, the value of `TRACE_LOCK_BUCKETS`, imported, not copied); and the chain
     peaks above 90%, reported with each job. The summary's table gains an "Attempts" column and the memory line names
     the triage and report peaks.
   - Under Q1, `scenario.ts` and `run.ts` add step 7b, "A's reconcile": a SYNTHETIC posting export that posts every one
     of A's actionable lines at its expected amount (`packages/synth/src/formats` writes it), uploaded through intake,
     parsed, and reconciled by the reconcile job, measured like the chain.
   - `checks.test.ts`: each new rule, failing and passing.
2. **`docs/runbooks/screening-capacity.md`** ("Release capacity" section, where #49 documented the weekly run): the new
   checks, and how to read a lock-count failure.
3. **No change to triage's or the report's code.** The probe ran the job code as it is, at 100,000 lines, within the
   worker's limits (section 8.3).

---

## 6. Every sentence a person reads, word for word

**None changes, and none is added.** No page, notice, email, PDF or job message changes. These are the sentences this
change runs through, kept byte for byte. The database raises them as 23514, and the web shows them as the reopen form's
error (`apps/web/src/lib/http/invoke.ts:317-321`):
- "line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason"
- "a reopen names the stage the line is at"
- "a reopen keeps the line at its stage or moves it back; moving forward is not a reopen"
- "a reopen is a person's explicit action"
- "a line's stage events never change; a reopen is a new event"

Under Q1 the ledger's messages ("the posted or deposited entries of a posting or EFT row never sum past the row's
amount", and the others in the two bodies) are unchanged too.

What people stop seeing, because the cause is gone: for a large month, the practice home's failed-job notice for
triage (`apps/web/src/app/p/[practiceId]/page.tsx:43-56`) and the report's "failed three times" state
(`apps/web/src/lib/reports/queries.ts:61-69`). Their words do not change.

Brand rules (CO-11, BRAND.md) are therefore untouched. The words this PR adds are documents, not product copy: ADR
0083, the migration's comments, the domain model's rows and the runbook paragraph, all in the house style.

---
