# Item 25 (d), round 1: database review (transactions, locks, RLS)

Branch `co-001/session-end-one-transaction`, delta: the branch against its base (three-dot diff).
Scope: PostgreSQL transaction, locking and RLS behaviour of `resolveSession` through `withResolvedActor`.
Evidence marked "run" was observed on PostgreSQL 18 (localhost:5433) in a migrated scratch database, as the
application dev login (tp_app), created and dropped by a throwaway script outside the repository; evidence marked
"read" is from the code only. The focused run of `apps/web/src/lib/routes/session-end.db.test.ts` passed: 1 file,
9 tests. No repository file was changed.

No blocker found. The change does what it claims: the end and its event commit together or not at all.

## Findings

### D2-1 (should fix) The session row and the device row are now locked across two client round trips on every signed-in request, with nothing bounding the span
- Where: `packages/db/src/authz/scope.ts:354-374` (`withResolvedActor`, no lock timeout, no transaction bound),
  `scope.ts:199-231` (`transaction`), `apps/web/src/lib/auth/sessions.ts:166-176`,
  `packages/db/functions/resolve_session.sql` (FOR UPDATE on user_session; UPDATE user_session; UPDATE user_device).
- Before: one autocommit statement. The server finished it and released the locks whatever happened to the client.
  Now the locks last from the SELECT until the server reads COMMIT, which the client must send.
- Evidence (run): with one connection left after `BEGIN; SELECT resolve_session(..)` (state `idle in transaction`),
  a second `resolve_session` of the same session blocked until cancelled (57014 under a 700 ms statement_timeout
  set for the probe only), and so did `resolve_session` of a different session on the same device (it waits on the
  user_device row). The application login shows `idle_in_transaction_session_timeout = 0`, `lock_timeout = 0`,
  `statement_timeout = 0`; a grep of infra/lib and the migrations finds none of them set (read).
- Consequence: a web task that stalls or loses its network between the SELECT's answer and COMMIT (no FIN/RST
  reaches the server) strands that person's session and device rows until TCP keepalive ends the backend. Every later
  request of that person, on any task, then waits with no bound while holding one of the application pool's 10
  connections (`apps/web/src/lib/server/pools.ts`); ten reloads pin a task's whole pool. A clean process death is
  fine (the socket closes, the server rolls back). The same stranding was already possible through sign-out,
  revoke-device and openSession, which hold the same rows in client-driven transactions; the change moves it from
  rare paths to every request. It is a frequency change, not a new class, which is why it is not a blocker.
- Smallest fix: D2-2's single statement removes the span altogether. If the three-statement form is kept, bound the
  transaction on the server: PostgreSQL 18 has `transaction_timeout` and `idle_in_transaction_session_timeout`, both
  settable for the application login's pool as connection options (no migration, no extra round trip), or per
  transaction with one more `set_config(.., true)` (a fourth round trip). This bounds the holder, not the waiters, so
  it does not contradict ADR 0092's amendment, but the ADR should say so.

### D2-2 (should fix, as a decision) A no-migration alternative does the same in one autocommit statement, one round trip
- Where: `apps/web/src/lib/auth/sessions.ts:166-176`.
- Evidence (run, as tp_app, autocommit, on a pooled connection whose `app.actor_id` was `''`):
  ```sql
  WITH r AS MATERIALIZED (SELECT * FROM resolve_session($1)),
       act AS MATERIALIZED (
         SELECT r.session_id, r.user_id, r.outcome,
                set_config('app.actor_id', r.user_id::text, true),
                set_config('app.practice_ids', '{}', true)
           FROM r WHERE r.ended_now),
       ev AS (
         INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose, request_id)
         SELECT act.user_id, 'user', 'session_ended', 'user_session', act.session_id, act.outcome, $2 FROM act
         RETURNING 1)
  SELECT r.*, (SELECT count(*) FROM ev)::int AS events FROM r
  ```
  - over-limit session: `outcome=idle, ended_now=true, events=1`; the session ended; one event with the session's
    user as actor and the reason as purpose; `app.actor_id` back to `''` after the statement;
  - same statement again: `outcome=ended, ended_now=false, events=0`;
  - event made to fail (a forbidden action): 42501, and the session stayed live (one statement, so atomic);
  - active session: `outcome=active, events=0`.
- Trade-offs to weigh, honestly: (a) it leans on the event's row being produced from `act`, so `set_config` runs
  before the policy's `app_actor_id()` check; this held in every run, but it is an ordering inside one statement,
  not a documented guarantee the way a transaction's statement order is, so it needs its own database test;
  (b) it writes the event outside `recordAuditEvent`/`INSERT_EVENTS`, a second place that knows the event's shape;
  (c) it sets the actor inside a statement rather than at a transaction's start (the privacy and tenancy rule).
  Against that it removes D2-1, two round trips per request, and the pool hold.
- The cleanest form remains database-side (resolve_session, or a wrapper, writing the event as a system-recorded
  row); that needs a migration and the schema gate, so it can only be recorded as a proposal here.
- Smallest fix: decide between the two no-migration forms on the record; if the transaction form stays, take
  D2-1's bound.

### D2-3 (should fix) No test makes the server itself refuse a statement inside this transaction
- Where: `apps/web/src/lib/routes/session-end.db.test.ts:45-66` (the faulty pool), `:172-186`;
  `packages/db/src/authz/scope.test.ts` (the `withResolvedActor` block, a fake pool).
- The injected statement fault rejects in the client before anything reaches the server, so the server's
  transaction is healthy when the scope sends ROLLBACK; the "commit" fault sends ROLLBACK for a healthy
  transaction. Neither puts the transaction in the aborted state a real failure does.
- Evidence (run): the real path behaves as the tests assume. Inside the transaction, an audit INSERT with no actor
  set was refused by the policy (42501, severity ERROR); COMMIT was then answered `ROLLBACK`; the session was still
  live. So this is a coverage gap, not a defect.
- Smallest fix: one case with no proxy: `resolveSession(app, token, 'not a request id!')` on an over-limit session.
  `audit_event.request_id`'s check refuses it on the server (23514), the scope's ROLLBACK follows an aborted
  transaction, and the assertions are the existing ones (rejects, session live, no event, no connection
  `idle in transaction`), then a clean request ends it with one event.

### D2-4 (note) The fault cases do not assert the connection's fate
- Where: `session-end.db.test.ts:210` checks `pg_stat_activity` only after the success path; in `scope.test.ts`
  the new block asserts `released` only for the success case.
- Read: `transaction()` releases on every path (`scope.ts:228-230`) and destroys the connection only when ROLLBACK
  itself fails, so nothing is wrong; the assertion is simply absent where it matters most.
- Smallest fix: repeat the `idle in transaction` query after each fault in the limit cases, and assert
  `released` equals `[false]` in the two failing scope cases.

### D2-5 (note) No test runs two requests of one over-limit session at once
- Read: the second waits on FOR UPDATE; after the first commits, the function's SELECT re-reads the row, sees
  `ended_at`, and answers `ended` with `ended_now=false` (no second event); after the first rolls back, the second
  ends the session and writes the event itself. This is better than before, where the first could commit the end and
  lose the event. It follows from READ COMMITTED's re-check and was not run concurrently.
- Smallest fix: a two-connection case asserting exactly one `session_ended` event.

### D2-6 (note, not new) Revoke-device and resolve_session take the device and session rows in opposite orders
- Where: `apps/web/src/lib/auth/sessions.ts:226-231` (`revokeDevice`: UPDATE user_device, then UPDATE user_session
  by device) against `resolve_session.sql` (session FOR UPDATE, then UPDATE user_device on the active path).
- Evidence (run): revoke's first UPDATE held the device; resolve_session took the session and waited for the
  device; revoke's second UPDATE waited for the session; after `deadlock_timeout` (1 s) resolve_session got 40P01
  and revoke went through.
- The cycle is entirely inside the function's one statement, so it existed in autocommit and its window is
  unchanged: after the function returns, the new transaction waits for no row lock (the audit INSERT takes none
  that these paths hold). Recorded so that nobody attributes it to this change. The victim is the request being
  resolved (a 500 for that request; the next one finds the session ended by the revocation).
- Smallest fix (a proposal, outside this change): `revokeDevice` ends the device's sessions first, then revokes the
  device, in the same transaction; or resolve_session locks the device row before the session (a migration).

### D2-7 (note) Timestamps now come from BEGIN, not from the statement
- Read: `now()` is the transaction's start. In the block, `ended_at`, `last_seen_at`, the limit comparison and the
  event's time all read the clock at BEGIN, one round trip earlier than before. No constraint or comparison is
  affected at that scale; a request that waited on the row lock already wrote an older `last_seen_at` than the
  request it waited for, before this change too. Each statement inside the function takes its own snapshot under
  READ COMMITTED in both forms, so what the function sees does not change.

## Lock orders (question 1)

| Path | Order | Source |
| --- | --- | --- |
| resolveSession, active | user_session row (FOR UPDATE, then NO KEY UPDATE) -> user_device row; "user" read without a lock; held to COMMIT | resolve_session.sql |
| resolveSession, ended | user_session row -> audit_event insert (no row lock on any shared row; audit_event has no foreign key); held to COMMIT | resolve_session.sql, audit.ts:49 |
| openSession | "user" row (FOR NO KEY UPDATE, sign_in_lock_account) -> user_device (INSERT or UPDATE) -> INSERT user_session (new row; KEY SHARE on user and device) | sessions.ts:73-104 |
| reset's sweep | "user" row -> every live user_session row of the user (revoke_user_sessions) -> audit insert (its AFTER triggers fire only for password-reset actions) | revoke_user_sessions.sql |
| sign-out | one user_session row -> audit insert | sessions.ts:200-201 |
| revoke device | user_device row -> the device's user_session rows -> audit insert | sessions.ts:226-231 |
| End membership | the user's live user_session rows (revoke_user_sessions) -> audit insert | sessions.ts:236-237 |

Cycles: only revoke-device against resolveSession's active path (D2-6), and it predates the change. resolveSession
never takes the "user" row, so it cannot close a cycle with openSession or the reset's sweep; against openSession
both reach the device row last among contended rows (openSession's new session row is contended by nobody). Sign-out,
End membership and the sweep take session rows and nothing resolveSession waits for afterwards. Two requests of one
session, or of two sessions on one device, take the same order and queue. The triggers on user_session
(set_updated_at, user_session_end_is_final) and user_device (set_updated_at; revocation_is_final only on revoked_at)
take no locks; none of audit_event's INSERT triggers fires for `session_ended` (their WHEN clauses name other
actions). No new cycle.

Migration 20261112090000's table locks are NOWAIT (as described by the change's author; its lock order was not
re-read here): NOWAIT never waits, so it cannot join a cycle; the longer span only makes a refusal of that
migration's lock marginally likelier, and a retry answers it.

## Could not break

- Atomicity: the end and the event commit together; a real refusal of the INSERT leaves the session live (run).
- The policy: after `actAs`, the audit INSERT passes `audit_event_record` as the session's user (actor matches
  `app_actor_id()`, action allowed, practice null) (run). Setting the actor after rows were locked with none set
  breaks nothing: resolve_session, `user_is_internal` and the triggers on user_session and user_device never read
  `app_actor_id()` (read).
- No actor at BEGIN on a pooled connection: `app.actor_id` is `''` there, and `app_actor_id()` reads `''` as null
  (`nullif`); both settings were `''` again after COMMIT, so nothing leaks to the connection's next user (run).
- `transaction()` and `committed()` for this opener: BEGIN failing destroys the connection; any throw rolls back and
  releases; a failed statement followed by COMMIT is answered ROLLBACK and reported as
  TransactionNotCommittedError (the answer was observed on a real connection); an unknown commit outcome destroys
  the connection when the ROLLBACK after it fails. Nothing is left idle in a transaction on any path read.
- Pool self-deadlock: the opener takes one connection and never a second while holding it.
- Snapshot differences between autocommit and the block: none that change an outcome (D2-7).
- An unknown cookie: `unknown`, no lock taken (no row), BEGIN and COMMIT of an empty transaction; cost only.
- `actAs` twice or with a non-UUID: refused before any second `set_config`, everything rolled back (scope tests).
