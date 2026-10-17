# Restore drill

Trigger: the first Monday of each month, 06:00 UTC (PRD 19 Runbooks; PRD 16 Backups and restore). The platform service
runs it as the `restore_drill` job (`apps/worker/src/platform/restore-drill.ts`; ADR 0014 and 0019); this runbook is
for checking it, and for running it by hand when it failed.

## What the job does

1. Finds the source instance's newest automated snapshot and restores it to the one scratch instance
   (`tp-<env>-restore-drill`, the `RestoreDrillInstanceId` output), in the data subnets, under the environment key.
2. Connects to the copy and, as its owner role with every practice in scope, counts every table's rows and runs the
   catalog test (`catalogProblems`). Nothing but counts is read.
3. Writes the evidence row (`restore_drill`: snapshot, target, duration, row counts, catalog result, outcome) on the
   source as the operator role, and deletes the scratch instance.

A failed attempt is retried; the third failure alerts the operator (ADR 0019), and the readiness checklist's Backups and
restore control stays short of ready until a drill within 35 days has passed.

## Checking a run

- The platform log group shows `restore drill passed` with its `restore_drill_id`, or `restore drill failed` with an
  `error_code`.
- The console's readiness checklist (`/console/compliance`) shows the latest drill, its date and outcome.
- The scratch instance no longer exists (`aws rds describe-db-instances --db-instance-identifier tp-<env>-restore-drill`
  answers that it was not found). If it still exists after a failure, delete it before the next run, since a restore to
  an identifier in use fails (`aws rds delete-db-instance --db-instance-identifier tp-<env>-restore-drill
  --skip-final-snapshot --delete-automated-backups`).

## When it failed

1. Read the `error_code` in the platform log group or the evidence row (never a row's contents: the job logs none).
2. `RESTORE_FAILED`: the snapshot could not be restored. Check the source's automated backups are on (35 days) and that
   the operator role's restore permissions match the template (`infra/test/operator-role.test.ts`).
3. `VERIFY_FAILED` (the copy could not be counted), `NO_MIGRATIONS_RESTORED` (the copy has no applied migrations) or
   `CATALOG_FAILED` (the catalog test found problems on the copy): treat it as an incident until explained
   (docs/runbooks/incident-response.md); a backup that does not hold the live database's controls is not a backup.
4. `DESTROY_FAILED`: the copy was verified but not deleted. Delete the scratch instance (above) and confirm it is gone.
5. Once the cause is fixed, the next scheduled run is the retry; if the month's drill cannot wait, run the platform task
   once with the same image and settings (an ECS run-task of the platform task definition) and record why.
6. Record what happened and the result in the readiness checklist's records.

## Locally

`pnpm dev` runs the same job against a pg_dump and pg_restore copy (PgDumpRestorer) on the local server; the database
suite (`apps/worker/src/platform/restore-drill.db.test.ts`) proves the job end to end on synthetic data.
