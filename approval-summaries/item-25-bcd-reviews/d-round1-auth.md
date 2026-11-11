# Item 25 (d), round 1: authentication and session review

Branch co-001/session-end-one-transaction, delta `git diff origin/claude/build-platform...HEAD` (6 files, including packages/db/src/authz/index.ts). Scope: authentication and session risk only. No file under packages/db/functions changed, and resolve_session.sql is unchanged (SECURITY DEFINER, `search_path` pg_catalog, public, pg_temp, `REVOKE ALL ... FROM PUBLIC`, EXECUTE to tp_app only).

Test run: `pnpm vitest run --project db apps/web/src/lib/routes/session-end.db.test.ts`: 1 file, 9 tests, all passed.

No blockers found.

## Findings

### D1-1 (note): a session whose end rolled back can come back to life if the user is re-enabled
- Where: apps/web/src/lib/auth/sessions.ts:166-176, packages/db/functions/resolve_session.sql (CASE ... `u.status = 'disabled'`).
- Evidence: before this change, `user_disabled` (and every other limit) was ended in autocommit, so the session stayed ended even if the audit write that followed failed. Now a failed audit insert, or a commit answered ROLLBACK, also rolls back the end. Every request in that window is still refused: it throws, and nothing passes as signed in. But `user_disabled` is the one reason that can be undone. user_guarded_columns.sql lets the owner change status, so an owner who re-enables the user before a request goes through leaves the old session alive, when before it would have ended. idle, expired and device_revoked depend on values that nothing resets while the session is refused, so they cannot come back.
- Smallest fix: treat it as accepted and record it in the ADR amendment, or have the re-enable path end the user's open sessions (revoke_user_sessions). Do not go back to two transactions.

### D1-2 (note): `actAs` stays usable after the transaction has settled
- Where: packages/db/src/authz/scope.ts:362-371.
- Evidence: `acting` is set only when `actAs` is called. If a callback keeps `actAs` and calls it after `run` has finished and the client has gone back to the pool, it runs `set_config('app.actor_id', ..., true)` on a connection that another request may have borrowed, inside that request's transaction. That sets the other request's actor. The one caller today, sessions.ts:166, does not keep it, and a `scope.client` that escapes from withActor has the same problem. Even so, this is a new capability that lives on the shared runtime export.
- Smallest fix: in withResolvedActor, wrap `run(...)` in try/finally and set `acting = true` (or a separate `closed` flag) in the finally, so a late call throws ScopeError.

### D1-3 (should fix): no test shows that a request fails closed when resolveSession throws
- Where: apps/web/src/lib/routes/session-end.db.test.ts:161-199. The caller is apps/web/src/lib/http/invoke.ts:229-245, used at :547, :605 and :663.
- Evidence: the limit tests call `resolveSession` directly. From the code, `signedIn` has no catch, so a throw leaves `invoke` before `guard`, the scope and the handler run. That fails closed (the error reaches Next as a 500). No test locks that in. A later `try { resolveSession } catch { return none/active }` would pass every current test.
- Smallest fix: in the LIMITS loop, add one fault case that calls a selfRoute (for example `devicesPage`) through `run(faulty, ...)` with the AUDIT fault armed. Assert the result is `'threw'` (or a non-ok status), that nothing from the handler is visible, and that the session is still `'live'`.

### D1-4 (should fix): "exactly once" is not tested for two concurrent requests
- Where: session-end.db.test.ts:191-197 (sequential only).
- Evidence: from the code it is sound. resolve_session takes `FOR UPDATE` on the session row. A second request waits for the first to commit, then under READ COMMITTED it sees `ended_at` set and returns `ended` with `ended_now` false, so no second event. If the first rolls back, the second ends the session and writes the one event. No test runs two resolves at the same time, or one at the same time as a commit fault.
- Smallest fix: one test that starts two `resolveSession` calls together on an idle session (one of them through the faulty pool with the AUDIT fault). Assert exactly one `session_ended` event, and one result of `{state:'ended', reason}` while the other is `ended` or threw.

### D1-5 (note): CommitOutcomeUnknownError is not tested on the session path
- Where: session-end.db.test.ts:184-189 tests only a commit answered ROLLBACK (TransactionNotCommittedError).
- Evidence: a COMMIT that ends with no answer throws CommitOutcomeUnknownError (scope.ts:96-106), and the request fails as above. Both outcomes are safe: if it committed, the next request sees `ended` and no second event is written; if not, the next request ends the session again. Neither is tested.
- Smallest fix: add a `{kind:'commit-throws'}` fault that rejects COMMIT with a plain Error (no SQLSTATE). Assert the error type, then that the next resolve gives `ended`/`ended` or `{ended, reason}` with exactly one event either way.

### D1-6 (note): the scope.test cases use a fake pool only; no database-backed check that the actor does not leak
- Where: packages/db/src/authz/scope.test.ts (withResolvedActor block).
- Evidence: the tests check statement text (`is_local` true) but not the database. Nothing shows that `app_actor_id()` is null before `actAs` on a reused pooled connection, or null on the next transaction on that connection after commit or rollback. By reading the code it is sound: every set is `is_local` true, and the transaction always ends with COMMIT or ROLLBACK, or the client is destroyed.
- Smallest fix: one db-project case. On a pool of size 1, run withResolvedActor with actAs, then a bare transaction on the same pool. Assert `current_setting('app.actor_id', true)` is '' or null both before actAs and afterwards.

### D1-7 (note): the "end itself fails" fault only proves the statement never ran
- Where: session-end.db.test.ts:177-182.
- Evidence: the fault rejects `resolve_session` before it reaches the server, so "no event" holds whatever the transaction structure. The real atomicity proofs are the audit fault (:170-175) and the commit fault (:184-189), and they hold. The name overstates this case.
- Smallest fix: rename the case, or fault the statement after resolve_session (the set_config of `actAs`) instead, so a database-side end really happened before the failure.

### D1-8 (note): the sweep test does not show that the sweep ran before the failed event
- Where: apps/web/src/lib/auth/sign-in.db.test.ts (new case "a reset's sweep and its audit event are one transaction").
- Evidence: it asserts one open session and no event after two failed tries. It would also pass if the sweep had never run. The code order (sign-in.ts:858-860: revokeUserSessions, then recordAuditEvent in one withActor) makes the claim true, but the test does not show it.
- Smallest fix: also count `revoke_user_sessions` statements issued in the failing flow (expect 2), or assert that the second scenario's sessions really end.

### D1-9 (note, existing before this change): an error thrown during session resolution skips the logger's allowlist
- Where: apps/web/src/lib/http/invoke.ts:229-230, apps/web/src/lib/http/handler.ts:254.
- Evidence: errors from `signedIn` do not go through `transacted`'s refusal mapping (invoke.ts:368-401, which logs only codes). They bubble to Next's default handling, which prints the error and its `cause`. The new errors carry fixed text ("the database ended a session without naming it", CommitOutcomeUnknownError's message), and the pg errors from an audit_event insert name the table or policy but not the token or its hash: the hash is only a bound parameter, and pg does not echo parameters. So I found no token or hash in a message. The path still sidesteps the allowlist.
- Smallest fix: catch in `signedIn`, log `{error_code, request_id}` only, and rethrow a fixed-text error (or return a 503 outcome).

## Item 4: the other ways a session ends (confirmed from the code)
- Sign-out (routes/account.ts:46-62): `endSession` (sessions.ts:200-203) runs inside selfRoute's single withActor scope (invoke.ts:556-570), and `run` writes `sign_out` (invoke.ts:302-311) in the same transaction. One transaction. The tests at session-end.db.test.ts:284-316 cover all three faults.
- Device revocation (account.ts:25-44): `revokeDevice` (sessions.ts:229-233) ends the sessions, and `device_revoked` is written by `run` in the same scope. One transaction.
- End membership, console (routes/console.ts:769-794): `revoke_user_sessions` plus `membership_ended` by `run`, in platformRoute's one scope. One transaction. Out of my scope but noted: `globalSignOut` is called before the commit, so a rolled-back commit leaves the user signed out at the provider while the database sessions stay live. That is the safe direction.
- End membership, settings (routes/settings.ts:1076-1105): same pattern inside organizationRoute's scope. One transaction. The same remark about `globalSignOut` applies.
- The reset's sweep (auth/sign-in.ts:853-878): `lockAccountForSignIn`, `revokeUserSessions` and `recordAuditEvent` in one withActor. One transaction. A failure is retried once, then logged with IDs only.
- None found that ends a session and writes its event in separate transactions.

## Could not break
- Fail open through resolveSession: `SessionState` `active` is returned only after `committed()` returns (scope.ts:218-220). Any throw (audit insert, an RLS refusal, ROLLBACK, an unknown commit outcome, or a reply with ended_now but no name) leaves `signedIn` uncaught and the request never reaches its handler.
- A previously refused request now allowed: refusal still depends only on what resolve_session returns. `ended`, `unknown` and every limit still map to unauthenticated (sessions.ts:177-182).
- Acting as an arbitrary user: the actor is the `user_id` that resolve_session (SECURITY DEFINER, EXECUTE to tp_app only) returns for the token's SHA-256. The caller cannot choose it. withResolvedActor gives no more than withActor(pool, anyUuid), which is already exported. Work before `actAs` runs with no actor set, the same as the earlier bare `pool.connect()`.
- The "once" guard: the UUID check comes before the flag, and the flag is set before set_config. A second call throws, and catching it changes nothing (same actor, same transaction). The guard is sound apart from D1-2's late call.
- Leaking app.actor_id or app.practice_ids across the pool: both use set_config with `is_local` true. Every path ends the transaction with COMMIT or ROLLBACK, or destroys the client (`release(true)`).
- Audit event content: objectType `user_session`, objectId `session_id`, purpose is the limit's name, and the actor is the session's own user. audit_event_record's WITH CHECK (`actor_id = app_actor_id()`, practice_id null) accepts it for every limit, `user_disabled` included (the policy does not look at user status). The 4-limit loop checks actor, purpose and the count of one.
- Two events or none under concurrency: `FOR UPDATE` in resolve_session serializes on the row (by reading the code; see D1-4 for the missing test).
- Token or hash in errors or logs: none found (D1-9 covers the path that bypasses the logger).
- Function or migration changes: none. No schema, policy, grant, owner, LEAKPROOF/STRICT or overload change.
