# Review (database): the hardware-key registry design, v1

Reviewed: `/home/user/ops/designs/lane-a-key-registry.md` (v1, 2026-11-12) against base 93e137f9.
Scope: row-level security, definer functions, locks and lock order, the migration's locks, the outbox's exactly-once effect.
Out of scope and not examined: the social side of the two-person rule, WebAuthn assertion checking, sign-in attacker scenarios.

How this was checked: by reading the code named in each finding and by PostgreSQL's documented behaviour.
**Nothing was run.** No PostgreSQL server is available on this machine (`pg_isready`: no response; only a 16.x client is installed), so no lock claim was proved on a scratch database.
Each finding says whether it is verified in code, rests on documented behaviour, or is inferred.

## Findings

### D1 (blocking). A row that never reaches `failed` wedges the claim or stalls for good, unpaged

Section 7 (Claim, Outcome, the crash table) and section 3.4 (`attempts` 0 to 30).

The note counts the try at the claim "so a row that kills the worker still runs out of tries", but only `operator_provider_sign_out_failed` ever writes `gave_up_at` or answers `late`. A row whose worker dies never calls `failed`.

Steps:
1. Run 1 claims row R: `attempts = 1`, lease 2 minutes. The worker dies before `done` or `failed` (the crash table's rows 4 and 5).
2. `next_attempt_at` is unchanged, so R is claimed again at each lease lapse, every 2 minutes. After about an hour `attempts = 30`.
3. The next claim does `attempts = attempts + 1` and gets 31. The CHECK refuses it and the whole claim statement fails. Every other due row in that batch is unclaimed too, every minute, for good. If the claim instead filters `attempts < 30`, R sits undone, not given up, with no `late`, no `gave_up`, no audit row and no page.

A second route to the same state needs no crash. The claim takes `at_most` rows, and the job stops after 8 seconds of provider time, "the rest left due". Rows claimed but not reached have already spent a try and hold a lease. With a slow provider and a batch larger than one, a row can burn 30 tries without ever being called. The base avoids this by claiming one row at a time, only when about to send (`apps/worker/src/platform/password-notices.ts` lines 229 to 233, `operator_password_notice_claim(uuid)`).

Also unstated: `late` "at the fourth failed try" breaks if it is tested as `attempts = 4`, because tries burnt at the claim can step over 4. The step schedule needs a stated value for tries past the fourth (the base's `(ARRAY[1,5,15,60])[attempts + 1]` gives NULL past four, `operator_password_notice_failed`).

Basis: the note's own text, plus the CHECK. Inferred, not run.

Smallest change:
- The claim itself gives up, with the `provider_sign_out_undelivered` event, any undone row with a lapsed lease whose `attempts >= 30` or whose `queued_at` is 24 hours old, before it takes new rows; it returns those so the job writes the error line.
- The claim takes `at_most = 1`, immediately before each call.
- `late` is `late_reported_at IS NULL AND attempts >= 4`.
- The step is `coalesce(step[attempts], 60)`.
- Add a JOB-c case: a worker killed 30 times running.

### D2 (should fix). `done` and `failed` carry no proof of which claim they answer

Section 4.2 and section 7 (Outcome, "What is idempotent").

"`done` and `failed` act only on an undone row" does not cover a stale worker.

Steps:
1. Worker A claims R (try n) and stalls past its lease (a frozen task; the 10 second abort does not help a stopped process).
2. Worker B claims R (try n+1) and is calling the provider.
3. A wakes and reports `failed`. That moves `next_attempt_at`, clears B's lease and may answer `gave_up`, all for B's try.
4. B's call succeeds and it reports `done` on a row with `gave_up_at` set. Either `CHECK (done_at IS NULL OR gave_up_at IS NULL)` raises in the job, or the success is dropped. The record then says undelivered, with a page, when the provider was in fact asked.

The single `provider_signed_out` record still holds (guarded by `done_at IS NULL`). What breaks is the truth of `gave_up` and the schedule.

Basis: inferred from the note; the note does not say what `done` does to a given-up row.

Smallest change:
- `done` and `failed` take the `attempts` value the claim returned and act only `WHERE attempts = that AND done_at IS NULL`. A stale report answers false and changes nothing.
- State that `done` on a given-up row is allowed and recorded: drop the CHECK, or clear `gave_up_at` with a `provider_signed_out` row whose purpose says it came late.

### D3 (should fix). The `LATE` and `GAVE_UP` pages are at most once

Section 7 (Logs and paging).

`failed` commits `late_reported_at` or `gave_up_at`, and the worker writes the error line afterwards. A worker that dies between the commit and the line leaves a row that will never answer `late` or `gave_up` again. The alarm counts the line's words, so the one page for a sign-out that was not delivered is lost.

The base has the same shape for a member's email (`undelivered_reported_at`). Here the page is the only signal for a security action.

Basis: inferred from the note's order of events.

Smallest change: one of
- report then acknowledge: `failed` answers `late` or `gave_up` until a second call, made after the line is written, sets the reported column; or
- each run re-emits the line for given-up rows not yet acknowledged.

Add the crash point to JOB-c.

### D4 (should fix). `#variable_conflict use_variable` with output and parameter names equal to column names

Section 4 (the header rule) and the signatures in 4.1 and 4.2.

The names that collide with columns of the tables the functions read:
- `hardware_key_record(credential_sha256, public_key, ...)`
- `sign_in_hardware_keys ... RETURNS TABLE (credential_sha256, public_key)`
- `hardware_key_removals() RETURNS TABLE (user_id, requested_by, state, ...)`
- `hardware_key_removal_confirm ... RETURNS TABLE (keys_removed, sessions_ended)`
- `operator_provider_sign_outs_claim ... RETURNS TABLE (..., user_id, cognito_sub, attempts)`

Under `use_variable` an unqualified column reference silently becomes the variable; it is not an error. Examples:
- `WHERE credential_sha256 = credential_sha256` is true for every row.
- `SELECT credential_sha256, public_key FROM hardware_key ...` returns the NULL output variables.
- `SET attempts = attempts + 1` assigns NULL.

The directive is the base's convention (22 files under `packages/db/functions`), and the base survives it by qualifying every column with an alias (`operator_password_notice_failed.sql`: `p.attempts`, `p.state`). `resolve_session.sql` returns `user_id` and qualifies with `x.`.

Basis: verified in code and by documented PL/pgSQL behaviour.

Smallest change: one sentence in section 4, "every column reference in these functions is alias-qualified; no parameter or output column is referenced bare in SQL", plus either renamed parameters for `hardware_key_record` (for example `new_credential_sha256`, `new_public_key`) or a test that a second account's digest is not reported as "already known" and that the reader returns non-null values.

### D5 (should fix). `membership_ended` can be recorded for a membership the transaction inserted already ended

Section 4.3 (`audit_event_provider_sign_out`), section 13 item 4, SEC-c.

The check is "a row with that ID whose `ends_at = now()`". The application role may insert `ends_at`: `GRANT INSERT (id, organization_id, user_id, role, ends_at) ON membership TO tp_app` (`20261015140000_tenancy.sql` line 602). `membership_rules` skips its fit check when `ends_at <= now()` (`functions/membership_rules.sql`), and the mark trigger is AFTER UPDATE only.

Steps, one transaction as an administrator:
1. `INSERT INTO membership (..., user_id, ends_at) VALUES (..., X, now())`.
2. Insert the `membership_ended` audit row naming it.
3. The trigger accepts and queues a provider sign-out for X. No membership of X was ended, no mark moved and no session ended.

The reach is bounded by the insert policy (`20261015180000_tenancy_hardening.sql` lines 139 to 145): an organization's administrator for a user not known elsewhere, or a platform administrator for any user in a group or firm. So this is a nuisance sign-out, not an escalation. But the note's sentence "cannot be forged to queue a sign-out for someone else" is false as written, and SEC-c would pass without catching it.

The equality itself is sound for the real path. `now()` is the transaction's start and does not change in a subtransaction. Both routes write `now()` in SQL (`console.ts` line 782, `settings.ts` line 1102). I found no other writer of the action (grep of `apps` and `packages`: the two routes only; tests go through the routes). Owner-side `UPDATE membership SET ends_at = now()` in tests (`access.db.test.ts` lines 352 and 361, `sign-in.db.test.ts` line 1562) writes no audit row, so raising breaks none of them.

Basis: grants, trigger body and writers verified in code; the forged path is inferred, not run.

Smallest change: add `AND m.created_at < now()` to the check (the row was made by an earlier transaction) and a SEC-c case for the insert-ended path.

### D6 (should fix). The claim's query shape is not stated safely

Section 7 (Claim).

`UPDATE ... WHERE id IN (SELECT ... ORDER BY ... FOR UPDATE SKIP LOCKED LIMIT n)` leaves the planner free to run the sub-select more than once (a nested loop that rescans it). Each rescan skips different locked rows, so more than `n` rows can be updated and the order is not kept. With D1's "claim one, call one" this would break the budget.

Basis: documented PostgreSQL behaviour (a known hazard of this shape); not run.

Smallest change: say the shape. Either a `WITH due AS MATERIALIZED (SELECT id ... FOR UPDATE SKIP LOCKED LIMIT n) UPDATE ... FROM due`, or lock in a PL/pgSQL loop as `operator_password_notice_claim` does. Join `"user"` in the RETURNING side with an alias (see D4).

### D7 (note). Two column rules cannot be written as stated; clock reads

- Section 3.4: `next_attempt_at` "default `queued_at`". A column default cannot refer to another column. The inserting trigger and function must set it. Say so.
- Section 6, steps 4 and 6: the confirm judges `clock_timestamp() < expires_at`, then writes `decided_at = clock_timestamp()` from a later read. At the boundary the second read can fail `hardware_key_removal_in_time`. The name maps to the right sentence, so the effect is right, but SGN-e's "at 24 hours exactly" can flake. Read the clock once into a variable in each function and use it for the judgement, `decided_at`, `removed_at` and the mark. The same goes for `expires_at = requested_at + interval '24 hours'`.
- Section 4 says time is judged on `clock_timestamp()`; section 7 writes `now()` for the claim, the lease and the 24 hours. Both are right only while each outbox call is its own transaction. State that, or use `clock_timestamp()` throughout.

### D8 (note). Indexes the trigger and the functions need

Section 3.1, 3.2 and 4.3.

The no-digest branch asks "any `hardware_key` row" and "any confirmed removal" for an account. The only indexes on `user_id` are partial (`WHERE removed_at IS NULL`; `WHERE state = 'requested'`). Those two reads, the hold check and `hardware_key_removals()` scan the tables under the account's row lock at every previous-image key sign-in.

The tables are small at launch, so this is cost, not correctness. Add plain indexes `hardware_key (user_id)` and `hardware_key_removal (user_id, state)`.

### D9 (note). Things the note should say in one line each

- Section 6, step 5: `user_removes_keys(requested_by)` reads `membership` with no lock. A requester whose membership is ended by a transaction that commits just after the read still counts. I would accept that and say so: closing it means locking a membership row while holding an account row, the reverse of End membership's new order (membership row, then account row), and so a deadlock.
- Section 4: the two helpers must be one predicate, or they will drift: the same "live" test (`ends_at IS NULL OR ends_at > now()`), the same organization kind, and whatever account-status rule `app_actor_memberships()` applies. I did not read that function; confirm at build.
- Section 4.3, reset branch: say that an audit row failing ADR 0091 D3's guard is skipped, never raised, as the base's two triggers do through their WHEN clauses (`20261112090000` line 191).
- Section 4.3, `membership_end_marks_account`: a row-level trigger under a multi-row UPDATE takes account rows in scan order, so two such statements could deadlock. No such writer exists today (the routes end one membership each). Record it.
- Section 7, the run's order: the two expiry sweeps run before the claims. An error in housekeeping then stops every sign-out. Run the claims first, or catch and log the sweeps' failures by code.
- Section 4.1, `sign_in_key_refused`: "once for an account, a reason and a request" needs a named guard. An existence read on `audit_event` is racy without a lock; say which lock or accept a rare duplicate.
- Section 4.2, `operator_provider_sign_out_done(…, outcome, …)`: say `outcome` is checked against a closed list in the function.

## Checked and found sound

**Lock order (question 1).** Verified in code unless marked.
- `openSession` takes the account row first (`sessions.ts` line 76), then device, then session. The new trigger re-takes a lock already held.
- `resolve_session` locks one session row and only reads `"user"` (`functions/resolve_session.sql` lines 20 to 22). It runs in its own transaction (`sessions.ts` line 184, `withResolvedActor`), not the handler's. So no request holds a session row while a handler takes an account row.
- The confirm (account row, removal row, keys, sessions) waits on a session row held by a resolve, which waits on nothing of the confirm's. No cycle.
- The confirm's step 2 (read unlocked, lock the account, lock and re-read the removal) holds, because `user_id` never changes on a removal (the finality trigger).
- End membership becomes: membership row, account row, session rows. I found nothing that holds an account row and then takes a membership row lock. Every function that locks `"user"` is one of `sign_in_lock_account`, `user_session_sign_in_not_before`, `audit_event_password_notice`, `sign_in_lock_key_across_reset`, `unlock_user` and `sign_in_failed`; none writes `membership`. The three routes that write `membership` (`settings.ts` lines 1061 and 1102, `console.ts` line 782) do not update `"user"` first.
- Foreign-key checks take FOR KEY SHARE on `"user"`, which does not conflict with FOR NO KEY UPDATE (documented). `sign_in_failed` takes FOR UPDATE (`functions/sign_in_failed.sql` line 21), which does block key-share checks, but it holds one row and wants nothing else.
- A row-level AFTER trigger that is not deferred fires at the end of its statement, before the route's next statement (documented).
- The WHEN clause is true for `ends_at = now()`: `NEW.ends_at <= now()` and the old value is null or later.
- `UPDATE membership SET ends_at` changes no key column, so it runs no foreign-key check. `membership_rules` skips its advisory lock when the new end is not in the future. `membership_security_events` fires on role only. `membership_keeps_practice_administrator` is deferred to commit and rolls the whole transaction back, the mark and the outbox row included.
- Not checked: whether `assert_organization_keeps_administrator` takes a lock at commit. That path is unchanged from the base.

**Row-level security (question 3).**
- A definer function owned by `tp_owner` sees rows under FORCE with the owner policy: this is exactly `password_notice` (`20261111090000` lines 209 to 211) and `"user"`, `membership`, `user_session` (`user_owner`, `membership_owner`, `user_session_owner`).
- Foreign-key checks run as the table's owner and are exempt from FORCE (documented; `password_notice.user_id` already rests on it).
- `REVOKE ALL` covers TRUNCATE and REFERENCES; the tables have no sequence.
- `tp_app` has column grants only on `user_session`: INSERT of five columns plus `sign_in_began_at`, UPDATE of `ended_at` and `end_reason` (`20261015170000` lines 484 and 485). So `GRANT INSERT (key_credential_sha256)` suffices, and the app role cannot rewrite a digest after the insert.
- Helpers with no grant work when called from definer functions, since the owner executes its own functions.
- `sign_in_hardware_keys` as a STABLE definer open to `tp_app` returns a digest and a public key, in the same position as `sign_in_account`. Acceptable.

**Triggers on `user_session` (question 4).**
- The only BEFORE INSERT trigger there today is `user_session_sign_in_not_before`; `user_session_hardware_key` sorts before it.
- NOT VALID then VALIDATE is right for the new CHECK, and a NOT VALID check binds new rows.

**The migration (question 5).** By documented lock modes and the base's pattern.
- The lock modes fit: CREATE TRIGGER needs SHARE ROW EXCLUSIVE (`membership`); ADD COLUMN and the policy swap need ACCESS EXCLUSIVE (`user_session`, `audit_event`); the constraint swap needs ACCESS EXCLUSIVE (`mail_send`); a foreign key to `"user"` needs SHARE ROW EXCLUSIVE on it, which is held.
- I found no statement after the loop that takes a table lock not already held, so nothing queues while the exclusive locks are held.
- DROP plus ADD ... NOT VALID in one ALTER scans nothing. This is better than the base, which added the wider constraint validated (`20261111090000` lines 166 to 170).
- The policy is dropped and recreated in one transaction under ACCESS EXCLUSIVE: no other session sees a moment without it or with a wider one.
- "Safe to run again" holds as in `20261112090000`: one transaction a file, so a failed try leaves nothing and the preflight only refuses a second apply.
- File 2: VALIDATE under SHARE UPDATE EXCLUSIVE is right, and running it again is a no-op.
- To confirm at build: that the runner sets no statement timeout shorter than a scan of `mail_send`.

**The outbox, the rest (question 6).**
- `provider_signed_out` is written once (the update guarded by `done_at IS NULL`, in the same function).
- A deleted done row cannot return: `audit_event` is append-only and each cause has a new ID.
- `"user".cognito_sub` is NOT NULL (`20261015140000`), and users are not deleted, so the claim's join loses no row.
- With a responsive provider, 24 hours of the stated steps is about 27 tries, under 30.
- `audit_event.at` defaults to `now()`, so `queued_at` is never in the future at commit.

## Verdict

The lock design is sound. I could not build a deadlock from the note's orders against the base's code, the RLS shape is the one `password_notice` already proves, and the migration's lock plan is right, though none of it was run for want of a database. The outbox is the weak part. As written it does not keep its own promise that a row that kills the worker still runs out of tries: nothing but `failed` can give a row up, and the try is counted where the CHECK can refuse it (D1). That must be closed in the note before a build starts, because it decides the claim's signature. D2, D3 and D6 are small additions to the same three functions and should go in with it. D4 and D5 are one sentence and one predicate. With those the note is buildable; the rest are lines to add.
