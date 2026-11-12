# Review (delta 1): the fix round of `designs/lane-a-key-registry.md` (v2)

2026-11-12. Adversarial review of section 15's changes only.

**Scope.** Are the two blocking findings (auth A1, database D1) closed, and did any section-15 change open something
new. A1 is judged under the orchestrator's rulings Q3 = YES (registration after a removal stays closed until a
platform administrator opens it for one hour) and Q1 = YES (seven days in the role).

**Read.** The note v2 (sections 0 to 8, 9.3, 10's test list, 12 to 15) and the v1 to v2 delta
(`git diff eb3ba0f2 a795f0d6`). On the base 93e137f9: `apps/web/src/lib/auth/sign-in.ts` (425 to 458, 694 to 750),
`apps/web/src/lib/routes/console.ts` (771 to 797), `settings.ts` (1045 to 1112), and in `packages/db/migrations`:
`20261015140000_tenancy.sql` (60 to 74, 343 to 357, 599 to 603), `20261015180000_tenancy_hardening.sql` (100 to 161),
`20261015170000_identity_and_permissions.sql` (209 to 223, 484 to 485), `20261112090000_sign_in_not_before.sql`
(176 to 219, 379). A grep of `apps/` and `packages/` for every writer of `membership.ends_at` and `membership_ended`.

**Run.** Nothing. No PostgreSQL server answered on port 5433 (a stale socket file, connection refused), and none was
started. Every finding below rests on the note's text or on the base's code as cited; none rests on an unverified
PostgreSQL behaviour. The two outbox findings (R5, R6) are arithmetic on the note's own rules and should be the first
things JOB-07 proves on a server.

**Checked and found sound (no finding).**

- D5 and the raising `membership_ended` trigger break no writer on the base. Only two statements end a membership
  from the application (`console.ts:782`, `settings.ts:1102`), both `ends_at = now()` in the wrapper's transaction;
  the tests that end one directly use the owner and write no `membership_ended` row; `tenant-world.ts:77` inserts
  ended memberships and no trigger of the note fires on INSERT. `created_at` cannot be set by the application role
  (`tenancy.sql:602`), so `created_at < now()` cannot be forged from there.
- The seven-day predicate is not evaded by demote-then-promote, by a new row, or by reviving an old row.
  `membership_security_events` (`tenancy_hardening.sql:149-161`) writes `role_escalation` with the membership as its
  object on every INSERT and every change of `role` of a live membership in an internal organization; an ended
  membership can never change again (`membership_rules`, lines 117 to 120). One correction of the note's reason, see
  R11.
- Lock order. `membership_end_marks_account` takes membership row then account row; the confirmation, the request and
  a reset take the account row and read `membership` without a lock. On the code read, nothing on the base takes an
  account row and then a membership row lock, so no cycle was found. The base's first statement of End membership
  does not run `assert_membership_fits_user` (the row is ended), so no advisory lock is in the path. The note's own
  open point (a lock at commit in `assert_organization_keeps_administrator`) stays the one thing to prove.
- `started_at` is the database's (`identity_and_permissions.sql:216`, not in the application role's INSERT columns,
  line 484), so the 15 minutes cannot be backdated by the caller.
- The clock rule and `CHECK (expires_at = requested_at + interval '24 hours')` agree as long as one reading is
  written to both columns (R10 names the two places the text contradicts that).
- The cleaning rule (removed rows, and unknown credentials older than 15 minutes): no new hole found. Under Q3 = YES
  it will also run for whoever holds the password and code of a closed account; what it deletes is already dead.

---

## Findings

### R1. Blocking. A second key registered beside the first is silent, so A1's detection can be walked around (sections 2, 4.1, 10 SGN-27)

**Evidence.** Section 4.1, `hardware_key_record`: it refuses a start at or before the mark, an eleventh live key and
a known digest. It does not refuse an account that already holds a live key. The notice and the security event are
written only "when the account has a confirmed removal and no key registered since"; SGN-27 pins it: "the first key
after a removal writes the event and the second notice, the second key does not". On the base a `register_key`
pending step is all a caller needs (`sign-in.ts:445-448`, `665-679`), and nothing ends a pending step when another
registration lands (a registration moves no mark).

**Scenario.** After a removal the member and a thief who holds the password and code both pass the code step within
the same 15 minutes; both hold a `register_key` step that began after the mark. The member registers first: one
notice, one event, which the member expects. The thief completes second: a live row, no notice, no event, no page.
The thief now holds a live key on the account, and the member has been told everything is in order. Under Q3 = YES
the same happens inside the open hour unless the opening is consumed (R2).

**Smallest fix.** In 4.1: `hardware_key_record` refuses, under the account's lock, when the account already holds a
live key (constraint name `hardware_key_first_at_sign_in`); no route on the base registers a key from inside a
session, so the ten-key ceiling has no caller yet and an in-session "add a key" gets its own function when it is
built. Change SGN-27's line to "the second registration is refused and removed at the provider with the grant".

### R2. Blocking for the "yes" build. The opening is described as one column, one function and one refusal; six rules are missing (section 12 Q3, 4.1, 6)

**Evidence.** Section 12: "yes adds `"user".key_registration_open_until`, a function
`hardware_key_registration_open(target_user, request)` under the same actor checks as a removal's request, and one
refusal in `hardware_key_record`". The note says it "is written for no". A fresh session building from the file
alone has nothing else.

**Scenarios, one for each missing rule.**

1. *Opened before it is closed.* An administrator opens registration for an account that has no confirmed removal
   (nothing refuses that). A removal is confirmed 20 minutes later. The window is still open for 40 minutes: the
   removal closed nothing.
2. *Not cleared by a second removal.* Opened at 10:00; the member reports at 10:10 that the call was not theirs; two
   administrators confirm a second removal at 10:20. The column still says 11:00.
3. *Not consumed.* The member registers at 10:05; the window stays open until 11:00 for anyone holding the password
   and code (with R1, a second key).
4. *What "closed" means.* If closed is read from the column alone (NULL or past), every account that never had a
   removal is closed at the deploy and no one can register: staff cannot sign in. If it is read as "open unless
   closed", the note must say what closes.
5. *Where the refusal sits.* With the refusal only in `hardware_key_record`, the provider has already registered the
   credential (`sign-in.ts:672` runs before `keyRegistered`), and the base's path for a registration it then refuses
   can end in ADR 0093 D6's account lock when the grant can no longer remove the key (`sign-in.ts:719-739`).
6. *No record.* A bare timestamp holds neither who opened nor for which removal; no CHECK can keep the account from
   opening itself, and the action is not in section 4.4's reserved list.

**Smallest fix.** One paragraph in section 6 and one row in 4.1 and 4.4:

- **Closed is derived, not stored:** registration is closed when the account has a confirmed removal and no
  `hardware_key` row registered after that removal's `decided_at`. An account with no confirmed removal is open
  (the deploy, a first enrolment). An account confirmed with zero keys is closed.
- **`hardware_key_registration_open`** refuses unless the account is closed in that sense; refuses the account
  itself (`target_user <> app_actor_id()`, and a CHECK); locks the account row first; writes
  `opened_by`, `opened_at` (one clock reading) and the removal's ID on the removal row (or a small table), with
  `CHECK (open_until = opened_at + interval '1 hour')`; writes the reserved audit action
  `hardware_key_registration_opened` and one `hardware_key_notice` row of a third kind (`registration_opened`).
- **It is cleared** by `hardware_key_removal_confirm`, by `membership_end_marks_account` and by a recorded reset, in
  the statement that moves the mark; the simplest form is "open only while `opened_at > sign_in_not_before`", so
  every mover of the mark closes it with no second statement.
- **It is consumed** by the first `hardware_key_record` that succeeds, in that transaction.
- **It is judged twice:** by a reader the flow calls before `beginKeyRegistration` (so the provider is never asked
  while closed, and the D6 lock is never reached by a closed account), and by `hardware_key_record` under the lock.
- One opener is enough against the threat A1 names (the opener must already pass the seven days and the 15-minute
  key rule); the note should say that it is one person by decision, and that the runbook has the opener call the
  member back on a channel already held, since a caller who holds the password and code is the person most likely
  to ask for it.

### R3. Should fix. Under "yes" the thief does not need to be first; they need to be first within the hour, and the sign-in tells them when (section 12 Q3)

**Evidence.** On the base a password-and-code sign-in of an account that must hold a key answers either the
`register_key` step or a refusal (`sign-in.ts:445-451`). Under "yes" the closed answer and the open answer differ by
construction.

**Scenario.** The thief signs in with the password and code every few minutes. Each try is refused while closed.
The administrator opens at 10:00 while on the phone with the member; the thief's 10:01 try gets the registration
step and registers before the member has found their key. The member's own try is then refused (a key is required
and exists), and the `registered_after_removal` notice arrives: detection is sound and fast, but the thief already
holds a key session, and undoing it needs two administrators again.

**Smallest fix, in order of strength.**

1. A one-time code: `hardware_key_registration_open` returns eight characters shown once to the administrator, who
   reads them to the member; the digest is stored, five wrong tries close the opening, and `hardware_key_record`
   (and the reader before the provider is asked) takes the code. The closed and the open screens are then the same
   screen ("enter the code PaidWhole gave you"), so there is no signal to poll, and the password and code alone no
   longer register a key. This is the only form that closes the hour.
2. If the code is not built: every password-and-code sign-in that reaches a closed registration writes one security
   event (`key_registration_closed_tried`, once an hour, as `sign_in_key_refused` does), the opening function
   answers the count of those since the removal so the opener sees them before opening, and the window is 10
   minutes, not 60. Section 12's item 7 then says to the founder that the hour is narrowed, not closed.

### R4. Should fix. Under "yes" the closure holds a registration in Postgres and a session only in the flow (section 14, 4.3)

**Evidence.** Section 14 records for the queue "refusing in Postgres a password-and-code session for an account
that must hold a key (today the flow's rule only)". The flow's rule is `sign-in.ts:445`. `hardware_key_required`
can be changed at the database by any one platform administrator (`user_guarded_columns`, `tenancy.sql:346-357`;
the application role holds UPDATE on it, line 599).

**Scenario.** Two administrators remove an account's keys; registration is closed. Whatever lowers
`hardware_key_required` for that account (one administrator through a future route, or one statement as the
application role) lets its password and code open a full `totp` session. The two-person removal and the closed
registration are both undone by one actor and no key was ever registered, so none of the note's notices or pages
fires.

**Smallest fix.** Move section 14's item into this PR: `user_session_hardware_key` loses its WHEN clause's
restriction and refuses a non-`webauthn` insert for an account that is closed in R2's sense (a confirmed removal,
no key since), whatever `hardware_key_required` says. It adds no lock that `user_session_sign_in_not_before` does
not already take for the same row (`sign_in_not_before.sql:207`). The previous image obeys the same flow rule, so
9.3 is unchanged.

### R5. Should fix (D1's residue). A row whose worker dies on every try is not paged `LATE` at about 8 minutes; it may not page until `GAVE_UP` (sections 4.2, 7, 10 JOB-07)

**Evidence.** Section 7: the run does the sign-outs first and the sweep second; the claim takes a row "with no lease
or a lapsed one" and does not move `next_attempt_at`; the sweep acts only "on rows whose lease is not running".
Section 7 then says "a row dying on every try is late after about 8 minutes of leases", and JOB-07 says it "is paged
`LATE` and `GAVE_UP` by the sweep alone".

**Scenario.** The row kills the worker during its call. Run at minute 0: step 1 claims it (try 1, lease to 2:00),
the process dies, step 2 never runs. Minute 1: the lease is running, so the claim skips it and so does the sweep.
Minute 2 or 3: the lease has lapsed, and step 1, which runs first, claims it again and dies. The row is never both
unleased and seen by step 2, except when the lease happens to lapse during step 1 of a run that survives. So
`late_at` is set by luck, and the first certain page is `GAVE_UP`, after the thirtieth lease has lapsed: 60 to 90
minutes, not 8. Because the claim leaves `next_attempt_at` at its old value, that row is also first in the claim's
order every time it is claimable, and the runs it kills do no other row's sweep or line.

**Smallest fix.** In 4.2 and 7: the late arm of the sweep does not look at the lease once a fifth claim exists:
late is `attempts >= 5`, or `attempts >= 4` with no running lease. And the claim sets `next_attempt_at` to the
lease's end, so a row that never answers goes to the back of the order and the due index stays true. Correct
section 7's "about 8 minutes" to the figure that follows (the fifth claim, about 8 to 12 minutes) and "about an
hour" to "60 to 90 minutes". JOB-07's case then asserts `LATE` before the sixth claim with the sweep running second.

### R6. Should fix (D1's residue). The 24-hour arm gives up rows that were never tried, and nothing ever tries a given-up row again (sections 4.2, 7)

**Evidence.** Section 4.2: the sweep "sets `gave_up_at` ... on an undone row with `attempts >= 30` or `queued_at` 24
hours old". Section 7: the claim takes rows "not given up". Step 1 stops claiming after 8 seconds of provider time.
No function in 4.2 clears `gave_up_at`, and both runtime roles are closed out of the table.

**Scenario.** The worker is down for a day (or the schedule is paused through a long incident). Forty rows wait with
`attempts = 0`. At the first run back, step 1 reaches some of them in its 8 seconds; step 2 then gives up every
other row older than 24 hours, each with no try at all, and writes `provider_sign_out_undelivered` for an account
the provider was never asked about. The claim never takes them again. The note's own statement of the effect ("the
provider was asked at least once after the cause committed") is false for those rows, and the only way back is
break-glass. The same happens to the tail of a large backlog while the provider is down: with a 10 second abort and
an 8 second budget, a run reaches one row.

**Smallest fix.** The 24-hour arm requires `attempts >= 4` (a row that has had its four spaced tries); `attempts >=
30` stays as it is. Add to 4.2 one operator function, `operator_provider_sign_out_retry(sign_out, request)`, that
clears `gave_up_at` and resets `next_attempt_at` on an undone row and writes an audit row, so the runbook's answer to
`GAVE_UP` is not break-glass. JOB-07 gains: a row queued 25 hours ago with no try is claimed, not given up.

### R7. Note. Four small things the outbox's text leaves to the builder (sections 3.4, 4.2, 7)

- A row can be both late and given up with neither line acknowledged (R6's scenario). 4.2 gives
  `operator_provider_sign_outs_overdue` one `code` a row; say that it returns one row for each unacknowledged code.
- `done` on a given-up row leaves the audit trail saying `provider_sign_out_undelivered` and then
  `provider_signed_out` for one cause, each once. That is right, but the `GAVE_UP` line still pages (it is returned
  until acknowledged). Say in the runbook that the later row supersedes, and in 4.2 that the two audit rows are each
  written from the `RETURNING` of the UPDATE that set the mark, which is what makes each exactly once under two
  overlapping runs.
- `operator_provider_sign_outs_expire` "never an undone row": given-up rows are then kept for ever. Say so, or
  expire a given-up row 90 days after `gave_up_reported_at`.
- `failed` on a given-up row with a matching `try` still moves `next_attempt_at`. Harmless (the claim skips given-up
  rows); with R6's retry function it stops being harmless, so `failed` should also require `gave_up_at IS NULL` or
  the retry function should set `next_attempt_at` itself (as proposed).

### R8. Should fix. A4's exception keeps the request alive but not a confirmer, and it is looser than its reason (section 6, confirm step 5)

**Evidence.** Section 6 step 5: when the requester's membership "was ended by the account under removal ... the
request stands". Confirm step 1 still requires the confirmer to pass `account_removes_keys`. The console's End
membership takes any membership ID and refuses no one (`console.ts:771-787`).

**Scenario 1 (not closed).** A thief inside platform administrator X sees a removal requested (X's sessions still
work until the confirmation). X ends the requester's membership: the request stands, as designed. X also ends the
membership of every other platform administrator. No account now passes step 1, the request expires in 24 hours,
and X keeps its keys and its role. The exception answered the one lever the auth review named, not the lever.

**Scenario 2 (looser than its reason).** The exception as written replaces the whole predicate for the requester.
A requester who was disabled, or lost enrolment, for cause at 09:00, and whose membership X then ends at 09:05,
"stands", although the request was already void at 09:00.

**Smallest fix.** Replace the exception by a refusal at the source, in the trigger this PR already puts on
`membership`: an account that is the target of a `requested` removal cannot end a membership of an internal
organization (`check_violation`, `hardware_key_removal_target_acts`), evaluated with `app_actor_id()` in
`membership_end_marks_account` before it moves the mark. Step 5 then has no exception, the read of `membership`
there needs no special case, and SGN-24's "a requester whose membership the target ended does not void" becomes
"the target of an open request cannot end an internal membership". If the exception is kept instead, narrow it: it
excuses only the missing membership, and the requester must still be `active` and `mfa_enrolled`, and the ended
membership must be the `platform_admin` one. That a thief can end the other administrators before any request
exists is outside this item; record it for the queue (a second person for End membership in the internal
organization).

### R9. Should fix. `actor_signed_in_with_key_lately()` accepts sessions that prove less than the note says (section 4)

**Evidence.** Section 4: "a live `user_session` of the actor with `mfa_method = 'webauthn'` and `started_at` within
15 minutes", and "the function cannot know which session is calling". Section 4.3: a `webauthn` insert with no
digest is let through for an account the registry has never touched.

**Scenarios.**

1. *The deploy.* For the 15 minutes after the migration, and for as long as the previous image serves sign-ins, an
   administrator's `webauthn` session with no digest (a key the registry has never seen) satisfies the predicate.
   With Q1 = YES this needs two such administrators, so it is narrow, but the predicate is then not "signed in with
   a registered key".
2. *A stolen cookie waits for its owner.* A thief holds an administrator's session cookie from 09:00. At 14:00 the
   administrator signs in again with their key on their own machine. For 15 minutes the thief's old session passes
   the predicate, because the account holds a fresh one. The 12-hour cookie the fix set out to exclude is excluded
   only while its owner stays away.
3. *The key registered a minute ago.* Under "yes", a thief who wins R3's race on an administrator's account signs in
   with the new key and at once passes the predicate: they can open registration for other accounts and request or
   confirm removals (the seven days measure the membership, which is old).

**Smallest fix.** The predicate requires `key_credential_sha256 IS NOT NULL` and a live `hardware_key` row of the
actor with that digest (closes 1). The wrapper sets `app.session_id` beside `app.actor_id` and the predicate reads
that one session, not any session of the account; the application role is already trusted for the actor, so this
adds no new trust (closes 2). The joined key's `registered_at` must be more than 24 hours old when the account has
a confirmed removal before it (closes 3, and gives the member's notice time to be read). SGN-23 gains the three
cases.

### R10. Note. Two places where the text contradicts section 4's clock rule (sections 3.2, 6)

- Section 6, confirm step 2: "read `clock_timestamp()` once into `at`; every time below is `at`". Step 6 then
  writes `removed_at = clock_timestamp()` and `GREATEST(sign_in_not_before, clock_timestamp())`. Built as written,
  `hardware_key.removed_at` is later than the removal's `decided_at`, and R2's "no key registered since the removal"
  and "opened after the mark" comparisons are made against three different instants. Write `at` in all three.
- Section 6, request: no step reads the clock once, and 3.2's table gives `requested_at` the rule
  `clock_timestamp()`. A builder who writes `requested_at = clock_timestamp(), expires_at = clock_timestamp() +
  interval '24 hours'` fails `CHECK (expires_at = requested_at + interval '24 hours')` on almost every insert. Add
  "read once into `at`, after the lock" as the request's step 3b, and say which clock
  `operator_key_removals_expire` uses (it is not one of "the outbox's short functions").

### R11. Note. A2's stated reason is wrong for the internal organization; the predicate is still right (section 4)

**Evidence.** Section 4: "a role is changed in place (`settings.ts`, `UPDATE membership SET role`...)". That route's
input is a closed list with no internal role (`settings.ts:1052`), so no route can promote to or demote from
`platform_admin`; only the grant (`tenancy.sql:603`) allows it. The second half of the predicate is right to stay,
because the application role can do it at the database. Correct the sentence so ADR 0095 does not record a route
that does not exist, and so nobody later removes the check "because the route was removed".

Also worth one line in the ADR: the seven days measure the membership row, not the person's hold on the account. A
membership created eight days ago whose invitation is accepted today passes at once. If that is not wanted, add
"and the account's own live key is more than seven days old" (the registry now has `registered_at`), which also
covers R9's third case.

---

## Verdicts

**A1: not closed by v2 as written; closed under "yes" once R1 and R2 are in the note, with R3 as the stated
remainder.** v2 only narrows A1 (it says so), and R1 shows the narrowing's detection can be bypassed by registering
second. Under Q3 = YES the base helps: an account that must hold a key and has none gets no session from its
password and code, only the registration step (`sign-in.ts:445-451`), so a closed registration leaves that holder
with no power at all. That holds provided the six rules of R2 are written down (derived closure, no opening before
a removal, cleared by every mover of the mark, consumed once, judged before the provider is asked, a record with
its CHECK and reserved action), R1's "no second key" is in `hardware_key_record`, and R4 puts the session refusal in
Postgres. What stays open is the hour itself: whoever holds the password and code can poll for the opening and
register first; it is detected within minutes (the member's own refusal and the second notice) but not prevented
unless R3's one-time code is built. The deploy-time and first-enrolment registrations stay open by design and are
bounded only by 9.3's runbook step.

**D1: closed as the blocking finding; two residues to fix before the build.** Every row now ends: the claim counts
the try and never touches a row at 30, a row at 30 is given up by the sweep once its lease lapses, `attempts`
cannot pass its CHECK, a stale worker's `done` and `failed` change nothing, and each of the two audit rows is
written once. `late` "at the fourth failed try" (JOB-07) and the sweep's `attempts >= 4` on an unleased row agree
for a row that fails normally. They do not agree for the very case D1 was about: a row whose worker dies is not
reliably paged `LATE` (R5), and the 24-hour arm gives up rows that had no try, with no way to try them again (R6).
Neither loses a row silently (each ends in a `GAVE_UP` page), which is why D1 is closed and these are should-fix.
