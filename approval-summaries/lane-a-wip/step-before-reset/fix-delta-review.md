# Fix-delta review: step-before-reset, f5d1c05e..79c98137 (adversarial, read-only, 2026-11-11)

Scope: the migration, sign-in.ts, sessions.ts, cognito-provider.ts, routes/sign-in.ts, security-events.ts (dev-provider.ts
has no delta). SQL was run on a scratch copy of `sbr` (dropped). No test suite was run. Paths are from the repo root.
Counts: 1 blocking, 4 should-fix, 7 notes.

## Claims
- Reason + once-per-mark record + page only on before_reset: TRUE (SQL: `no_start|ahead_of_clock|NULL` for a never-reset
  account; one row for two calls). Every caller reads non-null as refused (`judged()`; `stale()` returns length > 0), so
  no_account, no_start and ahead_of_clock still refuse. No caller left on the old boolean.
- Lock function refuses without the record: TRUE (SQL: `ERROR: ... only when that registration is on record`). See B1, S1.
- Crossed state refused after both accounts are judged: TRUE. Email case is safe (sign_in_account and the unique index
  both use lower(email)); no email-change path exists in apps/web or the migrations, so a sound account is not crossed.
- Never-sent classified as the platform's failure: TRUE for the three codes; maxAttempts 1 is checked before the send, so
  the code cannot belong to a retry of an earlier, delivered request. See N5.
- try/finally, grants released, `began` required, rethrow by name: TRUE, except S2 and S3.

## Blocking
B1. The key lock is the ordinary lock, and the ordinary unlock undoes it with the key still registered.
  packages/db/migrations/20261112090000_sign_in_not_before.sql:249-263; 20261015170000_identity_and_permissions.sql:322-330;
  apps/web/src/lib/routes/console.ts:800-809.
  The function sets the same `locked_at` ten failures set. `unlock_user()` checks only organization.manage, and the console
  lists only `locked`. Scenario: the attacker registers a key across the reset, removal fails (the reset signed the token
  out), the account locks. The real owner, who has just reset, is told "locked" and asks support; an administrator
  clicks unlock; the attacker's key then signs in. Only the runbook stands between the lock and SEC-B1 again.
  Worse when the account was already locked (ten bad passwords, which anyone can cause): SQL case 5 returned `f` and wrote
  no `account_locked_key_across_reset` row, while the flow logs `not_removed` ("locked"), so the account's audit trail
  never says the lock is for a key.
  Smallest fix: `unlock_user()` refuses while a `key_registered_across_reset` event since the mark has no later
  key-removed record (a new owner-recorded event from the runbook step); write the lock event even when `was_locked`.
  Unverified: that the `key` step opens a session with no password (read from "no password was proved there",
  infra/lib/security-events.ts). If the runbook control is accepted as enough, this is a should-fix.

## Should-fix
S1. Evidence is matched by `e.at >= mark`, but `at` is now() (transaction start) and the mark is clock_timestamp().
  Migration :222-227 and :250-253. A judge whose transaction began before the reset's trigger ran, and whose inner
  SELECT ran after the reset committed, writes an event with at < mark. SQL case 6 (one transaction begun before the
  mark moved): two calls answered `before_reset` and wrote two rows, then the lock raised `only when that registration
  is on record`. In the app the judge is one autocommit statement, so the window is tx start to the function's inner
  SELECT (sub-millisecond; unverified in the app), but it is the reset-races-registration case this function is for;
  the result is `not_removed_not_locked`. Fix: insert both events with `at = clock_timestamp()`, or store the mark on
  the event and match on it (that also fixes N3).
S2. The crossed-account page is skipped when the release throws. apps/web/src/lib/auth/sign-in.ts:437-441:
  `await release()` precedes `logger.warn('security event: sign-in refused for a crossed account')`. A release that
  throws (ClientCredentialError, network) leaves by the outer catch with no line, and the crossed state has no audit row
  either. Fix: log before releasing.
S3. "Nothing leaves without the key's line or its audit record" is false on the clean path. sign-in.ts:704-707: the
  judgement answers NULL, then `this.audit(... 'hardware_key_registered' ...)` throws (pool or database blip). The error
  leaves through the new catch (grant released) with no line and no audit row, and the key stays at the provider. Fix:
  catch there, log an error line by IDs (a new code such as `not_audited`), then rethrow.
S4. A legacy `register_key` cookie with `addressUserId` can lock the wrong account. sign-in.ts:720-726: `evidenced` holds
  only accounts answered before_reset. If only the address's account was reset, the lock lands on it; the key's account
  (`pending.userId`) stays unlocked, and the line says `not_removed`. Reachable only from a cookie sealed before this
  round, in a crossed state (unverified end to end). Fix: always lock `pending.userId`; report `not_removed_not_locked`
  when that one lock fails.

## Notes
N1. tp_app can lock any account that has ever reset: SQL case 2, `sign_in_step_refused(victim, '-infinity',
  'key_registered', ..)` answered `before_reset`, then the lock answered `t`. Not new power (sign_in_failed x10 does the
  same) but it writes a false `key_registered_across_reset` record. The evidence check binds nothing to a real provider event.
N2. The dedupe drops a second request's ID: SQL case 3, `req-second-attacker` (same step, same mark) added no row; only
  `req-first` is in audit_event. The paging line still fires each time with the request ID, so only the log holds it.
N3. An event judged against mark M1 can carry at >= M2 when reset 2's trigger ran before the judge began and committed
  after its read; it then counts as record and evidence for M2 (unverified, timing only).
N4. Lock order: no new cycle found. The lock function is one autocommit statement (user row FOR UPDATE, then
  audit_event), as sign_in_failed is; openSession and the reset take the user row first. FOR UPDATE is stronger than
  needed (`locked_at` is no key column) and briefly blocks foreign-key checks on the row; FOR NO KEY UPDATE suffices.
  The unlock serialises on the same row; no lost update.
N5. `neverSent()` (apps/web/src/lib/auth/cognito-provider.ts:232-243) returns on a top-level string `code` before reading
  `errors`, so the "every error an aggregate holds" branch is dead if Node sets `code` on its AggregateError (not
  reproduced here: a single-address refusal printed a plain Error, code ECONNREFUSED). Connect-phase errors only, so
  safe in effect. The rethrow by name loses the code: a refused connection logs as `Error`.
N6. A judgement that throws after a sound registration removes the person's good key and pages "registered across a
  password reset" (sign-in.ts:696-702). The ruled safer side, but a false page; a distinct code (`unjudged`) would tell them apart.
N7. Process: I detached the worktree's HEAD with a `git checkout 79c98137` and reattached it to co-001/step-before-reset
  (same commit, tree clean). No tracked file edited, nothing committed, no scratch files left.
