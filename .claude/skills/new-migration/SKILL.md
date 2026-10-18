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

Regenerate docs/product/domain-model.md in the same pull request (pnpm db:domain-model --out --strict on a freshly
migrated database) and open the pull request's description with the output of
`pnpm -s db:domain-model --summary-since origin/<base branch>` (docs/adr/0063). Never write the "Approved by:" line:
post the line `--check --require-approval` names (the founder's name, the date, the hash) as a suggested change for
the founder to commit, and ask for their review of that commit (docs/runbooks/github-governance.md, step 6).
