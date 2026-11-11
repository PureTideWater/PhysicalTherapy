# Design: a sign-in step begun before a password reset is refused after it (`co-001/step-before-reset`)

W8 (Lane A), 2026-11-11. `LANES.md` Queues item 28; required before launch. Source: password-changed-notice's security
review, its SEC-01 against ADR 0091 D10; ADR 0081, "Not covered"; the schema plan's SEC-N5. Stacked on
`co-001/password-changed-notice` (68895f0f when designed). Status: v1, for two adversarial reviews (sign-in and session
security; database).

## 1. The gap, reproduced on the provider twin (68895f0f)

`apps/web/src/lib/auth/step-before-reset.repro.db.test.ts` (reproduction only, not for merge), 2 of 2 passing on the
tree before the close:

- **Case 1.** `start(email, old password)` gives the code step. The account's password is then reset
  (`requestPasswordReset`, `confirmPasswordReset`: the sessions end, the event is recorded, the provider signs out). A
  new `start` with the old password is refused. The step begun before the reset still answers `signed_in`, and the
  session resolves `active`.
- **Case 2.** An internal user with no key reaches `register_key` (password and code proven). After the reset, with
  the twin's sign-out revoking nothing (as a failed `AdminUserGlobalSignOut`), the same step registers a key, and that
  key then signs in. A key outlives every later reset (ADR 0081 A5: a reset never removes a factor).

Why: the flow keeps no state. A step lives in a sealed cookie holding the provider's challenge or grant; the reset
ends sessions that exist and cannot reach a step that has not opened one. Cognito's sign-in session lasts 3 minutes
and its access token 15, whatever the reset does; a successful global sign-out revokes the grant's tokens for
Cognito's own calls, a failed one does not.

A third race is on the base too and closes with these: a sign-in whose transaction commits while the reset's
transaction runs is missed by the revoke's snapshot (READ COMMITTED), so its session survives the reset.

## 2. The rule

**No sign-in attempt begun at or before an account's latest password reset can open a session, register a key, enrol
a factor or set a password for that account after the reset is recorded.** "Begun" is read on the database's clock
before the attempt's first provider call and carried, sealed, through every later step of that attempt. The reset
stamps the account on the same clock, in the transaction that records `password_reset_completed`.

It needs no Cognito fact: neither `auth_time` nor whether a sign-out revokes a challenge.

## 3. Design

### D1. The mark: `"user".sign_in_not_before timestamptz` (nullable; NULL: never reset)
Stamped by a new AFTER INSERT trigger on `audit_event`, `audit_event_sign_in_not_before`, whose WHEN is the notice
trigger's, word for word (`action = 'password_reset_completed' AND actor_kind = 'user' AND object_type = 'user' AND
object_id = actor_id`; ADR 0091 D3: only a transaction acting as the account itself matches; a test pins the two
WHENs equal). Its function (SECURITY DEFINER, `tp_owner`, `search_path` pinned, granted to no role) does two things,
in this order:

1. `UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp()) WHERE id = NEW.actor_id`.
   The update takes the row lock (FOR NO KEY UPDATE), waiting for any session-opening transaction that holds it (D3).
   `GREATEST` keeps the mark from moving back. `clock_timestamp()`, not `now()`: the latest reading, so the mark is
   never before the lock was won.
2. `UPDATE user_session SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE user_id = NEW.actor_id AND
   ended_at IS NULL`: the sweep. A new statement in a volatile function takes a new snapshot, so it sees every session
   committed before the lock was won, including one the app's own `revoke_user_sessions` call (which ran before the
   lock) missed. It makes "the event is recorded" imply "every session ended" in the database, whatever order a caller
   uses, which is what ADR 0091 D10's line "Every session of this account has ended." rests on.

The web's reset code is unchanged: `revokeUserSessions`, then the event, one `withActor` transaction, retried once.
A separate trigger, not a new branch of `audit_event_password_notice()`: the notice's function stays the notice's, the
two can be read and reviewed apart, and this branch folds into password-changed-notice's with no edit to its migration.

### D2. The attempt's start: `sign_in_step_began() RETURNS timestamptz`
`SELECT date_trunc('milliseconds', clock_timestamp())` (volatile, SECURITY INVOKER, EXECUTE to `tp_app` only). The
flow calls it first in `started()` (before the account read and `provider.signIn`) and in `beginKey()` (before
`provider.beginKeySignIn`). Whole milliseconds so the value survives the driver's `Date` both ways exactly; truncation
only moves a start earlier, the refusing side. The flow's `Pending` gains `began: number` (epoch ms) on `new_password`,
`mfa_setup`, `mfa`, `key` and `register_key`; every step the flow builds from another carries the same value, so an
attempt has one start however many steps it takes. It is not the web layer's `startedAt` (the web server's clock, per
step, for the step's limit; ADR 0081 D2): two clocks cannot be compared safely.

Why this is enough: a step that proved the old password asked the provider before the provider took the reset
(`ConfirmForgotPassword`), which is before the reset's transaction began, which is before the mark's
`clock_timestamp()`. So began < mark by at least two provider round trips, on one clock.

### D3. The database refuses a stale session: `user_session.sign_in_began_at timestamptz` (nullable)
`openSession` writes it from the step (`INSERT (..., sign_in_began_at)`; `tp_app` gains INSERT on that one column). A
BEFORE INSERT trigger, `user_session_sign_in_not_before` (SECURITY DEFINER, as the app role holds no row-lock right on
`"user"`), for a row that carries it:

    SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
    IF mark IS NOT NULL AND NEW.sign_in_began_at <= mark THEN RAISE ... ERRCODE check_violation,
       CONSTRAINT 'user_session_sign_in_not_before';

FOR NO KEY UPDATE, the lock `sign_in_succeeded()`'s update takes later in the same transaction today, so no
share-to-exclusive upgrade exists (two sign-ins of one account would deadlock on one). Under it, either order is right:

- the session's transaction wins the lock: the reset's stamp waits for its commit, then the sweep ends the session;
- the reset wins: the insert waits for the reset's commit, re-reads the row (READ COMMITTED), and is refused.

A NULL `sign_in_began_at` is not checked: it is the previous image's insert (rollback, and the minutes of a rolling
deploy; ADR 0009, ADR 0049), which this schema must keep working. The gap stays open for that image only. Revisit:
once no image before this release can run, the trigger refuses NULL (a later migration).

### D4. The flow refuses before the provider is asked: `sign_in_step_current(target_user uuid, began timestamptz) RETURNS boolean`
STABLE, SECURITY DEFINER, EXECUTE to `tp_app`: true only when the account exists and its mark is NULL or `began >
mark`; a NULL argument is false. The comparison stays in SQL, on the database's values. Called:

| Where | Account | Then |
| --- | --- | --- |
| `authenticated()`, first, for both the session and the `register_key` branch | by the provider's subject | `release(grant)`, `refused('expired')`; the session insert also carries `began` (D3), and D3's refusal maps to the same answer |
| `beginKeyRegistration`, `completeKeyRegistration`, before the provider call | `pending.userId` | `release(grant)`, `refused('expired')` |
| `passwordChosen`, `totpSetupBegun`, `totpSetupCompleted`, before the provider call | the email's account (as `newPasswordOpen` and `enrolment` resolve it) | `refused('expired')` |

A refusal logs `security event: sign-in step refused after a password reset` (warn; `user_id`, `request_id`, the step's
name; no address) and counts no failure: it may be the person's own other tab.

Not checked: the `reset` step. It holds no proof (ADR 0081 A1): the mailed code is the authorization and its life is
the provider's. Refusing an older reset step closes nothing, since a fresh step takes the same code.

### D5. What the person sees: nothing new
`refused('expired')` already clears the step and goes to `/sign-in?reason=step_expired` ("That sign-in step closed.
Start again from your email and password.", or the key surface's line). True here too, and it tells the holder of a
stale step nothing about the reset. No new words, so no wording review; the kept email still fills in.

### D6. A step sealed by the release before (no `began`)
The web's `pendingOf` treats it as no step (start again), as ADR 0088 D3 did for a step with no `subject`; the flow's
helper also answers false for a missing value. Cost: a sign-in in flight across this release's deploy starts again
once. The safer reading; the other (accept an unstamped step) would keep an unchecked path in the code for good.

### D7. The migration (`20261112090000_sign_in_not_before.sql`, through /new-migration)
Locks `"user"` and `user_session` (ACCESS EXCLUSIVE, for the columns and the trigger) and `audit_event` (SHARE ROW
EXCLUSIVE, for the trigger) together, NOWAIT in one subtransaction, once a second, up to 300 tries (ADR 0083's loop,
as ADR 0091 D11). Both columns are nullable with no default: catalog-only, no rewrite, no backfill. Safe with the
previous image: additive; its inserts leave `sign_in_began_at` NULL; its reset still stamps and sweeps, because the
triggers are the database's. Rollback floor: none of its own.

### D8. Tests
- **The two reproductions flip** (and W6's SGN-16 cases with them): case 1 answers `refused('expired')`, no session, one
  log line; case 2 is refused at the options and at the verify, the twin's store holds no key.
- **Database** (`packages/db`): the stamp (only the guarded event; `GREATEST`; a second reset moves it forward); the
  sweep; the insert trigger (NULL passes; began after the mark passes; at or before it is refused by name); both
  lock orders with two connections (the session first, the reset first); `sign_in_step_current` (unknown user, NULL
  mark, NULL argument, at, before, after); grants, owners, `search_path`, the two WHENs equal; the previous image's
  insert (no column) still opens a session.
- **Flow** (`sign-in.db.test.ts`): every row of D4's table; a reset landing between `authenticated()`'s check and the
  insert (a provider wrapper that resets inside `release`) is refused by D3 and answered `expired`; a fresh sign-in
  after the reset works; a step with no `began` starts again; an invited person's whole path still enrols.
- **e2e**: the SGN-16 journey gains the stale tab.

### D9. Records
A new ADR (number from the orchestrator), a dated amendment to ADR 0081 ("Not covered", the reset item) and to ADR 0091
D10 and its "Revisit when"; `docs/product/sessions.md`; the test matrix (SGN-16's two cases flip; a new SGN row for the
rule if the orchestrator gives one); `docs/runbooks/deploy-and-rollback.md`; the domain model regenerated.

## 4. Alternatives considered

| Option | Why not |
| --- | --- |
| Cognito's `auth_time` against a reset time (the plan's SEC-N5) | Rests on an unverified provider fact; the tokens exist only after the step has finished |
| The web's `startedAt` against a database time | Two clocks: a web server ahead of the database lets a step begun just before the reset through |
| A per-account reset counter sealed at the start, equality at the end | Exact, but the start knows only the typed email and the end knows the provider's subject; binding them adds a refusal for any account whose two emails differ, and a rule for the start that found no account |
| A global sequence as a logical clock | Exact on one primary, but a sequence is not carried by logical replication (blue/green, a data migration): one that restarts lower would refuse every later sign-in of a reset account until it caught up. The domain model also shows no stand-alone sequence |
| Transaction IDs (`pg_current_snapshot`) | Reset by a dump and restore; the same lock-out |
| A table of open steps the reset deletes | State for anonymous traffic, an expiry job, and the flow stops being stateless, for the same guarantee |
| Holding the account's lock across the provider's key-registration call | Exact for a call in flight when the reset commits, but the reset would wait on a provider call. It buys nothing against an attacker: a key registered a moment before the reset is as good to them, and the reset removes no key |
| Checking the mark in `resolve_session()` on every request | A second enforcement on the hot path; D1's sweep under D3's lock already ends every session the reset must end |
| `revoke_user_sessions()` taking the account's lock first | Would also make membership-end revocation atomic and fix the lock order for good, but changes a function three other flows use; D1's sweep closes the reset's case without it |

## 5. Known limits (to state in the ADR)
- **The clock.** One database clock is trusted not to step back by more than two provider round trips inside a step's
  life (at most 15 minutes). Session limits already trust it. A failover moves to a standby synchronised to the same
  source; a restore takes longer than any step lives.
- **A key-registration call already at the provider when the reset commits** still registers (one provider call wide;
  the provider's own sign-out closes it when it succeeds). Equivalent to a registration a moment before the reset.
- **The previous image** (rollback) opens sessions unchecked (D3).
- **A reset whose transaction failed twice** stamps nothing (no event): ADR 0091 D15 pages for it, as today.
- **A reset the app records for no account** (the address resolves to none) stamps nothing, as it ends no session
  today (SGN-16's stray-address case).

## 6. Questions for the reviews
1. Is any path to a session, a key, a factor or a password left that does not pass D3 or D4?
2. D1's sweep in an audit trigger: any way a caller other than the account's own reset fires it, or it ends a session
   it should not?
3. Lock order and waits: any deadlock or unbounded wait with sign-in, sign-out, membership end, `sign_in_failed`,
   `resolve_session`, the notice trigger, or the migration's lock?
4. The clock argument (D2, limits): is a counter needed after all?
5. Should a refusal page (it means the old password, and at the code step a valid second factor, were presented
   around a reset), or be an audit event rather than a log line?
