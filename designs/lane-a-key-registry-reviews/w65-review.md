# W65 review: tenant isolation and the two-person rule (adversarial, texts only)

Reviewed 2026-11-13: `w64-migration-texts.md`, `w65/migration.patch` (whole), `a1-trigger.sql.txt`, and the owed-red
describes in `provider-sign-out.db.test.ts` (SGN-28, JOB-09, JOB-07) and `key-registry.db.test.ts` (SGN-24, SGN-29,
SEC-28, SGN-30). The migration file, the web and the worker were NOT read. Nothing was run.
Count: BLOCKER 0, SHOULD-FIX 6, NOTE 6.

## SHOULD-FIX

### S1. The "one already waits" guard can leave a LATER reset's sign-out untried, or an hour late
Text: section 2; `provider_sign_out_unrecorded_reset` and `operator_provider_sign_out_request`, the guard
`... AND p.done_at IS NULL AND p.gave_up_at IS NULL AND p.leased_until IS NULL) THEN RETURN false / NULL`.
The guard's premise ("that try is still ahead and covers this call too") holds for an untried row. It does not hold
for a row that has failed: a failed try clears the lease, so the row "waits with no lease" while backed off.
Scenario A (never tried for its cause):
1. Account U, reset 1 unrecorded at T0: row R queued. The provider fails; R reaches attempts = 5, lease NULL,
   `next_attempt_at` = now + 60 min, `queued_at` = T0.
2. At T0 + 23 h 59 min, U's reset 2 completes at the provider and is unrecorded; the web calls the function.
   R matches the guard: returns false (`provider_sign_out_waiting`). Nothing is queued.
3. One minute later the sweep gives R up (attempts >= 1, 24 hours, no lease). R is never claimed again.
   Result: the sign-out owed for reset 2 was given up with no try after its cause; the web calls only once.
   The GAVE_UP page is the only net, and it reads as reset 1's.
Scenario B (delay): same, R at attempts >= 4 at any age: reset 2's sign-out waits up to 60 minutes where a new row
would be claimed at once. The operator's function answers NULL to a person in an incident for the same reason.
Smallest change (both functions): count a waiting row only when its try is truly near and it cannot be given up
first, e.g. add `AND p.next_attempt_at <= now() + interval '5 minutes' AND p.queued_at > now() - interval '23 hours'`.
Flood stays bounded: the new row itself is then the waiting row (attempts 0, due now), and another can be added only
after it too has failed three times. Test: SGN-28 case 2 gains "a waiting row at attempts 5 with next_attempt_at an
hour ahead, or queued 23 h 59 min ago, does not hold back a new call" (today's case 2 only covers the leased row).

### S2. "Never given up untried" is true of the counter, not of the provider: a claim with no answer counts
Text: section 3; `(p.attempts >= 1 AND p.queued_at <= now() - interval '24 hours')`; the claim counts the try.
Scenario: after a day's outage row R (25 h old, attempts 0) is claimed (attempts = 1, lease 2 min). The worker task
is stopped before the provider call (a rolling deploy, the task killed, the provider client failing to build). No
`_failed`, no `_done`. Two minutes later the sweep gives R up. No request ever reached the provider. During the
deploy that ends an outage this is the likely shape, for every row in flight.
JOB-09 case 2 asserts exactly this as wanted (`inFlight`: attempts 1, lease lapsed, GAVE_UP), so no test would
catch it; section 3 says "failed, or its lease lapsed with no answer" on purpose. It contradicts the stated why
("giving up a sign-out never attempted leaves alive a provider session").
Smallest change: by age require an answered try. If `operator_provider_sign_out_failed` stores its failure (a
last-error or last-failed column; not visible to me), use `<that column> IS NOT NULL`; otherwise `p.attempts >= 2`
(a lapsed claim is retried once; a row that kills its worker is still given up at its second lapse). Reword
JOB-09 case 2's `inFlight` lines accordingly.

### S3. An untried row is paged LATE once and can then wait silently for ever
Text: section 3, "A row with attempts = 0 is never given up ... LATE and paged (once, then acknowledged)".
Scenario: the sweep runs but claims do not (the claim job is disabled, crashes before its claim, or is held by a
config fault, while the sweep job runs on its own schedule). Row R: LATE at 15 minutes; a person acknowledges
(`operator_provider_sign_out_reported(R, 'LATE')`). From then on R has attempts 0, so it is never GAVE_UP, never
LATE again, never expired ("never an undone row"): no line, no audit row, the provider session alive. Before this
change such a row had no line at all; now it has exactly one. JOB-09 case 2 asserts "LATE on every sweep" only
WITHOUT an acknowledgement, so it does not see this.
Smallest change, in the sweep before the RETURN QUERY: re-arm the line for a row still untried a day after its
last acknowledgement: `UPDATE provider_sign_out p SET late_reported_at = NULL WHERE p.done_at IS NULL AND
p.gave_up_at IS NULL AND p.attempts = 0 AND p.late_reported_at <= now() - interval '24 hours'` (or a third code,
UNTRIED, with its own reported mark). Test: acknowledge, age 24 hours, expect `['LATE']` again.

### S4. Change 5's count commits only if the web does not throw inside the same transaction (not proved here)
Text: section 5, "`recorded()` ... throws on no row"; SGN-30 case 1 "the count is committed".
SGN-30 proves the commit in the helper's shape only (`recordKey` returns the empty answer and its transaction
commits). If `recorded()` throws inside the `withActor` callback that ran `hardware_key_record`, the transaction
rolls back, `registration_code_tries` stays where it was and the security event is lost: the function is again an
uncounted oracle, and the refusal now looks counted. I could not read `sign-in.ts`; section 5 says the web half
asserts only "no row is the refusal".
Smallest change: a line in the web's SGN-30 half (`sign-in.db.test.ts`) that reads `registration_code_tries` as
the owner AFTER the web path refused a wrong code and expects 1, and one `key_registration_refused` row. If it is
red, the throw moves outside the transaction.

### S5. The judge with a code and no beginning: now no count AND no record; no test says it cannot confirm a code
Text: section 4, `IF began IS NULL THEN RETURN 'refused'; END IF;` "after the counting block, which a NULL began
already skips". SGN-29 tests `(code NULL, began NULL)` only.
Scenario (depends on text I could not see): a caller offers `judge(code, NULL, request)`. A wrong code is not
counted (skipped by NULL began) and after this change leaves no security event either. If the lines above answer
anything other than 'refused' for the RIGHT code with a NULL began, that call shape is a free, silent oracle for
the code, 2^n guesses with no fifth-try limit.
Smallest change: a test, `judge(secret, null)` is 'refused' with tries 0, and `judge(wrong, null)` is 'refused'
with tries 0; if the first is not 'refused', move the early return above the comparison. Alternatively narrow
the early return to `began IS NULL AND code_sha256 IS NULL` so a code without a beginning still leaves its event.

### S6. The trigger lets a requester make itself undisableable by its targets; a bound account is bound past 24 hours
Text: `a1-trigger.sql.txt`, the EXISTS on `r.user_id = app_actor_id() AND r.state = 'requested'`.
Scenario: platform administrators A (compromised) and B (the only other one). A calls
`hardware_key_removal_request` for B. Until the request is decided B can change no other account's status: B
cannot disable A in the console. B cannot decide the request (the cancel in SGN-24 is the requester's; a third
administrator does not exist). The request stays 'requested' until the expiry job marks it ("past its 24 hours and
not yet marked, the request still binds"), so a stalled job extends it, and nothing visible to me stops A asking
again after expiry. With three administrators, A requests against both others if one requester may hold two
requests (not visible). SGN-24's "unrelated administrator" case also shows that disabling the requester leaves the
state 'requested', so the target stays bound after the requester is gone.
This is the ruling's rule working as written; what is missing is its other side. Smallest changes, any of:
(a) in the trigger, bind only while the request can still be confirmed: add `AND r.expires_at > now()` and
`AND account_removes_keys(r.requested_by)` (names assumed) so a lapsed or requester-less request binds no one;
(b) a test that one requester cannot hold 'requested' removals on two accounts, and cannot re-request the same
account within a period after an expiry; (c) the runbook's break-glass line: the owner path (no actor) is not
bound. (a) costs nothing the ruling wanted: a request that cannot be confirmed protects no one.

## NOTE

N1. Two concurrent `provider_sign_out_unrecorded_reset` calls for one account both pass the guard (no lock, READ
COMMITTED) and queue two rows. Bounded by concurrency, harmless (two sign-outs). A
`pg_advisory_xact_lock(hashtextextended(actor::text, 0))` would close it without touching the account's row; not
needed for safety. The same for `hardware_key_removal_refused` (two rows in one hour).

N2. The last-resort door fails on its trace ID: `provider_sign_out.request_id` has
`CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$')`. If `request` can carry anything else (a forwarded header, a
longer ID), the call raises 23514 and nothing is queued. Assumption: request IDs are minted by the app in that
shape. Cheap hardening: store NULL when the argument does not match, in both functions.

N3. `hardware_key_removal_refused`: the hour's guard means one deliberate, harmless refusal hides the COUNT of the
same account's later probes of that reason for an hour (1 and 500 look alike; at most 24 rows a day a reason). It
cannot hide that the account probed, cannot cross reasons or accounts, and names no target, so little is lost;
but an alarm on these rows can never see intensity. If that matters, the web's refusal line (IDs, reason code)
must be the counted signal; say so in the runbook. `why` is the caller's word, not checked against a real refusal:
the web can write any of the four about the acting account, never about another.

N4. "Oldest first" rests on a fact no test asserts: that both doors insert `next_attempt_at = queued_at`. JOB-09
case 3 sets `next_attempt_at` by hand beside `queued_at`; case 1 rewinds `queued_at` alone and then sets
`next_attempt_at = now()` by hand. Add one assertion on a fresh row from the trigger and from the operator's
function (`next_attempt_at = queued_at`). Given that, the argument is sound: every write to `next_attempt_at` is
now or later, so no row can be given a due time ahead of an untried row's; I found no starvation in the order.
`id` is a random tie-break only.

N5. One try and out after an outage: every row over 24 hours old that meets a throttled or flaky provider on its
first try is given up at the next sweep. Section 3 says this plainly; the founder should read it as "a provider
that throttles the backlog turns the whole backlog into GAVE_UP pages for a person to work by hand".

N6. SGN-24 leaves two things unasserted. (i) A bound account calling a SECURITY DEFINER door that changes ANOTHER
account's status or hardware-key rule is refused too (the trigger fires inside the function, the actor is the
caller): if `hardware_key_removal_confirm` or `hardware_key_registration_open` touches either column of the
target, an administrator who is itself the target of a request can confirm nothing. The trigger file says the
confirmation moves `sign_in_not_before` only; a test "a bound administrator still confirms another removal" would
hold it. (ii) The WHEN list is status and hardware_key_required only. If tp_app's column grants let a platform
administrator write another account's `locked_at`, `sign_in_not_before` or `email`, the bound target can still
stop the requester or the confirmer signing in. One test: the bound target's UPDATE of each such column on another
account is refused (by grant or by trigger).

## Checked and found sound
- Tenant isolation of every new tp_app door: `provider_sign_out_unrecorded_reset`, `hardware_key_removal_refused`
  and the changed `hardware_key_record` take no account, removal or practice argument; the subject is
  `app_actor_id()` and must be an existing account. One account's call cannot queue, suppress or delay another's:
  the guard is keyed on `p.user_id = actor`. (tp_app sets the actor itself; a compromised web can act as anyone
  through any door, which these texts do not change.)
- The reserved action: tp_app cannot write `password_reset_unrecorded` itself (policy list, SGN-28 case 3); the
  operator's audit row is actor_kind system, so the widened trigger does not also fire for it (no double row).
- Outbox flood by tp_app: at most one new row per claim of the previous one; a lapsed lease does not open a
  flood, because the newly queued row is itself the waiting row.
- Change 5: wrong guesses are counted on every path that compares the code; the two raises left compare nothing.
  A right code that then fails on `hardware_key_credential_once` confirms only a right code. Tries are spent only
  by whoever acts as that account at the step (already true of the judge): no new way to burn an opening. Right
  code at tries < 5 registers; a wrong code inserts nothing (the `RETURN` is before the INSERT). Lock order
  account then removal matches the judge, confirm, cancel and request: no new cycle.
- The trigger takes no lock and adds no wait edge; own-row changes, a NULL actor (owner, jobs), mark moves and
  membership ends do not enter it; fires between `user_guarded_columns` and `user_updated_at` as said.
- Sweep: GAVE_UP needs attempts >= 1 or 30 and no running lease; LATE by age takes only a row lock per row; a
  given-up row is not claimable and a new call then queues (the guard excludes `gave_up_at`).
- Previous image: the claim's fifth column is additive; the judge's answer for (NULL, NULL) is unchanged; the old
  web's one-request window in section 5 is as described, on the stated assumption that a session needs a live key row.
- Re-run: the preflight covers `user_removal_target_holds` and `provider_sign_out_unrecorded_reset` by name and
  the other two by its LIKE patterns; the added text has no COMMIT, transaction BEGIN, ROLLBACK, EXCEPTION block
  or lock_timeout; the trigger's standalone REVOKE is folded into section 14; REVOKE and GRANT lists carry all four.

## Assumptions (not seen)
`app_actor_id`, `hardware_key_opening_usable`, the claim and the failed-try backoff are as given in the brief.
The queueing trigger function inserts `next_attempt_at = queued_at`. The migration runs in one transaction. An
owner-side policy lets the SECURITY DEFINER functions write `audit_event` and read `hardware_key_removal` under
FORCE RLS (the proof run implies it). The confirmation changes neither status nor hardware_key_required of the
target. The web calls `provider_sign_out_unrecorded_reset` once per failed reset. Column names `expires_at`,
`requested_by`, `late_reported_at` are taken from the tests or guessed where marked.
