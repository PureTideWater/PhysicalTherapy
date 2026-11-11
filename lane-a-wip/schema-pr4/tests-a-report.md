# Tests A (items 1, 2, 5) report

File: /home/user/pr4/packages/db/src/payer-response-db-mirrors.db.test.ts (26 tests, vitest project db, PostgreSQL 18 on 5433).

## Result by state
- Final run, with migration 20261114090000_payer_response_document_rules.sql present in the worktree: 26 passed, 0 failed.
- Pre-migration run (migration absent, my second run, before the setup fixes): 24 failed. Failures were the right reasons: column filed_for_submission_id does not exist (42703), indexes absent, window_passed write-off "accepted" instead of refused. The two that passed were the unlinked-document and no-row-for-caller tests. After that run I fixed setup (priced_line CHECKs, submission actor, payer_response fixture) and did NOT re-run against a migration-less tree, so the item-1 "passes-today" split (ended window, other reasons, triage strike, own name) is not observed pre-migration after the fix. It holds by reading case_line_rules.sql.

## Tests and expected pre-migration outcome
Item 1 (case_line_rules):
1. refuses a person on a window with no end date -> expected-fail (write-off accepted)
2. refuses a person on a window that ends today (UTC) -> expected-fail
3. refuses a person on a window that ends tomorrow / far ahead -> expected-fail
4. records a person's window_passed once window ended yesterday / 30 days ago -> passes-today
5. leaves a person's other reasons alone -> passes-today
6. unchanged refusals (wrong name 42501; triage strikes ended window; refused on open window) -> passes-today
Item 5 (column, rules): column/FK/index; tp_app INSERT yes UPDATE no; records filed letter; no-link documents unchanged (passes-today); non-letter kinds refused; analyst/no-role refused 42501; other person's name; job refused; other practice's submission; earlier vs later submission; zip entry inherits; zip entry mismatch/unlinked zip; never changes (tp_app 42501, owner 23514, clear, set-late); other updates of linked doc unchanged; contract_version refuses filed letter (and accepts unlinked one). All expected-fail pre-migration except the unlinked-document test (passes-today).
Item 2: documents_awaiting counts / excludes response letter / excludes filed letter; other practice's count; no row without platform permission (passes-today); scope restored (passes-today); index payer_response_by_document definition.

## Helpers reused
- documents.db.test.ts:54 asApp pattern (set_config actor/practice_ids, rollback), :66 INSERT shape; documents.db.test.ts:122-142 job scope idea (a non-user actor id is a job).
- line-status.db.test.ts:84 settle-style failure capture (own copy); internal-org specialist per identity.db.test.ts:39.
- testing.ts exports (createMigratedDatabase, createTenantWorld, createUser, addMembership, createOrganization, asOwner, RowFactory) and row-factory.ts: factory 'case_line', 'submission', 'contract'.
- Superuser with session_replication_role = replica to force state, as document-use-rules.db.test.ts:140 does.

## Not tested / limits
- Item 1 INSERT path (design P1: not taken) and triage insert untouched.
- Console EXPLAIN index use is not asserted (index definition only).
- Cross-tenant via console function's SECURITY DEFINER count asserted only by per-practice counts.
- Items 3, 4 (payer_response trigger, response-letter rule, races) belong to document-use-rules.db.test.ts.

## Contradictions / facts about the existing schema
- No name in the spec was missing: kinds payer_letter, permissions submission.log, contract.review (contract_specialist, internal org), case_latest_submission all exist.
- Harness needs PostgreSQL 18 (migration 20261109090000 uses RETURNING WITH (OLD/NEW)); 16 on 5432 fails to migrate.
- priced_line is immutable and has CHECKs: a window requires a priced line (priced_line_unpriced_amounts, priced_line_priced_amounts need method, observed and variance). The factory's priced line is unpriced, so tests rewrite it with triggers off.
- RowFactory 'payer_response' no longer builds once the migration is applied (its factory document is not a clean stored payer letter); the test inserts a response by hand. The factory needs extending (a non-test file; not touched).
- A job cannot insert a top-level source_document today (RLS/trigger 42501, documents.db.test.ts:128). The worker's zip-entry insert runs as a job in practice scope (withJobScope, documents.db.test.ts:127); my zip-entry test inserts under a person's actor, not as the worker's role, so the worker-login path itself is untested here.
- Cleanup note: the submission-copy fixture (laterSubmission) uses to_jsonb copy with later created_at; it relies on case_latest_submission ordering by created_at.
