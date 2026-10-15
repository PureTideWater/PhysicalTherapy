# 0014. Keep the audit log append-only with codes only, copy it nightly to write-once storage, drill restores monthly, and state retention as metadata

- **Status:** accepted
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
(`OPERATOR_DATABASE_URL`, a login that can `SET ROLE tp_owner`, ADR 0009's "worker job with an owner-capable
connection"); a worker without it runs no platform job. In AWS that login is `tp_owner_login` (ADR 0012), which the
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

- PRD 16's "alarms on failure" rides on the job's three attempts and the operator alert (JOB-02) when the job tables
  land; the evidence row exists for every attempt.
- The CI database is PostgreSQL 18 while the runner's client tools may be older; the pg_dump drill test then skips and
  says why, and the drill's own logic is still tested with restorers that hand over prepared copies. Installing
  version-18 client tools in CI (a change to `ci.yml`, which is the plan's verbatim configuration) makes it run there.
- pg-boss's own schema ownership (ADR 0004's open question) is still unsettled; the platform queues use the same
  pg-boss as every other queue.

## Revisit when

Counsel and the first customers settle the retention schedule (PRD 20), the first audit rows approach seven years,
the compute lands (milestone 11, where the operator login is granted), or deletion lands (milestone 12).
