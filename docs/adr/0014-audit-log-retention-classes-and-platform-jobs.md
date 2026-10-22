# 0014. Keep the audit log append-only with codes only, copy it nightly to write-once storage, drill restores monthly, and state retention as metadata

- **Status:** accepted; amended by [0019](0019-close-the-standing-access-paths-and-run-platform-jobs-as-an-operator-role.md),
  and by PR 6b-3 (below: the free screening's pricing leaves the platform jobs for its own consumer)
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 6 (audit log, data lifecycle, observability), 8 (audit_event), 15 (files), 16 (audit log, backups
  and restore, logging discipline), 19 (runbooks: restore drill, job failure; data lifecycle); Data dictionary,
  Operations; test matrix SEC-07, SEC-08, SEC-10, SEC-13; ADRs 0004, 0009 and 0012

## Context

The plan asks for an append-only `audit_event` with "actor, action, object, practice, grant, purpose, request ID",
PHI reads logged through a query wrapper, a nightly copy to S3 Object Lock, a monthly restore of the latest snapshot to
a scratch instance with row counts and the catalog test recorded as evidence, and retention of seven years for
packets and audit logs and the contract term plus six years for remittances, claims, lines and ledger entries. The
milestone 1 prompt revisits retention here. Two of these are platform work, not one practice's work, while every
practice job runs for exactly one practice (ADR 0004, SEC-06).

## Decision

**audit_event holds codes and opaque IDs only.** `action`, `object_type` and `purpose` are lowercase codes, `request_id`
an opaque token, every ID a UUID; a read must state its purpose. So no free text, and no PHI, can be written to it.
`grant_id` names the grant or support grant the access rested on (null for ownership). The application role may only
INSERT (for its own transaction's actor, inside its scope) and SELECT (a practice's administrators read its access log
inside its scope); it holds no UPDATE, DELETE or TRUNCATE. Triggers refuse UPDATE, DELETE and TRUNCATE for every role,
superusers included; the owner also has no UPDATE or DELETE policy, so its attempts match no row. `at` is set by the
database (`now()`), never by the application. `readWithAudit()` runs the read and records one event per returned
object in the same transaction, so an aborted request delivers nothing unaudited; "who read claim X" is one query on
`(object_type, object_id)`.

**Platform jobs.** `audit_copy` and `restore_drill` are their own pg-boss queues (`apps/worker/src/jobs/platform.ts`),
with payloads that carry no practice (`audit_copy` an optional day; the drill nothing), the shared three-attempt queue
options (a failing drill fails its job, so the third failure alerts like any other), and UTC schedules: the copy at
01:20 nightly, the drill at 06:00 on the first Monday of each month (an RRULE, as the runbook states it). They read no
PHI: the copy reads `audit_event`; the drill counts rows on a scratch copy. They run on an operator connection
(`OPERATOR_DATABASE_URL`; since ADR 0019 every platform transaction runs as `tp_operator`, a role that owns nothing,
reads the audit log and calls the notice functions, and the owner login is used only on the restore drill's scratch
copy); a worker without it runs no platform job. Before ADR 0019 that login was `tp_owner_login` (ADR 0012), which the
application task role cannot read, so the platform jobs run where that secret is granted (the compute of milestone 11).

**Audit copy.** One object per closed UTC day, `audit-events/v1/<yyyy>/<mm>/<dd>.jsonl` (opaque, passes the SEC-08 key
check), JSON lines in a fixed column order sorted by `at, id`, read in one repeatable-read snapshot through the owner's
read policy. An empty day writes an empty object, so every day is accounted for. The store is write-once: the same
bytes again is "unchanged" (the job is idempotent per day), different bytes under an existing key are refused (the
tamper alarm). Production writes S3 with Object Lock in COMPLIANCE mode, the SHA-256 checked by S3 and kept as
metadata, `If-None-Match: *`, and the bucket's default SSE-KMS key; staging and dev use GOVERNANCE (ADR 0012).
Development uses a file-system store with the same rules.

**Restore drill.** Behind `SnapshotRestorer`: `RdsSnapshotRestorer` restores the source instance's newest available
automated snapshot to a single-AZ, private scratch instance, waits for it and deletes it after (no final snapshot);
`PgDumpRestorer` takes a `pg_dump` of the source now (the local "latest snapshot") and `pg_restore`s it into a scratch
database, then drops both. The drill counts every table's rows as the owner with every practice in scope (exact
without a role that bypasses row-level security), runs `catalogProblems()` on the copy, writes a `restore_drill`
evidence row (snapshot, target, start, end, duration, outcome, counts, catalog problems, error code) to the source in
every outcome, and fails the job unless the catalog test passed and migrations were restored. `pg_dump` refuses a
server newer than itself, so the local restorer checks the client tools' major version first (`PG_BIN_DIR` selects
them); the database test of the pg_dump path skips with that reason where the tools are older than the server.

**Retention classes** (`packages/db/src/retention.ts`): `records` (remittances, claims, lines, ledger entries, and the
source documents and model-call logs kept with them) for the contract term plus six years; `packets` and `audit`
seven years from creation, write-once; `backups` 35 days. `retainUntil()` computes the date in UTC; the audit copy
uses it (day end plus seven years), and the intake and deletion workflows will read the same table.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A SECURITY DEFINER function the application role calls for the nightly copy | Any application code could then read every practice's access log |
| Copying from a log stream instead of the table | A second source of truth for the same events; the table is the record and the copy proves it |
| Overwriting a day's object on re-run | Defeats write-once; identical bytes make the re-run a no-op instead |
| A per-day copy table in the database | The store answers "already copied" by the object and its hash; a table would duplicate it |
| Seven years of audit rows deleted by a job now | The plan's seven years have not elapsed for any row; a partition-drop or exception path is designed when the first rows age out |

## Consequences

- PRD 16's "alarms on failure": since ADR 0019 a job's third failed attempt logs a line the worker log group's metric
  filter counts, and its alarm tells the operator (JOB-02). Before that, the alert waited for the job tables
  land; the evidence row exists for every attempt.
- The CI database is PostgreSQL 18 while the runner's client tools may be older; the pg_dump drill test then skips and
  says why, and the drill's own logic is still tested with restorers that hand over prepared copies. Installing
  version-18 client tools in CI (a change to `ci.yml`, which is the plan's verbatim configuration) makes it run there.
- pg-boss's own schema ownership (ADR 0004's open question) is still unsettled; the platform queues use the same
  pg-boss as every other queue.

## Revisit when

Counsel and the first customers settle the retention schedule (PRD 20), the first audit rows approach seven years,
the compute lands (milestone 11, where the operator login is granted), or deletion lands (milestone 12).

## Amendment (PR 6b-3, 2026-10-21): the free screening's pricing leaves the platform jobs

Audit #53 parts 3 and 4 (decisions 13 to 16), built under the founder's answers of 2026-10-21 (about 22:30 UTC) to
PR 6b's Q1 and Q7; docs/adr/0062 records the consumer and the time check, 0019 its role and login.

- **`screening_price` is no longer a platform job.** It leaves `PLATFORM_JOB_TYPES`, its payload and its minute
  schedule (`apps/worker/src/jobs/platform.ts`) and becomes one of the screening consumer's two jobs
  (`apps/worker/src/jobs/screening.ts`): `screening_price`, one run by its opaque ID (the web sends it once the upload
  is stored, at the run's priority), and `screening_sweep`, every minute. The queue keeps its name, so jobs queued
  before a deploy move to the consumer with no copy and no loss. `screening_expiry` stays a platform job, as
  `tp_operator`.
- **Its own service (Q1 (a)).** The consumer is the worker image with `WORKER_JOBS=screening`: one always-on task of
  2 vCPU and 4 GiB pricing three screenings at once, each in its own worker thread, about $74.50 a month per
  environment; production's is held at 0 until launch and staging's is always on (Q1 (b), (c)). Its main thread holds
  pg-boss, the jobs' heartbeats, the worker's heartbeat and the sweep, and prices nothing. Every worker still creates
  the screening queues (now with the 60-second job heartbeat, `SCREENING_QUEUE_OPTIONS`), so the web's send never
  meets a missing queue; the consumer also sets the heartbeat on a queue that already existed (`updateQueue`, since
  `createQueue` leaves it as it was) and removes the platform's old minute schedule of `screening_price` (a schedule
  fired before then runs the sweep).
- **The sweep sends, it does not price (Q7).** It fails a stale run out of attempts and sends each due run's job again
  with its singleton key, its priority and the heartbeat (the exclusive policy refuses a duplicate), so every pricing
  goes through pg-boss's order (the normal tier first, then an account's uploads past its share at -k and the day's
  uploads past its cap at -1) and the consumer's three slots. It logs the queue's gauge (`screening queue`).
- **The same failure rules.** A screening job's third failed attempt logs `job failed on its last attempt`, as every
  job's; a run whose thread fails it fails its job with fixed text, never the error's. The consumer's graceful stop
  waits 110 seconds for the runs in hand, under its service's 120-second stop timeout.

