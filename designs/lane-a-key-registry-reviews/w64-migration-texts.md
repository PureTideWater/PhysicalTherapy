# W64: the migration texts for Queues item 37 (proved in a scratch copy; NOT applied to any migration file)

Session session_019i9ifBKYJayza89rg9KE3j, 2026-11-13. WIP `co-001/wip-key-registry` (base 979a21b8 merged in by 04a62fed).
**The exact text of every change is two files beside this one, and they are the record:**
- `w64/apply-texts.py`: each change as an exact old-text / new-text pair on `20261115090000_key_registry.sql`; it stops
  unless every old text matches exactly once. Run on a scratch copy only:
  `python3 w64/apply-texts.py <copy of the migration> a1-trigger.sql.txt`.
- `w64/migration.patch`: the same as a unified diff of the migration (243 lines), for reading.
All statements are edits INSIDE the one unmerged migration (CREATE texts changed in place, new CREATE FUNCTIONs added),
so there is no ALTER, no backfill and no second step: the migration still only adds objects. None has COMMIT, BEGIN,
ROLLBACK, EXCEPTION WHEN OTHERS or a lock_timeout. Every new function: plpgsql, SECURITY DEFINER (each reads or writes
a table closed to its caller: provider_sign_out, audit_event's reserved actions), `SET search_path = pg_catalog,
public, pg_temp`, owner tp_owner (the migration's role), in section 14's REVOKE ... FROM PUBLIC list, granted to one role.
**Safe to run again from its first line:** as the migration is today, no: its preflight refuses when any of its objects
exists (by design); the preflight's proname list gains the two names its LIKE patterns do not already cover.
**Locks:** nothing new at migration time (the five table locks it already takes cover the one new trigger on "user",
SHARE ROW EXCLUSIVE, already held). At run time, per change below. **Previous image running:** every change is an
added object or a wider list; the previous image calls none of the new functions; its claim query names four columns
and ignores the fifth.

## Proof (PostgreSQL 18 on 5433, Node 24)
Scratch worktree at 04a62fed + the tests of 3dbf14ec, its migration copy patched by the script, a fresh database a file:
`packages/db/src/provider-sign-out.db.test.ts` and `packages/db/src/key-registry.db.test.ts`: **58 passed, 2 failed**;
the unpatched tree: **46 passed, 14 failed**. The two that stay red with the texts applied, both expected:
1. `SGN-22 > adds nothing to the request path ...`: counts the files named `20261115*` and expects 2; PR 5's
   `20261115090000_roi_statement_actionable_lines.sql` makes 3. **It is red only for the shared prefix and goes with the
   rename** (if the renamed files leave that prefix, the test's filter needs their new prefix).
2. `JOB-07 > gives up at 30 tries, and at 24 hours only a row that had its four tries ...`: its first five lines assert
   the rule the 03:45 ruling replaced (a row never tried is not given up at 25 hours). **With change 3 the next session
   rewords those lines to the new rule** (JOB-09 already asserts it); nothing else in that test changes. Not touched here.
**Not proved:** the whole `pnpm test:db` on the patched tree (only the two files ran); SEC-25's maps with the new names
(the maps are filtered by name, so they pass without them; the names must be added, below); the worker's and web's suites.

## A1. The trigger user_removal_target_holds
By reference: `a1-trigger.sql.txt` (text, lock analysis, proof). The script inserts it after `CREATE TRIGGER
membership_removal_target_holds`, its REVOKE folded into section 14. SGN-24's three red cases pass with it (in the 58).

## 2. B2 / point 20: the unrecorded reset's sign-out (test SGN-28, four cases)
- `provider_sign_out_reason` gains `'password_reset_unrecorded'` (section 1, the CREATE TABLE).
- The trigger `audit_event_provider_sign_out`'s WHEN list gains the action (section 7), under the same guard (actor_kind
  user, object the actor).
- `provider_sign_out_unrecorded_reset(request text) RETURNS boolean`, tp_app, after that trigger: requires an actor that
  is an account; writes the audit row (actor = object = the account) and the trigger queues from it; **takes no row lock
  on the account** (its audit insert's foreign key takes FOR KEY SHARE, which does not wait on the reset's FOR NO KEY
  UPDATE: the test holds that lock in another transaction); writes nothing while a row of this reason waits with no lease
  (`done_at`, `gave_up_at` and `leased_until` all NULL), so tp_app cannot flood the outbox; a leased row does not count,
  since its provider call may predate this reset. Returns whether it queued.
- `operator_provider_sign_out_request(account uuid, request text) RETURNS uuid`, tp_operator: the system's audit row
  (purpose `operator`) and the outbox row written directly (the trigger's guard passes only an account's own row); P0002
  for no such account; NULL while one waits.
- `audit_event_record`'s reserved list gains `'password_reset_unrecorded'` (section 13), so tp_app writes the action only
  through the function (tested: 42501).
- Lists: preflight proname (`provider_sign_out_unrecorded_reset`; the operator one is covered by its LIKE); section 14
  REVOKE (both), GRANT tp_app (the first), GRANT tp_operator (the second). SEC-25: `'provider_sign_out_unrecorded_reset(text)':
  forApp`, `'operator_provider_sign_out_request(uuid,text)': forOperator`. `PROVIDER_SIGN_OUT_REASONS`
  (`packages/db/src/schema/identity.ts:116`) gains the reason. The header's function lists.
- What it does not do, said plainly: it moves no mark and ends no app session (the reset's own record does; D15's gap for
  those stays). Tenant isolation: the subject is always `app_actor_id()`; no argument names an account for tp_app.

## 3. B1: LATE and GAVE_UP by age (test JOB-09, two cases)
Section 10, `operator_provider_sign_outs_overdue`: LATE's condition gains `OR p.queued_at <= now() - interval '15
minutes'` (whatever tries, whatever lease); GAVE_UP's becomes `p.attempts >= 30 OR p.queued_at <= now() - interval '24
hours'`, still only with no running lease. Its comment reworded. Locks: as before (the sweep's own row updates).
**A consequence to tell the founder:** after the job has been down a day, every row older than 24 hours that the first
run's 8 seconds do not reach is given up untried and paged GAVE_UP (never claimed again); a person signs those accounts
out (the runbook's GAVE_UP step). Before, such rows were claimed late and paged nobody. This is the ruling as written.

## 4. D7: no security event for a step with no beginning (test SGN-29)
Section 8, `hardware_key_registration_judge`: `IF began IS NULL THEN RETURN 'refused'; END IF;` directly before the
once-an-hour `key_registration_refused` INSERT (after the not_closed answer and the counting block, which a NULL began
already skips). No lock changes.

## 6. B6: the claim returns the cause (test "JOB-07: the claim names the cause")
Section 10, `operator_provider_sign_out_claim`: RETURNS TABLE gains `cause_request_id text`; RETURNING gains
`p.request_id`. SEC-25's key for the function is unchanged (no argument). **App side not built:** the worker's warn line
gains `request_id: claimed.cause_request_id` and the step-failure line a `sqlstate` field (not in
`packages/observability/src/fields.ts` today: a reviewed change there); the worker should select `*` or the five names
only after the migration is in.

## 7. A5: a refused act on a key removal leaves a security event (test SEC-28, two cases)
Section 9, before `hardware_key_removals`: `hardware_key_removal_refused(why text, request text) RETURNS void`, tp_app.
An `audit_event` row, action `security_event`, actor_kind system, object the ACTING account, purpose
`key_removal_refused_<why>`, why in (`not_permitted`, `two_people`, `not_own_account`, `requester_left`); once an account
and a reason an hour; no removal ID, no other account, no text. The refusal itself raises and rolls back, so the route
calls this in a transaction of its own (`withActor(services.pool, actor.id, ...)` from `refused()` in
`apps/web/src/lib/routes/console-keys.ts`). **App side not built.** It is the shape of `sign_in_key_refused` (section 8),
where the registry's other refusals are recorded. Lists: section 14 REVOKE and GRANT tp_app (its name is covered by the
preflight's `hardware\_key\_%`); SEC-25 `'hardware_key_removal_refused(text,text)': forApp`. **Metric filters:** a grep of
`infra/lib/security-events.ts` for `key_refused`, `key_registration_refused` and `purpose` found nothing, so no existing
filter counts these audit rows' kinds; none was built.

## 5. A4: hardware_key_record counts its check: NOT DONE (no text, no test)
The design reached, for the next session to judge: on a wrong code against a usable opening the function counts one try
and returns no row instead of raising (a raise rolls the count back), so record and judge share the five tries; a NULL
code or no usable opening still raises `hardware_key_registration_closed`. The web must then treat no row as that
refusal (`sign-in.ts:1123`), and SGN-27's wrong-code case changes from a raise to an empty answer. Review A's other way
(a judged-open marker on the removal row) needs a column and an exact timestamp match across the web.

## Not done by this session
The adversarial review (step 4): not run. The app-side code for 2 (the web's third transaction in `endedByReset`, the
runbook's step naming `operator_provider_sign_out_request`), 6 and 7. The header comment's lists in the migration.
