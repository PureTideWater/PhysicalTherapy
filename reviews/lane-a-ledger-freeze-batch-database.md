# Adversarial review: schema PR 5, the ledger-freeze batch (database side)

- Scope: database: locks, row-level security, the freeze, migration order. Design note
  /home/user/ops/designs/lane-a-ledger-freeze-batch.md against the checkout /home/user/PhysicalTherapy at 93e137f9.
- Date: 2026-11-12. Synthetic data only. Read only; no repository file changed.
- Files read: the design note; approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md (whole, Appendix A and D,
  "Decided"); packages/db/src/migrate.ts; packages/db/migrations/20261113090000_ledger_lookups.sql (:1-56, :206-215);
  20261109090000_line_status_heads.sql (:115-133); 20261023120000_recovery_ledger.sql (:240-270);
  packages/db/functions/roi_links_valid.sql, roi_statement_rules.sql, practice_in_scope.sql; docs/product/domain-model.md
  (practice, priced_line, case_line, roi_statement: policies, grants, triggers); docs/product/reconciliation-001.md
  "Ledger semantics" (:465-472); .gitattributes; infra/lib/constructs/migration-run.ts, compute.ts:430.
- Scratch check: a private throwaway PostgreSQL 16 cluster (not 18) was started in my scratchpad; its data load did not
  finish within budget, so no measurement from it is used below. It was stopped.

## Findings

1. should-fix: the runner bounds nothing but lock waits, so the 3.3 scan has no statement-time limit. (Answers open point 2.)
   - Evidence: migrate.ts:112-114 sets only lock_timeout. Each try is its own BEGIN ... COMMIT/ROLLBACK (:352-371),
     and only a lock-timeout cancel (:103-109) is retried. Nothing in packages/db, infra or apps sets statement_timeout,
     transaction_timeout or idle_in_transaction_session_timeout (ADR 0092:27 says the same). The deploy gives the task
     50 minutes and "does not stop it at that limit" (migrate.ts:72-75, migration-run.ts:22).
   - Scenario: a restored database with about 1,000,000 statements. The scan runs for minutes with nothing to stop it.
     For that whole time the transaction holds back the vacuum horizon for every table. If a later statement in the same
     try hits lock_timeout (unlikely here), the retry runs the whole scan again.
   - The note's "could be cancelled" (5, row 4) is wrong: nothing can cancel it. Section 5 should say it is unbounded,
     and the build's stop rule should compare against the 5-minute line only.
   - Verified from source.

2. should-fix: the scan's cost model leaves out the tenant policy's own per-row cost, which grows with the number of
   practices, not only the number of IDs.
   - Evidence: roi_statement_tenant is `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])`
     (domain-model.md, Table roi_statement, Policies). 3.3 puts every practice in scope.
   - Scenario: the array expression is not a constant, so PostgreSQL likely re-parses and searches the whole array of
     every practice for each row. Scan cost is then rows x practices, on top of the 3.2 microseconds per ID.
   - The 2-3 minute estimate and the planned measurement (1,000,000 statements, one or a few practices) would both
     come in low. Measure with a realistic number of practices in scope (for example 1,000 and 10,000).
   - Suspected only: my scratch run did not finish, and its own data load was confounded, so I measured nothing.

3. should-fix (test gap): T2 proves the scan is not vacuous only if it runs the real file through the runner as tp_owner.
   - Evidence: the scan sees every row as tp_owner because of 3.3's set_config plus FORCE RLS. A superuser bypasses
     RLS even when it is forced. The runner does SET LOCAL ROLE tp_owner (migrate.ts:215).
   - Scenario: T2 applies the SQL as the test superuser. A mistyped or missing set_config (for example
     'app.practice_id') then still sees the stored `{}` and T2 passes. In production the scan would see no row and
     pass vacuously.
   - Missing test: T2 must call migrate() (or the dry run). Add T2c: the same file with the set_config removed must
     fail T2, which proves T2 can tell the difference.
   - Verified: the vacuous paths are closed today. `practice_resolver` (PERMISSIVE FOR SELECT TO tp_owner USING
     true) lets the array_agg see every practice. roi_statement.practice_id is `NOT NULL REFERENCES practice (id)`
     (20261023120000:242), so no stored row falls outside the scope. tp_owner has no BYPASSRLS (it is the owner, under
     FORCE). Empty `practice` means empty roi_statement.

4. should-fix (test gap; not a fault in granted text): bad five-key links are refused by D's casts, not by the CHECK,
   so the error code and message differ from what T3/T6 expect.
   - Evidence: D's block runs in a BEFORE row trigger. It does `x::uuid` over jsonb_array_elements_text of
     actionable_open_lines and actionable_open (ask, Appendix D lines 300-308). PostgreSQL runs BEFORE triggers before
     the CHECK constraint.
   - Scenario: a five-key insert whose actionable_open_lines holds "zz", or an object instead of an array. It fails in
     D with 22P02 (the bad text quoted in the message) or 22023, not check_violation. An upper-case UUID passes D's
     cast and is then refused by A's CHECK.
   - Nothing wrong is stored and the value is an ID, never PHI, so this is not a fault. Today's recovered/interest
     block behaves the same way.
   - T3 tests A as a function call only. Missing test: T3b, the 16 shapes inserted as tp_app with the key present,
     asserting a refusal (any SQLSTATE), no row stored, and no other practice's ID in the message.
   - Verified by reading the texts; trigger-before-CHECK order is PostgreSQL's documented behaviour (not run here).

5. note: D's reads under RLS (question 2). I checked them and found no fault in either granted text.
   - roi_statement_rules is not SECURITY DEFINER (functions/roi_statement_rules.sql:8-11), so its reads run as the
     caller (tp_app).
   - tp_app holds SELECT on priced_line and on case_line (domain-model.md, Privileges).
   - The only policies on those tables are the tenant ones and a RESTRICTIVE policy for INSERT on case_line, so no
     SELECT restriction can hide a practice's own rows.
   - Practice B's rows are excluded twice, by the policy and by `p.practice_id = NEW.practice_id AND l.practice_id =
     NEW.practice_id`. B's IDs only make `found` smaller, which means a refusal. D's message is a fixed string. T7 covers this.
   - An insert outside the scope takes the early `RETURN NEW` (Appendix D:278-280) and is then refused by
     roi_statement_tenant's WITH CHECK. PostgreSQL checks RLS before the CHECK constraint, so A never runs on it and
     nothing is read.
   - Verified from source and catalog text, except the RLS-before-CHECK order (PostgreSQL behaviour, not run).

6. note: opening the scope leaks nothing (question 2).
   - set_config(..., true) lasts until the end of the try's transaction.
   - Each migration and each retry is a new transaction (migrate.ts:352-371), and a raise in 3.3 rolls back the GUC
     with 3.2.
   - No later migration or retry inherits the scope. Verified from source.

7. note: the lock table (question 1) is right in substance, with these gaps.
   - CREATE OR REPLACE FUNCTION takes no lock on roi_statement. It also writes pg_depend and pg_shdepend (row 2 names
     only pg_depend).
   - Validating A's body (check_function_bodies) parses and analyzes it, which locks the tables it names. A names none,
     so no table lock (the precedent states this rule, 20261113090000:28-30).
   - PL/pgSQL validation of D is syntax-only, so its priced_line/case_line references take no lock at migration.
   - The 3.3 DO block and set_config take nothing more. The ACCESS SHARE locks on roi_statement and practice wait
     only behind an ACCESS EXCLUSIVE request: none at runtime; autovacuum truncation backs off.
   - Suspected, not checked: a second session replacing the same function at the same moment fails with "tuple
     concurrently updated" rather than waiting. Only migrations do that, and the runner serializes them
     (pg_advisory_lock, migrate.ts:343).
   - Cached plans: PL/pgSQL and SQL-function caches are invalidated when the pg_proc row changes. Either body accepts
     a four-key statement, so no window refuses the old image.
   - Not verified with pg_locks (the scratch run did not get there).

8. note: hash checks (question 4). The precedent makes them hard to misfire; keep its form in 3.5.
   - .gitattributes forces `eol=lf` on migrations and on function files. prosrc stores exactly the bytes between the
     dollar quotes, and pg_get_functiondef prints it back unchanged, so the ask's text, the generated file and prosrc
     hash alike.
   - The precedent compares with `IS DISTINCT FROM` on `to_regprocedure(...)` (20261113090000:45-53), so a missing
     function refuses.
   - 3.5 should be written the same way. With `<>`, a NULL hash (function missing or renamed) would pass without
     refusing.
   - With a CRLF or retyped paste, 3.5 refuses, which is safe.
   - Verified from source.

9. note: order, retries and deploy (question 4). All right as designed.
   - Re-running 3.1-3.5 from the first line is safe, because each try is a fresh transaction.
   - Raising after 3.2 rolls 3.2 back.
   - A migration that sorts in between and changes either body makes 3.1 refuse, which is what the grant requires.
     The base head is 20261113090000_ledger_lookups.sql (dated tomorrow), so the new timestamp must sort after it
     and after PR 4.
   - Deploy order verified: each service depends on the migration custom resource (infra/lib/constructs/
     compute.ts:430), so the migration runs before the image.
   - Rollback: an image rollback works on the migrated database. A migration is only ever fixed forward.

10. note: open point 3 is answered from the catalog.
    - case_line rows are never deleted (`case_line_never_deleted`).
    - tp_app's UPDATE columns on case_line exclude case_id and priced_line_id.
    - priced_line is immutable (`priced_line_immutable`).
    - Nothing at runtime can change what D reads between the writer's read and its insert; only an owner-run migration
      could. Verified in domain-model.md.

11. note: the freeze and the grant (question 3).
    - The migration alters no table and adds no trigger or policy on roi_statement. Reading it is not altering it
      (reconciliation-001.md:466), and the two bodies are exactly A and D.
    - N1-N3 are the narrow readings.
    - One edge: 4.1 moves the shared fragment inside apps/worker/src/triage/actionable-now.ts. That module is also
      imported by apps/web/src/lib/triage/queries.ts, apps/worker/src/digest/figures.ts and
      apps/worker/src/triage/public.ts. It is not ledger-frozen and T16 pins ACTIONABLE_NOW byte for byte, but the
      ask's "the writer storing the priced-line IDs" does not literally name it. Say so in the description.

## Not reviewed
- PostgreSQL 18-specific timings and plans (T14, section 5 row 4). I took no measurement.
- An empirical pg_locks listing for 3.2/3.4.
