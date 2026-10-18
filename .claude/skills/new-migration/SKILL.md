---
name: new-migration
description: Create a forward-only SQL migration with its RLS policy, catalog registration and cross-tenant test update.
argument-hint: "[short-name]"
disable-model-invocation: true
allowed-tools: Read Write Edit Bash(pnpm db:*) Bash(pnpm test:db)
---
Create packages/db/migrations/<timestamp>_$0.sql with the marker set and removed in a trap. Every new PHI table
gets practice_id uuid not null, a policy on current_setting('app.practice_ids')::uuid[], ENABLE and FORCE ROW
LEVEL SECURITY, and a row in the PHI table registry. Global tables get a REVOKE INSERT, UPDATE, DELETE from the
app role. Update the Drizzle schema. Run pnpm db:migrate locally, then pnpm test:db. Report tables touched and
whether the migration is safe with the previous image running (add, backfill, remove).
