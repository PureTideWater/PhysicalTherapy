# Build review, database side: 20261112090000_sign_in_not_before.sql

Worktree /home/user/step-before-reset at f5d1c05e. Read-only on the repository. Experiments ran on PostgreSQL 18.4 in a
scratch copy of `sbr` (`sbr_rev_a`, dropped afterwards). M = packages/db/migrations/20261112090000_sign_in_not_before.sql.

Counts: blocking 0, should-fix 2, note 8. Nothing found breaks the two invariants (a start-carrying session is ended by
the reset or refused after it; no account moves another's mark). 18.6 was not available: anything about it is unverified.

## Should-fix
### S1. A session with no start is unchecked for good, and the new image's type still allows one
- M:177-181 (WHEN NEW.sign_in_began_at IS NOT NULL); apps/web/src/lib/auth/sessions.ts:40 (`began?: number`) and :104
  (`request.began === undefined ? null : ...`).
- The database cannot tell the previous image's insert from a new-image mistake. Ran, as tp_app after the account's
  reset: `INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES (...)` printed `ok-null-start`
  (the same row with the old start was refused). Ran, concurrent: an uncommitted no-start insert spanning the reset;
  the reset committed in 10 ms without waiting and the row was left `live=t, no_start=t, started_before_mark=t`.
- The sign-in flow itself is safe today (sign-in.ts:323-326 refuses an attempt with no start before openSession, and
  :411 passes it), so this is one optional field away from a silent bypass, and nothing in M schedules its end.
- Smallest fix: make `began` required in OpenSessionRequest now (the db tests that open sessions pass
  sign_in_step_began()); record the follow-up migration that, once the rollback floor passes this image, drops the
  WHEN and refuses a NULL start (`check_violation`, same constraint name). No change to M itself.

### S2. sign_in_step_refused() writes a security_event on every call for any marked account, with no bound on the start
- M:192-216 (the INSERT at :211; no lower bound on `began`, no once-only key, no actor needed).
- Ran as tp_app with app.actor_id empty: `sign_in_step_refused(A,'-infinity','mfa','r1')`,
  `(A,'2000-01-01','key','r1')`, `(A,<old start>,'key_registered',NULL)` printed `t|t|t` and left three
  `security_event` rows about A (`step_before_reset_mfa`, `step_before_reset_key`, `key_registered_across_reset`).
  tp_app's own policy forbids it the action `security_event`; this function is the way around it for any account that
  ever reset. A start 26 years old is recorded as "evidence the old password was proved around a reset".
- Reach from the web (UNVERIFIED, not read): whoever holds a sealed pending step minted before a reset can replay it;
  each replay is one row and one paged log line (sign-in.ts:327-329). sign_in_failed() has the same shape, but it
  counts toward a lock; this one by design counts nothing, so nothing ends the stream.
- Smallest fix: record once per (account, start, step): `IF NOT EXISTS (SELECT 1 FROM audit_event e WHERE e.action =
  'security_event' AND e.object_type = 'user' AND e.object_id = target_user AND e.purpose = <purpose> AND e.at > mark)`
  before the INSERT (still returns true); or return true without a record when `began < mark - interval '24 hours'`
  (no pending step lives that long). Either keeps "no caller refuses without the record" for real evidence.

## Notes

N1. Preflight string depends on search_path (M:67-68). Ran: with `SET search_path = pg_catalog`,
`pg_get_triggerdef` prints `EXECUTE FUNCTION public.audit_event_password_notice()`, so the comparison would refuse
(fail closed). The runner's path (`"$user", public`, packages/db/src/migrate.ts:191 SET ROLE tp_owner) prints the
unqualified form and passes on 18.4. A schema named tp_owner would not change it. 18.6: UNVERIFIED; minor releases
have not changed this deparse, and a change fails closed with the "rebase" message. Fix if wanted: compare
`replace(def, 'EXECUTE FUNCTION public.', 'EXECUTE FUNCTION ')`.

N2. The lock order is a convention, not enforced (M:164-181). Ran: T1 `UPDATE user_device` (device row), then the
insert with a start; T2 `sign_in_lock_account()`, then `UPDATE user_device`: T1 got `ERROR: deadlock detected`.
Only openSession inserts a session today (sessions.ts:72-105, lock first), and the test file's "red run" (:494)
covers the cycle. Any later caller that inserts a start-carrying session after touching a device or session row
re-opens it. No fix now; keep the test.

N3. Isolation above READ COMMITTED on the session insert is safe without a guard. Ran: REPEATABLE READ and
SERIALIZABLE, snapshot taken before the reset, insert after it committed: `ERROR: could not serialize access due to
concurrent update` at the trigger's FOR NO KEY UPDATE (M:169); snapshot after the reset: refused by the constraint.
The audit trigger (M:141) and sign_in_step_refused (M:201) refuse outright (ran: `a password reset is recorded at READ
COMMITTED`). At READ COMMITTED the waiting insert re-reads the moved mark (ran: refused after a 2 s wait).
Not asserted by the tests: the 40001 path. isStaleSessionRefusal would not map it; no caller runs above READ COMMITTED.

N4. A mark ahead of the clock (clock stepped back, or a failover to a node behind) refuses every sign-in of that
account until the clock passes it, and every start read meanwhile is at or before it (M:144 GREATEST, M:170). Chosen
(test :280 "a mark ahead of the clock stays"); there is no repair but owner SQL. Worth one runbook line.

N5. The UPDATE at M:144 computes clock_timestamp() before it waits on a row lock held by a pure locker (no
re-evaluation when the row was only locked), so on the previous image's reset (no lock call) the mark can be earlier
than the moment the lock was granted. Reasoned harmless, not run: the mark is still later than the provider's change,
and the sweep (M:145) is a later statement with a new snapshot that ends whatever committed while it waited.

N6. password_reset_outcome_unknown (M:153): the mark is the moment of recording. If the provider applies the change
after answering nothing (UNVERIFIED, provider behaviour), an old-password attempt begun between the mark and that
moment passes M:170. Design D9's ground, not the database's; said here because the database cannot close it.

N7. Steps that open no session are judged against the committed mark without a lock (M:204). Between the provider's
change and the reset's commit (and for good if both tries of endedByReset fail, sign-in.ts:753-766) an old-password
step is not refused. By design (M:191); UNVERIFIED whether mfa_setup or register_key can complete in that window.

N8. sign_in_step_refused() is an existence and mark oracle for tp_app with no actor. Ran:
`(B never reset, now()) = f`, `(unknown uuid, now()) = t`, `(A, now()) = f`; varying the start finds A's mark (each
probe at or before it writes a row). Same trust as sign_in_failed(uuid, ...), which already tells an unknown account
apart. No web path passes a caller-chosen account or start (sign-in.ts:302-318).

## Checked and found sound (what was run printed what is quoted)

- Comparison and clock: `GREATEST(NULL, clock)` is the clock (ran); `infinity` start refused, `-infinity` taken only
  while the mark is NULL and swept by the next reset (ran); millisecond truncation only moves a start earlier; a start
  equal to the mark is refused (`<=`, test :365). `now()` is not used in M.
- Privileges: tp_app `UPDATE "user" SET sign_in_not_before` : `permission denied for table user` (no column grant;
  UPDATE grants are email, hardware_key_required, settings, status); `UPDATE user_session SET sign_in_began_at`:
  `permission denied`; un-ending a swept session: `an ended session stays ended`; calling a trigger function:
  `permission denied for function`. Event with actor A about B: inserted, WHEN false, B's mark and session untouched;
  actor B while acting as A: `violates row-level security policy for table "audit_event"`. A session for B with a
  start, as A: RLS refusal, and B's row lock is released with the failed statement (ran: B's sign_in_lock_account()
  returned at once). tp_app can end its own sessions at will with either action (acceptable).
  request_id is bounded by audit_event_request_id_check (ran: 200 characters refused).
- Functions: all five owned by tp_owner; the four definers carry `search_path=pg_catalog, public, pg_temp`; the
  invoker `pg_catalog, pg_temp`; ACLs are tp_owner (+ tp_app on three); no PUBLIC, no set_config, no dynamic SQL, no
  new role. tp_owner reads and writes the three tables through its own ALL/INSERT policies (forced RLS does not hide
  rows from the definers).
- Triggers: audit_event AFTER INSERT fire as audit_event_password_notice, then audit_event_sign_in_not_before (name
  order); the BEFORE INSERT ones are on other actions. user_session has no other INSERT trigger. The sweep passes
  user_session_end_is_final and set_updated_at. Two reset rows in one INSERT: both fire, mark moves on (ran). COPY as
  tp_app into either table: refused by row security ("Use INSERT statements instead").
- Lock order: openSession account -> device -> session insert; reset account -> sessions (revoke, then the trigger's
  sweep, a no-op); sign_in_failed account only (FOR UPDATE, own transaction); sign_in_succeeded and
  record_sign_in_with_mfa update the row already held (no upgrade: NO KEY UPDATE both times); resolve_session session ->
  device, never the account; revoke_user_sessions sessions only; the notice trigger inserts password_notice only.
  Three-way run (resolve_session held, openSession, reset): all completed, no deadlock. Previous image's reset
  (sessions, then the account through the trigger) against the new openSession: no shared wait reasoned; the tests
  cover it (:755). Two sweeps of one account's sessions (an administrator's revoke and the trigger) lock rows by the
  same predicate; order not guaranteed by PostgreSQL, existing between two revokes (not run).
- Mechanics: runner applies each file and its schema_migrations row in one transaction (migrate.ts:195-200, 128), so
  a failed or timed-out try changes nothing and a retry starts clean; the preflight's "already exists" can only be met
  by hand-made objects. Locks: ACCESS EXCLUSIVE on "user" and user_session covers ADD COLUMN and CREATE TRIGGER;
  SHARE ROW EXCLUSIVE on audit_event is CREATE TRIGGER's own mode; GRANT and CREATE FUNCTION take no table lock; no
  statement after the loop asks for more, so nothing queues. None of the three tables is partitioned or inherited.
  Nullable, no default: no rewrite. Previous image: its inserts name their columns; no `SELECT *` on the two tables in
  apps or packages; resolve_session's %ROWTYPE variables survive a column added mid-session (ran: `active` before and
  after ALTER TABLE in one connection). A named prepared `SELECT * FROM "user"` would fail (`cached plan must not
  change result type`, ran), and none exists.
  Tests do not assert: the 40001 path (N3), another search_path (N1), a bound on S2 records, COPY.
