# W64, revised by W65 and W66: the migration texts for Queues item 37 (proved in a scratch copy; NOT applied to any migration file)

**W66 (2026-11-13): the record is now `w66/apply-texts.py` and `w66/migration.patch`; read the section "W66" near the end. What follows is as W65 left it.**

**W65 (session_019i9if9qjSJt3AGpHV86RSa, 2026-11-13) changed two things here: section 3 is now the REFINED ruling 3
(the orchestrator, 03:55 UTC: a row is never given up untried), and section 5 (A4) has its text and test. The record
is now `w65/apply-texts.py` and `w65/migration.patch` (W64's script with change 3 replaced, change 5 added and the
review's fix round, below; run
the same way: `python3 w65/apply-texts.py <copy of the migration> a1-trigger.sql.txt`). `w64/` is kept as it was and
is superseded. W65's proof, same method, after the fix round: the two db test files with the texts applied, 65
passed, 1 failed (the SGN-22 prefix case, which goes with the rename). The old JOB-07 case's five lines
are already reworded on the WIP ref (owed red until change 3), so nothing in a test is left to reword but the
"(owed red ...)" parentheses.**

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

## The adversarial review's fix round (W65; report `w65-review.md`: 0 blockers, 6 should-fix, 6 notes)
Taken into the texts and tests (each proved in the 65):
- **S1, section 2, both functions' guard:** a waiting row covers a later call only if it was NEVER TRIED
  (`AND p.attempts = 0` added to `done_at IS NULL AND gave_up_at IS NULL AND leased_until IS NULL`). A row whose try
  failed has no lease either, and its next try may be an hour away or its age about to give it up: it must not hold
  back a later reset's sign-out. Flood bound: still at most one untried row an account and cause at a time.
- **S2, section 3, GAVE_UP by age:** `p.last_error_code IS NOT NULL AND p.queued_at <= now() - interval '24 hours'`
  in place of `p.attempts >= 1 AND ...`. The claim counts the try before the provider is called, so `attempts >= 1`
  was true of a row whose worker was stopped between the claim and the call: given up with nothing ever sent.
  `last_error_code` is set only by `operator_provider_sign_out_failed` (always non-NULL there: a name or `unknown`),
  so it means one try was ANSWERED as failed. A row that kills its worker at every claim still ends at 30 tries.
- **S3, section 3, a second statement in the sweep:** `UPDATE provider_sign_out p SET late_reported_at = NULL WHERE
  p.done_at IS NULL AND p.gave_up_at IS NULL AND p.late_reported_at <= now() - interval '24 hours'`, after the LATE
  mark. A row still waiting a day after its LATE line was acknowledged owes the line again, so a row no run reaches
  (claims failing while the sweep runs) is paged daily, not once and then silent for ever. Done and given-up rows
  are not re-armed. Locks: the sweep's own row updates, as before.
- **S5, test only:** SGN-29 asserts the right code and a wrong one with no beginning are both `refused`, uncounted.
- **N4, tests only:** a fresh row from the trigger and from the operator's function has `next_attempt_at = queued_at`.
Not taken, in the status file's queue list with the reason: S4 (the web path's committed count: `recorded()` throws
after `withActor` returned, so the transaction has committed; a web test through a real closed registration is
owed), S6 (A1's trigger binds a target while its requester's request is open: a design question for the founder),
N1, N2, N3, N5, N6.

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

## 3. B1 under ruling 3 REFINED: LATE by age, GAVE_UP by age only after one try (test JOB-09, three cases; old JOB-07 case)
Section 10, `operator_provider_sign_outs_overdue`, two conditions and the comment:
- LATE's gains `OR p.queued_at <= now() - interval '15 minutes'` (undone, whatever its tries, whatever its lease).
- GAVE_UP's becomes `p.attempts >= 30 OR (p.last_error_code IS NOT NULL AND p.queued_at <= now() - interval '24
  hours')`, still only with no running lease, still `done_at IS NULL AND gave_up_at IS NULL`. (Before: `p.attempts >=
  4 AND` 24 hours. W64's first text had no minimum; that text is withdrawn. "One try" is one ANSWERED try: the fix
  round's S2, above.)
- **A row with `attempts = 0` is never given up**, whatever its age: it is LATE and paged (once, then acknowledged) and
  stays claimable. Why: giving up a sign-out never attempted leaves alive a provider session the product promised to end.
- **Oldest first needs no text change, and JOB-09's third case holds it:** the claim orders by `next_attempt_at, id`;
  a row never tried has `next_attempt_at = queued_at` (the trigger and the operator function both insert it so), and
  every claim moves the claimed row's `next_attempt_at` to now + 2 minutes, so no later row can sort ahead of an
  untried one and the untried rows are reached in the order they were queued. A row a run does not reach has no try
  counted, stays LATE, and is claimed by a later run. After its own first try (failed, or its lease lapsed with no
  answer) its age gives it up at the next sweep: one try is the ruling's minimum, not four.
- Locks: as before (the sweep's own row updates; the claim's `FOR UPDATE SKIP LOCKED`).
- Tests: JOB-09 case 2 (one try and 25 hours: GAVE_UP once, one audit row; in flight: LATE only until the lease is
  over; done: nothing; never tried at 30 days: LATE on every sweep, attempts 0, no `provider_sign_out_undelivered`),
  case 3 (three untried rows 25 to 27 hours old: the claim takes the oldest; the sweep leaves the other two LATE with
  no try; the tried one fails and is given up; the next claims take the others in queue order at try 1), and the old
  JOB-07 case's first lines (untried at 25 hours: `['LATE']`, not given up, claimed at try 1).
**The consequence W64 listed for the founder is gone** (no row is given up untried after an outage). What is left to
say: after a day's outage, a row older than 24 hours gets ONE try and, if that fails, is given up at the next sweep
and paged GAVE_UP (not four tries as before); a person signs that account out (the runbook's GAVE_UP step).

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

## 5. A4: hardware_key_record counts its check (test SGN-30, four cases; SGN-27 loses one line that moved there)
Section 8, `hardware_key_record`, inside `IF closed THEN`, and the function's comment:
- No usable opening, or no code at all (`code_sha256 IS NULL`): raises `hardware_key_registration_closed` as today.
  Neither is a guess, and nothing is counted.
- A code that does not match a usable opening: `UPDATE hardware_key_removal SET registration_code_tries =
  registration_code_tries + 1` on that opening; the security event `key_registration_refused` for the actor at most
  once an hour (the judge's own statement, same guard); then **`RETURN;` with no row** instead of a raise, so the
  count commits (a raise rolls it back, which made this function an uncounted oracle for the code beside the judge).
  No key row, no `hardware_key_registered` event, no notice. The fifth wrong code, from the judge or from here,
  spends the opening (`hardware_key_opening_usable` asks `registration_code_tries < 5`); after that even the right
  code is refused by the raise.
- The match stays the double-hashed comparison. The function's shape (RETURNS TABLE, arguments) is unchanged, so
  SEC-25's key is unchanged and nothing is granted or revoked.
- Locks: none new. The function already holds the account's row FOR NO KEY UPDATE; the UPDATE takes one row lock on
  the account's own latest confirmed removal, in the same order the judge takes them (account, then removal).
- Tenant isolation: the opening is `hardware_key_opening_usable(actor, at)` with actor = `app_actor_id()`; no
  argument names an account or a removal, so a caller counts against its own opening only (SGN-30's fourth case).
- **Previous image running:** the previous web ignores the answer's rows, so a wrong code that reaches
  `hardware_key_record` (the judge said open and the code then changed: a race, or a caller that skipped the judge)
  would be treated as registered by the old web for that one request: the provider's key would stay with no row here,
  which opens nothing (a session needs a live `hardware_key` row). The new web is already on the WIP ref
  (`recorded()` in `apps/web/src/lib/auth/sign-in.ts` throws on no row and the key is removed at the provider, error
  code `registration_code_refused`), and web and migration ship in the one PR; the runbook's deploy order (migrate,
  then roll) leaves that one-request window only while old web tasks drain.
- Tests: SGN-30 (counts and answers no row, one refusal on record; shares five tries with the judge and the right
  code after a spent opening is refused; no code and no opening count nothing and the right code after one wrong
  still registers; another account's wrong code leaves this opening untouched). SGN-27's line that offered a wrong
  code to `hardware_key_record` and expected the raise is removed there (SGN-30 holds the rule). Web: SGN-30's half
  in `sign-in.db.test.ts` (no row is the refusal), green today.

## App side, built by W65 on the WIP ref (no migration needed; each test first)
- Change 2: `endedByReset` (`apps/web/src/lib/auth/sign-in.ts`) calls `provider_sign_out_unrecorded_reset` in a third
  transaction after two failures; the paging line gains `outcome_code` (`provider_sign_out_queued`, `_waiting`,
  `_not_queued`). The runbook has the step and the operator's function.
- Change 6: the worker reads the claim whole (`SELECT *`), so the fifth column arrives with the migration; the failed
  try's line carries `request_id` (the cause's); a failed step's line carries `sqlstate` (a new log field, five
  upper-case letters or digits from the error's code only).
- Change 7: **not from `refused()` with a pool, as section 7 sketched: a signed-in handler has no pool by design**
  (`SignedInServices`). `refused()` names the reason on its `InputError` and the routes' wrapper (`refusal()` in
  `apps/web/src/lib/http/invoke.ts`) calls `hardware_key_removal_refused` after the rollback, as the acting account,
  bounded by the request's lock timeout; a record that fails leaves the line `security event: a refused act on a key
  removal was not recorded` (IDs and the reason's code) and changes nothing the person reads.
- Change 5: above.

## W66: the rulings of 2026-11-13 04:55 UTC on review W65 (S6 (a), (b), (c); S4; N2; N4)
Session session_019i9ifAN8HwXxoQicPm7XvS. **The record is now `w66/apply-texts.py` (W65's script whole, then a block
"W66" of five exact old/new pairs) and `w66/migration.patch` (353 lines); `w65/` is kept and superseded. ONE command
applies every text of the item:** `python3 w66/apply-texts.py <copy of the migration> a1-trigger.sql.txt` prints
`applied`. The W66 pairs match the text W65's pairs leave, so they come after them; in the file's order they sit in
section 6 (S6 (a), inside A1's text), section 7 (N2, inside change 2's two functions) and section 9 (S6 (b)).
No new object: no new function, table, index, trigger, grant or reserved action, so **the preflight's lists, section
14's REVOKE and GRANTs, SEC-25's maps and the header's lists gain nothing from W66**. No COMMIT, BEGIN, ROLLBACK,
EXCEPTION WHEN OTHERS or lock_timeout. Safe to run again from the first line: as before (the preflight refuses; no
name added). Previous image running: it calls none of these functions (the registry is new in this release).

### S6 (a), section 6: `user_removal_target_holds` binds only while the request can still be confirmed
The EXISTS becomes `r.user_id = app_actor_id() AND r.state = 'requested' AND r.expires_at > clock_timestamp() AND
account_removes_keys(r.requested_by)`; the comment above the function and the message say so (the message now ends
"while the request can be confirmed"; the constraint name `hardware_key_removal_target_acts` is unchanged).
- **After the delta review (W66 S1, proved by its probe): a third condition.** Of one requester's requests that can
  still be confirmed against accounts that are platform administrators NOW, only the earliest (`(requested_at, id)`)
  binds its target (`AND NOT EXISTS (... e.requested_by = r.requested_by ... earlier ... target a platform
  administrator)`). Without it a requester holding B could also hold a member X asked against afterwards (requests
  against members are unlimited) once B promoted X to disable the requester: two held at once, which (b) counts only
  when a request is made. A target that is not a platform administrator can change no other account anyway (the
  "user" policy), so this narrows nothing for it. Test: SGN-31, "one requester binds one account at a time".
- The two conditions are the confirmation's own: `hardware_key_removal_confirm` refuses at `at >= expires_at` and
  refuses a requester who fails `account_removes_keys` (`hardware_key_removal_requester_left`). So the trigger binds
  exactly while a confirmation could still be accepted, by the clock and not by the expiry job's mark.
- Clock: `clock_timestamp()`, as every function of section 9 reads it (not `now()`, which is the transaction's start
  and would bind a long transaction past the expiry).
- Locks: none, as before. `account_removes_keys` is the STABLE definer already in section 5; it reads "user",
  membership, organization and audit_event with no lock. The trigger adds no edge to any wait graph.
- Residual, unchanged from A1: a request not yet committed when the target's statement takes its snapshot does not
  bind it. New, by design: `account_removes_keys` also fails for a requester with a `role_escalation` event in the
  last seven days or under seven days in the role; a requester could only have requested while passing it, and
  failing it later voids the confirmation too, so the trigger and the confirmation still agree.
- Tests: SGN-31 (a), three cases (the clock one minute either side of the expiry with the job not run; the
  requester's membership ended; the requester disabled by a third administrator) and (c) (the owner, no actor,
  disables the requester while the request stands).

### S6 (b), section 9: `hardware_key_removal_request` limits requests against a platform administrator
Three additions in the function and twelve comment lines above it:
1. `PERFORM pg_advisory_xact_lock(hashtextextended('hardware_key_removal_requester:' || actor::text, 0));` directly
   before the account's `FOR NO KEY UPDATE` (the form of `line_status:` and `document_use:` in earlier migrations).
2. After the lapsed requests of the target are marked and before the INSERT, only where the target holds a live
   `platform_admin` membership of an internal organization (what `app_actor_is_platform_admin()` reads, without its
   second-factor and status conditions, so the limit is never narrower than the power it bounds):
   - the requester's own cancelled request against this target decided inside seven days, or its expired one whose
     `expires_at` is inside seven days: 23514, constraint `hardware_key_removal_asked_again_too_soon`;
   - the requester's other request, state `requested` and `expires_at > at`, against another account that is a
     platform administrator now: 23514, constraint `hardware_key_removal_one_administrator_request`.
- The names are RAISE names, as `hardware_key_removal_target_acts` and `_requester_left` are; no table constraint.
- A live open request of anyone against the same target still fails on `hardware_key_removal_open_once` (23505).
- The seven days run from `expires_at` for an expired request (marked by the job, by this function or not at all:
  an unmarked lapsed request of the target is marked by this very call first, and the refusal then rolls the mark
  back; the job marks it) and from `decided_at` for a cancelled one, whoever cancelled it. A confirmed removal
  starts no wait.
- An open request already past its 24 hours does not count toward the one (it holds no one under (a)).
- **Locks.** The advisory lock is taken first, before any row lock, by this function only, on a key of the
  requester alone; it is held to the transaction's end. Order: advisory (requester), the target's "user" row FOR NO
  KEY UPDATE, the target's lapsed removal rows, the inserts. The confirmation and the cancel take the target's row
  and then the removal row and no advisory lock, so no cycle includes it. Two administrators requesting against each
  other hold different advisory keys and each the other's row; the inserts' foreign keys take FOR KEY SHARE, which
  does not wait on FOR NO KEY UPDATE (SGN-31's last case runs the two at once). Without the lock two requests of one
  requester against two administrators would each see none open and both insert (SGN-31's concurrency case: the
  second waits, then is refused). A waiting second request is bounded by the web's lock timeout (LOCK_TIMEOUT, busy).
- The two EXISTS read `hardware_key_removal` by `requested_by`, which has no index: the table holds one row a
  removal request, so no index is added (an index would be a new object in the preflight's list).
- Tests: SGN-31 (b), seven cases, and the two-administrator scenario, three cases; the web's case in
  `console-routes.db.test.ts` (the two refusals in the registry's words, nothing written).

### S6 (c): no text. The owner path is `app_actor_id() IS NOT NULL` in the trigger, unchanged; SGN-31 (c) tests it
and the runbook says when and by whom (docs/runbooks/incident-response.md, the hardware key section).

### N2, section 7: both sign-out functions store no trace ID rather than fail on one
First statement of `provider_sign_out_unrecorded_reset` and of `operator_provider_sign_out_request`:
`IF request !~ '^[A-Za-z0-9._:-]{1,128}$' THEN request := NULL; END IF;` (the pattern of `audit_event.request_id`
and of `provider_sign_out.request_id`, which are the same). A NULL argument stays NULL (`NULL !~ ...` is not true).
The audit row and the outbox row both carry NULL then. No lock, no list. Test: SGN-28's new case (an over-long ID,
one with spaces, an empty one, by both doors; a fitting one kept; none at all accepted).

### S4 and N4: tests only, no text
- S4: `sign-in.db.test.ts`, describe "SGN-30: the count of a wrong code refused at the registry's row is committed
  when the web then refuses": a real removal and opening, the right code judged open, a wrong digest swapped in on
  its way to `hardware_key_record`. With the texts: `registration_code_tries` is 1 and one `key_registration_refused`
  after the web answered `key_not_registered`; the key is gone from the provider twin; the right code then still
  registers. So change 5's count commits when the web throws, and **nothing must change in `recorded()`**. Owed red
  on the WIP (0 tries: today's function raises and rolls back).
- N4: one more assertion (the trigger's row from the unrecorded reset has `next_attempt_at = queued_at`); the
  operator's was W65's.

### Proof (PostgreSQL 18 on 5433, Node 24; a scratch worktree of the WIP with the migration patched by the script)
See the status file's RESUME-BLOCK for the counts of the whole `pnpm test:db`.

## Not done
The header comment's lists in the migration (by hand in the typed command). Everything in the status file's "Left".
