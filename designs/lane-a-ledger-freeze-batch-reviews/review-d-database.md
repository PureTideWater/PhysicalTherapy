# Review D (database): schema PR 5, ledger-freeze batch

Branch co-001/ledger-freeze-batch at e2a56dc3, base 1f652b6f. I changed no files. Probes ran in the scratch database rd_d (all migrations to HEAD, applied through `pnpm db:migrate`), which I dropped afterwards. All rows were synthetic.
I make no compliance claim.

## Findings

No BLOCKER. No MAJOR. I found no fault in either granted text (nothing is marked NEEDS GRANT/MIGRATION).

### MINOR-1: the "5-minute limit" is a target, not an enforced bound, and a retry reruns the whole scan
- Where: migration:44-48 and the runbook section "How long".
- Claim: no code enforces 5 minutes.
  - migrate.ts:79-81 sets lock_timeout 2 s, 20 attempts and a 30 min budget, and the budget covers lock retries only.
  - The runbook says the task limit is 50 min.
  - Worst case on a warm cache: scan 206 s + 30 lock tries (30 s) + closing 2.7 s = about 239 s.
  - Cold storage was not measured, so 300 s is not shown. The header and the runbook both say this honestly.
- Worse case: a lock_timeout cancellation of any later wait reruns the migration from line 1, scan included, because isLockTimeout retries ProcessInterrupts (migrate.ts:109, :373). An example is ACCESS SHARE on practice queued behind an ACCESS EXCLUSIVE.
  - Retries continue for up to 20 tries, within the 30 min budget.
  - Inference from migrate.ts:350-380. Not probed.
- Fix (runbook only): say that 5 min is a measured target, not a limit, and that a runner retry repeats the full scan. Add a cold-cache timing before the first non-empty environment.

### MINOR-2: test gap behind T10 (new image against an unmigrated database)
- Where: apps/worker/src/reconcile/statement-lines.db.test.ts:720 (T10 covers the old image on the new database).
- What is pinned: the new-image-on-old-database direction is only pinned at function level.
  - T3 (migration test:643) shows the old roi_links_valid refuses five keys.
- What is not pinned: no test runs the new generateRoiStatement, from the job (job.ts:46) or the web action (routes/roi.ts:64), against the previous head. Nothing pins that:
  - it fails with 23514 and constraint roi_statement_links;
  - it stores no row and no audit event;
  - it queues no print job (the web action enqueues inside the same transaction);
  - the worker logs the code only.
- Mitigation: the runbook says the release order never produces this case.
- Fix: one db test that migrates to 20261114090000_payer_response_document_rules.sql, calls generateRoiStatement in the job and in the action, and asserts the four points above.

### MINOR-3 (pre-existing, not this PR's text): 22P02 quotes the value; the web rethrow path is unlogged-by-code
- Proof (rd_d, insert in scope):
  - `actionable_open_lines: ["SYNTHETIC-x"]` gives `ERROR: invalid input syntax for type uuid: "SYNTHETIC-x"`.
  - CONTEXT is the trigger's SQL text, with no values.
- Web path: invoke.ts:450-459 maps 23514 to a message the user sees (the rule's words, no values; T3b's last clause at statement-lines:741 pins that it names no ID or digit). Every other code is rethrown (`throw error`).
  - apps/web has no onRequestError hook, so Next.js's default logging receives the message.
- Why it cannot happen today: both writers build links from uuid columns (statements.ts: case ids and line_ids from ACTIONABLE_NOW_WITH_LINES), so a malformed ID cannot reach this path.
- What is pinned: the worker side logs `DB_22P02` (statement-lines:766).
- Fix (outside this PR): log non-mapped pg errors in invoke.ts as `DB_<code>` only, and add a test.

### NOTE-1: the rule checks membership and sum, not actionability
- Where: roi_statement_rules body, migration:252-268.
- `priced_line.variance_cents` is nullable (rd_d: attnotnull = f). So:
  - A listed line of a linked case with NULL or 0 variance passes as "found" and adds 0.
  - Offsetting variances would also pass.
- This is a consistency check by design (Decision 7). The writer computes the list in code. Flagged only so nobody reads the rule as proof of stage.
- A change would NEED GRANT/MIGRATION, for example `AND p.variance_cents IS NOT NULL` in the lateral. I do not recommend it without a product decision.

### NOTE-2: autovacuum can use up all 30 NOWAIT tries
- An autovacuum on roi_statement holds SHARE UPDATE EXCLUSIVE. Autovacuum is cancelled only by a conflicting request that waits (after deadlock_timeout), and NOWAIT never waits.
- So a long anti-wraparound vacuum fails the deploy (cleanly, nothing changed). The runbook already says to check for one.
- PostgreSQL behaviour, not probed.

### NOTE-3: other notes
- Dry run: one transaction holds every pending migration (migrate.ts:300-320), so in a dry run the SHARE lock is held through the later pending migrations. `--dry-run` is used only from cli/migrate.ts. A grep of infra and the runbooks finds no deploy use.
- Scope reset: the migration sets app.practice_ids to '{}' instead of restoring the earlier value. Proof: a prior '{1111...}' became '{}' after section 3. The runner sets none, so this is harmless.
- Repeat cost: the BEFORE trigger runs the line check before the roi_statement_quarterly unique conflict, so the daily repeat pays the check every day (T8 at statement-lines:537 pins the outcome, not the cost). The web action uses the default `mutation` rate limit (invoke.ts:499) and needs posting.reconcile. The cost scales with the caller's own practice's open lines only (1M lines is about 28 s, while its ROW EXCLUSIVE also refuses the migration's NOWAIT tries).
- CHECK DETAIL: a CHECK violation's DETAIL ("Failing row contains ... links") showed only as superuser. Under FORCE RLS, PostgreSQL omits the row for tp_app and tp_owner. Not asserted by T3b. To pin it, assert `detail` is undefined in T3b.

## Confirmed sound (with evidence)

### Function diffs (packages/db/functions)
- Only these changed:
  - the two body hashes;
  - one header line (`SET plan_cache_mode TO 'force_custom_plan'`);
  - the new block.
- Unchanged: Trigger-of and Called-by-policy lines (none), grants, owner, STRICT (f), LEAKPROOF (f), volatility (immutable and volatile, as before).
- Neither function is SECURITY DEFINER.
- search_path starts with pg_catalog and ends with pg_temp.
- Neither function contains EXECUTE or set_config.
- The migration creates no schema and no overload.
- rd_d: `proacl` is `{tp_owner=X/tp_owner,tp_app=X/tp_owner}` and `{tp_owner=X/tp_owner}`. Owner is tp_owner. tp_app owns 0 relations and 0 functions. No tp_ role has BYPASSRLS.

### Granted texts
- Section 5 (migration:282-296) pins both full SHA-256 values: 13c4dd46b9203095..., ad925199131cb411...
- It pins proconfig exactly.
- These match the "Decided" section (D2 plus the one header line; Appendix A).
- `pnpm db:domain-model --check` on rd_d: the domain model matches, and packages/db/functions matches 395 function names.

### Tenant isolation
- rd_d policies: roi_statement_tenant, priced_line_tenant and case_line_tenant are all `practice_id = ANY(current_setting('app.practice_ids')::uuid[])`. FORCE RLS is on for the five tables involved.
- The trigger (SECURITY INVOKER) filters `p.practice_id = NEW.practice_id` and `l.practice_id = NEW.practice_id` on top of RLS. So with a multi-practice scope, a line of practice B is not found.
- No oracle: a line that does not exist and a line of another practice give the same code (23514) and the same message.
  - T7 (statement-lines:453-465) pins four cross-practice shapes and a random ID to the same REFUSED string, with no UUID in it.
  - My probe of an unknown uppercase ID got the same message.
- case_line_once is UNIQUE (service_line_id), so the scalar subquery returns at most one row (no 21000).

### set_config
- Four calls (migration:136, 160, 172, 174), all with is_local true. The scope ends as '{}'.
- Probe (BEGIN; SET ROLE tp_owner; section 3 run as written):
  - after the block: `{}`;
  - SAVEPOINT, set, ROLLBACK TO: `{}`;
  - next transaction: empty.
- P3 (migration test:721) pins this.

### Preflight completeness
- The tenant policy is the bare practice_id match.
- practice_resolver is `SELECT TO tp_owner USING (true)` (rd_d), and the migration asserts it at :127. So deleted and suspended practices are listed.
- The table is insert-only, so equal counts mean the same rows:
  - DELETE is refused first;
  - UPDATE of practice_id or links is refused before the scope test;
  - TRUNCATE has a trigger.
- SHARE conflicts with ROW EXCLUSIVE, so once the lock is granted no insert is in flight. A READ COMMITTED next statement sees all committed rows. A single closing pass is therefore sufficient.
- Pinned by:
  - P4 (:916): a writer's open transaction makes the migration read that practice again and refuse;
  - P2b/P2e (:857): the closing count alone catches a skipped practice;
  - P1 (:799): a deleted practice, run through the runner, refuses with counts only and keeps both bodies;
  - P2c/P2d (:781).
- The refusal text (:181) has counts only, no DETAIL or HINT. CONTEXT is the DO block's line.

### Atomicity and retry
- One transaction per migration (migrate.ts:350-360), with no COMMIT, BEGIN or ROLLBACK in the file.
- The closing lock's own 55P03 is not retried: isLockTimeout needs routine ProcessInterrupts (migrate.ts:109). migrate-lock-wait.db.test.ts:191 pins this.
- NOWAIT never waits, so this migration cannot be part of a deadlock. Sections 4 and 5 take no table lock.

### Mixed images
- Old writer: four keys skip the new block (T6, :443; T10, :720).
- Old reader: base print.ts:74 storedStatement copies the four keys by name, so the fifth is dropped before any output.
- New readers: STATEMENT_COLUMNS (print.ts:83-87) projects four keys. Every other roi_statement select names columns (queries.ts:771, :869; print.ts:153).
- No place sends links whole to the browser, a log, a job payload (the payload is IDs only, roi.ts) or a URL.
- T12 (web statement-readers.db.test.ts; statement-lines:673) pins this.
- The runbook's rollback story (keep the migration, no data change, no rollback floor) holds.

### Malformed input codes (probed)
| Input | Code | Refused by |
|---|---|---|
| malformed ID | 22P02 | trigger cast |
| `["actionable_open_lines"]` | 23514 | CHECK roi_statement_links |
| uppercase UUID | 23514 | trigger rule |
| object as the list | 22023 | jsonb_array_elements_text |
| `[]` with 0 cents | accepted by the rule | |

T3b (migration test:678) pins each SQLSTATE and whether the CHECK or the trigger refuses it.

### Catalog test
- 239 removed lines and 556 added.
- After normalising quotes and whitespace, no removed line is missing from the added set. The change is a reformat plus new cases (plan_cache_mode, the CHECK scan and others).

### Domain model
- Only the expected lines changed:
  - provenance (5d060ada, an ancestor of HEAD);
  - migrations 53 and the head;
  - columns not in the dictionary 152 to 151, and key fields 395 to 396 (links now in the dictionary);
  - created-by;
  - the new rule message;
  - the two function rows;
  - the migration row 53;
  - the approval paragraph.
- The approval line is the generator's blank (`Approved by: ________  Date: ________`).
