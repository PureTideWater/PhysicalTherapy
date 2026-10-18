---
paths:
  - "packages/db/**"
  - "apps/**"
---
# Privacy and tenancy
- Every PHI table: practice_id uuid not null, a policy on current_setting('app.practice_ids')::uuid[],
  ENABLE and FORCE ROW LEVEL SECURITY. Global tables (rule_release, rule_record, code lists) have no practice_id
  and are read-only to the app role. The catalog test lists exceptions; there are none.
- Transactions: SET LOCAL app.practice_ids and app.actor_id at the start; one practice per job.
- audit_event is append-only; triggers reject UPDATE and DELETE; PHI reads go through readWithAudit().
- Logs use the allowlist in packages/observability/fields.ts. pnpm lint:logs must pass.
- Responses that carry PHI set Cache-Control: private, no-store.
- Identifiers never appear in URLs, S3 keys, filenames, emails, job payloads or thrown errors.
