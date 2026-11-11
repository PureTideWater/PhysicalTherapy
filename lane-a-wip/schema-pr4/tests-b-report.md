# Tests B: document-use rules (items 3 and 4, races)

File: /home/user/pr4/packages/db/src/document-use-rules.db.test.ts (uncommitted; typechecks clean under packages/db tsc).

## Run result: NOT RUN against a database (environment blocker)
`createMigratedDatabase` fails in beforeAll on the existing migration 20261109090000_line_status_heads.sql: `syntax error at or near "WITH"`
(line 166: `RETURNING WITH (OLD AS prior, NEW AS next)` is PostgreSQL 18 syntax). The sandbox has only PostgreSQL 16.15 (/usr/lib/postgresql/16).
So all 28 tests are skipped, and every existing db test would fail the same way here. I did not touch the migration. No per-test failing-first
result exists; the predictions below are from reading the current function text, not from a run. Needs a PG18 run to confirm.

## Tests (28) and predicted result on today's schema
Item 3 (payer_response_belongs):
- refuses a document of another practice: passes-today for the code but NOT the message (today 'a payer response's document is a document of its practice'); expected-fail (message)
- refuses a zip entry: expected-fail
- refuses a document of kind x12_835 / era_export / contract / exhibit / posting_export / eft_export (6 tests, generated from DOCUMENT_KINDS): expected-fail
- refuses a document whose scan is not clean: expected-fail
- refuses a document that is not stored: expected-fail
- refuses a document a {draft, proposed, approved, signed_off, superseded} contract version names (5 tests, from VERSION_STATUSES): expected-fail. Built with session_replication_role = replica (superuser) because the later rules make these states hard to reach.
- records a clean, stored payer letter; records an other document; records one letter named by two responses; no document at REPEATABLE READ is not refused: passes-today
- refuses a response naming a document at REPEATABLE READ: expected-fail (today accepted)
Item 4:
- refuses a version naming a response's letter on insert: expected-fail
- refuses a terms change of a draft naming a response's letter: expected-fail
- still passes a version naming an unrelated clean payer letter: passes-today
- is volatile: expected-fail (today 's', sql)
- keeps its grants (tp_app and tp_owner EXECUTE, PUBLIC none): passes-today
- refuses an insert of a version at REPEATABLE READ: expected-fail
Races:
- response waits for an uncommitted version, then refused: expected-fail (today no wait; the poll for an ungranted advisory lock times out after 15 s, which is a failure for the right reason but slow)
- version waits for an uncommitted response, then refused: expected-fail (same)

## Helpers reused
- createMigratedDatabase, createTenantWorld, createUser, addMembership, asOwner, endPool from packages/db/src/testing.ts (imports as in packages/db/src/documents.db.test.ts:12; setup pattern documents.db.test.ts:34-45)
- RowFactory.load / factory.create(owner, 'submission'|'contract', world): packages/db/src/row-factory.ts:488, :565; usage pattern line-status.db.test.ts:205
- source_document insert shape: apps/web/src/lib/routes/workbench-routes.db.test.ts:241-275 (documentOf)
- payer_response / contract_version insert SQL: workbench-routes.db.test.ts:1185, 1199
- superuser replica-role insert: workbench-routes.db.test.ts:213-223
- own-connection transaction with pid: pattern of line-status.db.test.ts:72-125 (waiting check there is pg_stat_activity; mine is pg_locks as asked)

## Not tested / caveats
- The "filed for a submission" half of item 4 (other file, as instructed).
- Unverified guesses until a PG18 run: the manager (billing_manager) holds submission.log; a factory-built submission is its case's latest and its submitted_on is not after today; a zip entry's insert under owner role with the manager as uploader passes source_document_rules; the factory 'contract' row works for the contract_version insert (its version_no 1 is fresh per contract).
- Statements run as tp_owner (SET LOCAL ROLE), as the web race test does, not as tp_app; the triggers are not role-dependent but the app role's grants are not exercised here.
- The races hold both transactions as owner role with the manager as actor; connection 2 is rolled back after refusal (its transaction is aborted).
- SQLSTATE of the other-practice refusal is asserted as 23514 with the new single message; for another practice's document the existing check fires first today with a different message, so the new migration must reorder or merge it (the design says "one message").

## Contradictions with the spec
- None found in names: DOCUMENT_KINDS has payer_letter and other; scan_status has 'clean'; status 'stored' exists; VERSION_STATUSES = draft, proposed, approved, signed_off, superseded (five, all used).
- Design section 1 item 3 says "after the existing checks": the existing other-practice check has its own message, so a different message from the one-message claim unless merged. See caveat above.
- Environment: migration 20261109090000 needs PostgreSQL 18 but PostgreSQL 16 is what the sandbox provides, so nothing db-side runs here.
