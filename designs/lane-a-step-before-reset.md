# Design: a sign-in step begun before a password reset is refused after it (`co-001/step-before-reset`)

W8 (Lane A), 2026-11-11. `LANES.md` Queues item 28; required before launch. ADR 0093; test matrix SGN-17 (the rule)
and SGN-18 (a reset whose answer was lost, taken into this item by the orchestrator's ruling of 06:49 UTC). Source:
password-changed-notice's security review, its SEC-01 against ADR 0091 D10; ADR 0081, "Not covered"; the schema plan's
SEC-N5. Stacked on `co-001/password-changed-notice` (ffa44ea9, its fix round).

**Status: v2**, after two adversarial reviews of v1 (sign-in and session security: 1 blocking, 4 should-fix, 6 notes;
database: 1 blocking, 3 should-fix, 7 notes). Every finding was checked against the code or its experiment; every one
is real. What each changed: `approval-summaries/lane-a-wip/step-before-reset/design-rulings.md`.

## 1. The gap, reproduced on the provider twin

Both pass today (`sign-in.db.test.ts`, the two cases titled "SGN-16, open residual (ADR 0091 D10): ..."; and
`step-before-reset.repro.db.test.ts`, which goes when they flip):

- **Case 1.** A code step that proved the old password before a reset opens a session when its code is answered after
  it. A new sign-in with the old password is refused.
- **Case 2.** A key-registration step begun before a reset registers a key after it when the provider's sign-out had
  no effect, and that key then signs in. A reset removes no key (ADR 0081 A5).

Two more are on the base and close with these:

- **A sign-in racing the reset.** A session whose transaction commits while the reset's runs is missed by the revoke's
  snapshot and survives it.
- **A lost answer.** The Cognito client retries by default. A `ConfirmForgotPassword` whose answer is lost is sent
  again, meets its own used code and is answered as a refused code: the password is changed, the person reads "That
  did not match", no session ends and nothing is recorded. Unproven at Cognito (no pool in this lane); closed by
  construction (section 3, D9).

## 2. The rule

**No sign-in attempt the application carries, begun at or before the account's latest recorded password reset, opens
a session, registers a key, enrols a factor or replaces a temporary password for that account afterwards.** "Begun"
is read on the database's clock before the attempt's first provider call and carried, sealed, through every later step
of the attempt. The reset moves the account's mark on the same clock, in the transaction that records it.

It needs no fact about Cognito's `auth_time`. It does rest on one provider fact, unverified here: the provider refuses
the old password from the moment its confirm has answered (section 6).

**What it does not cover, and what does.** A call made at Cognito directly, with the pool's public client, never
passes the application: an attacker holding the old password and the authenticator can open a challenge there before
the reset, answer it after, and register a passkey with the token (review SEC-D1). Only ADR 0088's second release (the
confidential client) closes that, so "required before launch" needs both. ADR 0093 and SGN-17 say so.

## 3. Design

### D1. The mark: `"user".sign_in_not_before timestamptz` (nullable; NULL: never reset)
Moved by a new AFTER INSERT trigger on `audit_event`, `audit_event_sign_in_not_before`. Its WHEN is the notice
trigger's guard (ADR 0091 D3: `actor_kind = 'user' AND object_type = 'user' AND object_id = actor_id`, so only a
transaction acting as the account itself matches) with two actions: `password_reset_completed` and
`password_reset_outcome_unknown` (D9). A test pins the guard equal to the notice trigger's. Its function (SECURITY
DEFINER, `tp_owner`, `search_path` pinned, granted to no role):

1. refuses to run outside READ COMMITTED (`0A000`): at REPEATABLE READ the sweep would read an old snapshot and leave
   a session live while the mark moved (review DB-D3). No caller does that today; the guard keeps it so.
2. `UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp()) WHERE id = NEW.actor_id`:
   the account's row lock (FOR NO KEY UPDATE) and the mark; `GREATEST` never moves it back.
3. `UPDATE user_session SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE user_id = NEW.actor_id AND
   ended_at IS NULL`: the sweep, a new statement and so a new snapshot. It makes "the event is recorded" imply "every
   session ended" in the database, whatever a caller did first, which is what ADR 0091 D10's line "Every session of
   this account has ended." rests on.

A separate trigger, not a branch of `audit_event_password_notice()`: the notice's function stays the notice's, and this
branch folds into password-changed-notice's with no edit to its migration.

### D2. One lock order: the account's row first (review DB-D1, blocking in v1)
v1 took the account's row after a device row (the insert trigger, inside `openSession`) and took session rows a second
time under it (the sweep, after the web's own revoke). With `resolve_session()` (session, then device) that closes a
cycle the tree does not have: scripted with three connections, `40P01`; under stress, failed sign-ins' counts were
among the transactions PostgreSQL ended. v2:

- `sign_in_lock_account()` (SECURITY DEFINER; EXECUTE to `tp_app`): `FOR NO KEY UPDATE` on the acting account's own
  row (`app_actor_id()`; it takes no argument, so it can name no other account; no row is `42501`).
- `openSession` calls it first, before its device statements. The reset's transaction calls it first, before
  `revokeUserSessions`.

Then every transaction that takes the account's row takes it before a device or a session, the trigger's own lock is
already held, and the sweep finds nothing a new image opened. Measured by the database review in its harness: 1
deadlock against 74, the one left being a cycle the tree already has (`resolve_session()` against `revokeDevice`,
handed on in section 7). The build proves it on the real code: the three-connection case fails before the two calls
and passes after.

FOR NO KEY UPDATE, not FOR SHARE: `sign_in_succeeded()` and `record_sign_in_with_mfa()` update the row later in the
same transaction, and two sign-ins of one account that each upgraded a shared lock would deadlock. It does not block
foreign-key checks.

### D3. The attempt's start: `sign_in_step_began() RETURNS timestamptz`
`SELECT date_trunc('milliseconds', clock_timestamp())` (volatile, SECURITY INVOKER, EXECUTE to `tp_app`). The flow
calls it first in `started()` (before the account read and `provider.signIn`) and in `beginKey()` (before
`provider.beginKeySignIn`). Whole milliseconds, so the value survives the driver's `Date` both ways exactly (the
database review ran 7,500 values through node-postgres in five time-zone pairs: no mismatch); truncation only moves a
start earlier, the refusing side. The flow's `Pending` gains `began: number` (epoch ms) on `new_password`, `mfa_setup`,
`mfa`, `key` and `register_key`; every step built from another carries the same value, so an attempt has one start
however many steps it takes, and no step is stamped again after its proof. It is not the web layer's `startedAt` (the
web server's clock, per step, for the step's limit; ADR 0081 D2): two clocks cannot be compared safely.

Why it is enough: a step that proved the old password asked the provider before the provider took the reset, which
answered before the reset's transaction read the clock. Between the two readings lie at least the request leg of the
sign-in's call, the answer leg of the confirm's call and the reset's own database statements: about one provider
round trip, in the order of 10 ms.

### D4. The database refuses a stale session: `user_session.sign_in_began_at timestamptz` (nullable)
`openSession` writes it from the step (`tp_app` gains INSERT on that one column). A BEFORE INSERT trigger,
`user_session_sign_in_not_before` (SECURITY DEFINER: an invoker's trigger would read through the caller's policies and
skip a row the caller cannot see), for a row that carries a start:

    SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
    IF NEW.sign_in_began_at > clock_timestamp() OR (mark IS NOT NULL AND NEW.sign_in_began_at <= mark)
      THEN RAISE ... ERRCODE check_violation, CONSTRAINT 'user_session_sign_in_not_before';

Under the account's lock either order is right (both proven by experiment): the session's transaction first, and the
reset waits for its commit and ends it; the reset first, and the insert waits, reads the moved mark and is refused.

A start ahead of the clock is refused (review DB-D4): `'infinity'`, a value from the wrong clock or a units slip would
otherwise pass for good, silently. It also turns half of the clock's limit into a refusal: after the clock steps back,
a start read before the step is ahead of it.

A row with no start is neither checked nor locked: it is the previous image's insert (a rollback, and the minutes of
a rolling deploy; ADR 0009, ADR 0049), which this schema must keep working. Locking it would be worse than not: it
would then always land after the reset and never be swept. The gap stays open for that image alone.

### D5. The flow refuses the steps, and the database records each refusal
`sign_in_step_refused(target_user uuid, began timestamptz, step text, request text) RETURNS boolean` (volatile,
SECURITY DEFINER, EXECUTE to `tp_app`; READ COMMITTED only; `step` from a closed list). True when the account does not
exist, there is no start, the start is ahead of the clock, or the start is at or before the mark. In that last case,
the one that is evidence, it writes a `security_event` audit row for the account (the actor `system`, the purpose
naming the step: `step_before_reset_mfa`, `..._key`, `..._register_key`, `..._new_password`, `..._mfa_setup`, and
`key_registered_across_reset`; the request ID), as `sign_in_failed()` writes its own. Checking and recording are one
function, so no call site can refuse without the record (review SEC-D4). It counts no failure: a count would let a
stale step lock the account.

| Where | Account judged | Then |
| --- | --- | --- |
| `answerTotp`, before the provider is asked | the typed address's, if it names one | `refused('expired')`: a stale code step counts no failure and uses up no code after the reset (review SEC-D5) |
| `completeKey` | none here | The key step is sealed for any typed address with no proof; a refusal before a valid assertion would tell an outsider that the address has an account reset inside the step's life. Decided in `authenticated()` only |
| `authenticated()`, after the account is found, not disabled and not locked; before `hasHardwareKey`, `release` and the session | the provider's subject's, and the typed address's when that is another account | `release(grant)`, `refused('expired')`. The session insert carries `began` (D4), and D4's refusal is recorded and answered the same way |
| `beginKeyRegistration`, `completeKeyRegistration`, before the provider call | `pending.userId`, and the typed address's account sealed beside it when it differs | `release(grant)`, `refused('expired')` |
| `completeKeyRegistration`, again after the provider registered the key | the same | D6 |
| `passwordChosen`, `totpSetupBegun`, `totpSetupCompleted`, after ADR 0088's own checks and before the provider call | the email's | `refused('expired')` |

**Both accounts** (review SEC-D2). The reset marks the account its typed address names; `authenticated()` signs in the
account the provider's subject names. In a sound database they are one. Where they are not (a crossed state, reached
only by an out-of-band change), judging both refuses the review's scenario without assuming which mapping is right, and
refuses nothing for a sound account. The reset itself still acts on the address's account there (section 5).

Not checked: the `reset` step. It holds no proof (ADR 0081 A1): the mailed code is the authorization and its life is
the provider's; a fresh step takes the same code.

Each refusal also logs `security event: sign-in step refused after a password reset` (warn; `user_id`, `request_id`,
and the step in `error_code`, the allowlisted field the reset's refusals already use for a reason). It joins the
counted lines at 1 in 300 s for every step but `key` (no password was proved there, and a new attempt succeeds), with
a runbook step. Why it pages: a reset requested in the same browser replaces that browser's pending step, so a stale
step is another browser or device. At the code step it means the old password was proved around the reset; the
operator tells the person their second factor may be known too, which the reset does not change.

### D6. A key whose registration returns after the reset was recorded is removed or reported (review SEC-D3)
D5's check before the provider call reads the committed mark, so a registration already at the provider when the
reset commits still registers; and the provider's sign-out is sent after the commit, so it cannot stop that call. After
the provider answers that the key is registered, the flow asks `sign_in_step_refused` once more (step
`key_registered`). If it is refused:

- `provider.removeHardwareKey(grant, credentialId)` (new: Cognito's `DeleteWebAuthnCredential` with the same access
  token; the twin drops it from the record), best effort;
- `security event: hardware key registered across a password reset` (error; `user_id`, `request_id`, `error_code`
  `removed` or `not_removed`), counted at 1 in 300 s, with a runbook step (not removed: the founder's break-glass,
  until Queues item 29 gives the operator an action);
- `hardware_key_registered` is audited only if the key is still there; the grant is released; the answer is
  `expired`.

Holding the account's lock across the provider's call would make this exact and is rejected: the reset would wait on
a provider call, and it buys nothing against an attacker, who could have registered a moment earlier. A key
registered before the reset is not this rule's: removing a member's keys is Queues item 29.

### D7. What the person sees: nothing new
`refused('expired')` clears the step and goes to `/sign-in?reason=step_expired` ("That sign-in step closed. Start
again from your email and password.", or the key surface's line). True here, and it tells the holder nothing they do
not learn from the old password's own refusal. An unknown outcome (D9) answers the existing "Sign-in could not
continue. Start again.". No new words, so no wording review.

### D8. A step sealed by the release before (no `began`)
The web's `pendingOf` treats a step other than `reset` with no `began` as no step (start again), as ADR 0088 D3 did
for a step with no `subject`; `sign_in_step_refused` is true for no start. While both images serve, an attempt an old
task seals and a new task reads starts again, and may again; a step a new task seals and an old task finishes is not
checked. Both end with the deploy. Deploy off-hours, as ADR 0088's cutover does.

### D9. A reset whose outcome at the provider is unknown (SGN-18; the orchestrator's ruling)
- **One attempt.** `ConfirmForgotPassword` goes through a second Cognito client built with `maxAttempts: 1` (a
  required option of the provider, so a composition cannot leave the default; a test reads the client's setting).
- **Three kinds of answer.** The provider reset it. The provider answered and changed nothing: the code's refusals
  (one `rejected`, as today), the policy's, a refused credential, and any other client fault (4xx) not named for a
  Lambda trigger (thrown as the platform's failure, as today). Anything else is `outcome_unknown`: no answer, a server
  fault, a trigger's failure.
- **The safer reading of unknown.** The person is not told the code was wrong: the route answers "Sign-in could not
  continue. Start again." and ends the step. If the address names an account, one transaction as that account
  (retried once, as a reset's) takes its lock, ends its sessions and records `password_reset_outcome_unknown` (purpose
  `unverified_code`), on which D1's trigger moves the mark and sweeps; then the provider signs the user out, as after a
  reset. No password-changed email is queued: its words would claim a change nobody has proved. Instead
  `security event: password reset outcome unknown` (error; `user_id` or null, `request_id`, the provider error's name)
  is counted at 1 in 300 s, with a runbook step: the operator finds out whether the password changed and tells the
  person another way, as ADR 0091 D15 does for its line.
- **What it costs.** Someone without the code can make the application end an account's sessions only when the
  provider's answer to their confirm is lost, which they cannot cause, inside the `sign_in` rate limit for that
  address; each time pages. The other reading leaves a reset that may have happened with its sessions live, unrecorded
  and unpaged.
- Other provider calls keep the SDK's retries: a repeat of theirs is a refusal the person can retry (section 5).

### D10. The migration (`20261112090000_sign_in_not_before.sql`, through /new-migration's marker route)
Two nullable columns with no default (catalog-only: no rewrite, no scan), five functions, two triggers, one column
grant. Locks: `"user"` and `user_session` ACCESS EXCLUSIVE (the columns), `audit_event` SHARE ROW EXCLUSIVE (the
trigger), together, NOWAIT in one subtransaction, once a second, up to 300 tries (ADR 0083's loop).

**What refuses a try** (review DB-D2; unlike the notice's migration, which took `"user"` in a mode readers do not
refuse): any open transaction that has touched `"user"` in any way, a read or a foreign-key check included, or
`user_session`, or written `audit_event`; and a vacuum of the three. Every job and request reads `"user"`, and one
reconcile pass (about 600 s at 2,000 lines) outlasts the five minutes. The header, ADR 0093 and the runbook say:
deploy with no reconcile queued or running, off-hours; a refused loop fails before any service moves and changes
nothing; run it again. A table of its own for the mark would avoid the lock and is rejected: a join on every check,
for good, to ease one deploy.

Safe with the previous image: every object is added; its inserts carry no start and are not checked; its reset still
moves the mark and sweeps, since both are the database's. Rollback floor: none of its own.

### D11. Tests
- **The reproductions flip**: W6's two SGN-16 cases (case 1 `refused('expired')`, no session, one `security_event`;
  case 2 refused at the options and at the verify, no key in the store), and the reproduction file goes.
- **Database**: the stamp (each action; the guard, as the notice's tests take it; GREATEST; a second reset); the sweep;
  REPEATABLE READ refused; the insert trigger (no start passes and takes no lock; after the mark passes; at it, before
  it and ahead of the clock are refused by name); both lock orders with two connections; the three-connection cycle,
  red before D2's calls; `sign_in_lock_account` (own row only); `sign_in_step_refused` (unknown user, NULL mark, NULL
  start on a never-reset account, at, before, after, ahead of the clock, an unknown step; the row it writes and when
  it writes none); grants, owners, `search_path`; the previous image's insert and reset; the lock loop with a reader
  open (refused, nobody queued).
- **Flow**: every row of D5's table; the key step asks the provider first and is refused only after a valid assertion;
  the crossed state; a reset landing between `authenticated()`'s check and the insert (refused by D4, recorded,
  `expired`); D6 both ways (removed; not removed); a fresh sign-in after the reset (the test waits past the mark's
  millisecond; the comparison is never loosened); a step with no `began`; an invited person's whole path.
- **D9**: unknown after the provider applied it, and after it did not (sessions end, the mark moves, no notice, the
  generic answer, the line); a definite refusal unchanged; no account under the address; the transaction failing
  twice; the Cognito provider's classification on a fake client; the web's client set to one attempt.
- **Infra**: the three counted lines and their alarms; the line contract with the web.
- **e2e**: a second browser context holds the stale code step.

### D12. Records
ADR 0093; a dated amendment to ADR 0081 ("Not covered", the reset item) and to ADR 0091 (D10, D15, "Not covered");
`docs/product/sessions.md`; the test matrix (SGN-16's two cases; SGN-17; SGN-18) with their synth registry rows;
`docs/runbooks/incident-response.md` (three steps) and `deploy-and-rollback.md`; the domain model regenerated.

## 4. Alternatives considered

| Option | Why not |
| --- | --- |
| Cognito's `auth_time` against a reset time (the plan's SEC-N5) | Rests on an unverified provider fact; the tokens exist only once the step has finished |
| The web's `startedAt` against a database time | Two clocks: a web server ahead of the database lets a step begun just before the reset through |
| A per-account reset counter sealed at the start, equality at the end | Exact, but the start knows only the typed address and the end the provider's subject; binding them refuses any account whose two differ, for good |
| A global sequence as a logical clock | Exact on one primary and needs no clock; but one that restarts lower after a cut-over that did not carry it refuses every later sign-in of a reset account until it catches up, silently; a clock does not restart lower. (That logical replication does not carry sequence values is not verified here for PostgreSQL 18) |
| A one-row counter table the reset bumps and the start reads | Exact, carried by a dump and by replication; but every reset on the platform then waits on one row for its transaction's life, and a table and its policies exist for one number. The clock is already what session limits trust |
| Transaction IDs | Reset by a dump and restore: the same lock-out as the sequence |
| A table of open steps the reset deletes | State for anonymous traffic and an expiry job, and the flow stops being stateless, for the same guarantee |
| Holding the account's lock across the key-registration call | D6 |
| Checking the mark in `resolve_session()` on every request | A second enforcement on the hot path; D1's sweep under the account's lock already ends what the reset must end |
| `revoke_user_sessions()` taking the account's lock first | Membership end would then hold the member's row across its provider call; D2 does it in the two transactions that need it |
| A table of its own for the mark | D10 |
| Refusing a start older than any attempt can be | A second clock rule tied to the step limits, closing nothing: an old start is at or before any recent mark already |

## 5. Known limits (for ADR 0093)
- **A direct call to Cognito** while the client is public (section 2).
- **The clock.** The database's clock is trusted not to step back by more than about one provider round trip inside an
  attempt's life (up to 6 minutes to a session, 21 to a key). Slewing never does; a failover lasts longer than any
  skew; nobody outside can cause one; session limits already trust it. A start ahead of the clock is refused (D4). A
  mark ahead of the clock (the clock stepped forward at a reset, then was corrected) refuses that account's sign-ins
  until the clock passes it: a runbook line, the owner's SQL.
- **A crossed state** (the typed address's account is not the subject's): the reset ends, marks and signs out the
  address's account, as it does today; D5 judges both, so the stale step is refused, but the subject's account keeps
  its sessions.
- **Completed resets nothing records**, so nothing is marked: made at Cognito directly; for an address with no
  account (SGN-16's stray case); the web's process ending between the provider's answer and the commit; the
  transaction failing twice (ADR 0091 D15 pages).
- **The previous image** opens sessions unchecked (D4, D8).
- **A registration already at the provider** when the reset commits is removed or reported, not prevented (D6). A
  factor enrolled across a reset would stay at the provider with the account not enrolled; no path reaches it (a code
  is sent only to an enrolled account) but a code taken from Cognito directly.
- **A second reset with an older code**, if Cognito keeps one valid after a later one completed, is not this rule's.
- **Other provider calls' repeats** (a code answer, a key registration) stay the SDK's.

## 6. Not verified here (no pool): staging checks to add to ADR 0081's list
The old password is refused at once after the confirm answers (a tight loop of sign-ins across one); the public
client's token registers a passkey, and the confidential client refuses a direct `InitiateAuth` without the hash;
what a repeated confirm answers; `DeleteWebAuthnCredential` with the app's token and the registration's credential
ID; two codes, the first tried after the second completed.

## 7. Handed on (for the orchestrator's queue; none blocks this item)
1. The reset resolves its account by the typed address; resolve it by the provider's subject, or detect a crossed
   state and page (Schema PR 6, sign-in identity).
2. `resolve_session()` and `revokeDevice` deadlock two ways on the base (database review DB-D11): one statement
   closes it (the device touch skips a locked row).
3. Once no image before this release can run: a migration that refuses a session with no start.
4. The other provider calls the SDK repeats.

## 8. Questions for the build's reviews
1. Does `outcome_unknown` page, and is ending the sessions on an unproved code the right side of D9's trade?
2. D9's "answered and changed nothing" rule (a client fault not named for a Lambda trigger): any Cognito error it
   puts on the wrong side?
3. D6's removal with the grant: anything safer to do when it fails than report?
