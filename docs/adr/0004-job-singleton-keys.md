# 0004. Key every job by type, practice and subject, on exclusive pg-boss queues with three attempts

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (one practice per job), 10 (parse idempotency and attempts), 15 (singleton keys per practice and job type), test matrix JOB-01 and JOB-02

## Context

The plan asks for pg-boss jobs "with singleton keys per practice and job type", one practice per job, parse
jobs keyed by the document ID, replayed jobs with no duplicate effects (JOB-01), and three failures before an
alert (JOB-02; section 10: "parsed at most three times"). A key of only practice and job type would collapse a
500-file upload into one parse job; a key of only the document would not be scoped to the practice.

## Decision

- Each job type (`parse_835`, `price`, `triage`, `reconcile`, `digest`, `export`) is its own queue, created
  with the `exclusive` policy: at most one job per singleton key is queued or active.
- The singleton key is `<job type>:<practice_id>:<subject>`, where the subject is the job's idempotency key:
  the document for `parse_835` and `reconcile`, the pricing run for `price` and `triage`, the month for
  `digest`, the export job for `export` (`apps/worker/src/jobs/registry.ts`). A replayed request while the
  first is queued or active is refused (`send` returns null); a test against PostgreSQL proves it.
- Payloads are strict Zod objects of opaque UUIDs (and the digest month): no other field can ride along, so no
  name, date of birth, member ID, claim number or document text can enter a job payload.
- Queues allow three attempts in all (`retryLimit: 2`) with exponential backoff from 30 seconds. The alert on
  the third failure arrives with the job's real handler.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Key `<job type>:<practice_id>` on a `singleton` queue | Serializes each practice's work, but two uploads of different files would share a key and a replay would still queue twice |
| `retryLimit: 3` | Four attempts; section 10 and JOB-02 both count three |
| Deterministic job IDs instead of singleton keys | Also deduplicates, but the plan names singleton keys and the data dictionary stores `singleton_key` |

## Consequences

- Handlers must still be idempotent after completion (a re-sent job with the same key after the first finished
  runs again); parse is idempotent by document hash and remittance key, by design.
- Work for one practice can run in parallel across subjects; anything that must serialize per practice adds a
  lock in its handler.
- pg-boss installs and migrates its own `pgboss` schema on start. The application role owns nothing, so
  milestone 1 decides which role owns that schema and how its migrations run before the worker starts.
