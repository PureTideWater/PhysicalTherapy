# Delta review, database: 47c99ac7..1ae2952e (migration 20261112090000, password_notice.mfa_enrolled_at_reset)

Read-only review. Experiments in scratch database dr3 (TEMPLATE sbr, PostgreSQL 18.4), dropped afterwards. No test suite run.
Counts: blocking 0, should-fix 2, note 7.

## Should-fix

S1. The trigger reads mfa_enrolled without the account's row lock, so the kept fact can differ from the account as the reset commits.
  packages/db/migrations/20261112090000_sign_in_not_before.sql:345
  audit_event_password_notice fires before audit_event_sign_in_not_before (name order), and only the second takes the row lock.
  A change of mfa_enrolled that is uncommitted at the read and commits while the reset waits on the row is missed.
  Verified, two sessions (other session: BEGIN; UPDATE "user" SET mfa_enrolled = ...; pg_sleep(3); COMMIT; reset inserts the event at 1 s):
    - true -> false in flight: in the reset's transaction live = f, kept = t  (the email would claim a factor that is gone; the overclaim side)
    - false -> true in flight: live = t, kept = f  (the side that claims less)
    - same true -> false, but SELECT ... FOR NO KEY UPDATE first (what sign_in_lock_account() does): live = f, kept = f
  Reach: the new web image locks first (apps/web/src/lib/auth/sign-in.ts:858), so it is correct there. The previous web
  image records resets without the lock (rolling deploy, rollback), as does any other caller. The overclaim direction needs a
  writer that clears the flag: none exists for tp_app (UPDATE (mfa_enrolled) is revoked; record_sign_in_with_mfa() only sets
  true), so today only owner SQL can do it. The migration's header promises the fact "whatever the caller did first".
  Smallest fix: read under the lock inside the function (DECLARE kept boolean; SELECT u.mfa_enrolled INTO kept FROM "user" u
  WHERE u.id = NEW.actor_id FOR NO KEY UPDATE; then insert kept). Verified in scratch: the true -> false case then prints
  live = f, kept = f. No new lock order: the next trigger takes the same row lock in the same statement. The body's hash in
  packages/db/functions and the domain model change with it.

S2. The lock-loop test never exercises the fourth lock.
  packages/db/src/sign-in-not-before.db.test.ts:1058-1062 (tableLocks filters to three tables), 1100-1104 (three holders), 1116-1120
  The only proof that password_notice is locked is a string match on the file (line 1009). Deleting the LOCK statement's
  effect, or moving it out of the subtransaction, would still pass the behavioural half. Smallest fix: add password_notice to
  tableLocks and its final expected set (AccessExclusiveLock, granted), and a fourth holder that touches password_notice
  only (as owner: BEGIN; SELECT count(*) FROM password_notice). Not the claim: see N3.

## Notes (no change required unless stated)

N1. Visibility: verified. "user" and password_notice are FORCE RLS, tp_owner has no BYPASSRLS, but policies user_owner and
  password_notice_owner are ALL/true for tp_owner, and the function is a definer owned by tp_owner, so the subquery sees the
  row for every inserting role. No row gives NULL, but then the insert fails on password_notice_user_id_fkey, so NULL is
  reachable only for rows queued before the migration (and owner SQL). ON CONFLICT on audit_event_id cannot keep a stale fact.
N2. Preflight: verified. Recreating both bodies from 20261111090000 gives exactly e0e771da...3abf and 600ad9df...a0fb. A
  missing function makes the scalar subquery NULL, IS DISTINCT FROM is true, and it refuses (with the "not the body" text).
  The missing-function case has no test (sign-in-not-before.db.test.ts:1205-1215 covers altered bodies and the column).
N3. Lock loop: ACCESS EXCLUSIVE on password_notice is needed (ADD COLUMN takes it anyway; taken later it would queue behind
  an open claim while holding "user" ACCESS EXCLUSIVE, and the claim's later reads of "user" would close a deadlock) and
  sufficient (no other object of the table is touched). No deadlock: every try is NOWAIT in one subtransaction. Verified with
  an open operator_password_notice_claim() transaction: the try is refused already at "user" (the claim joins "user") and
  keeps 0 of the four locks. Position in the loop does not matter for the same reason.
N4. Stale comments after the fourth table: migration lines 55 ("a vacuum of the three") and 116 ("takes the three locks").
N5. Replaced claim versus the old: same PERFORM ... FOR UPDATE SKIP LOCKED, same 24-hour cutoff, same join, same four result
  columns and types (CREATE OR REPLACE applied in sbr). Only the fourth expression changed. The previous worker image reads
  it unchanged. Behaviour change for it: notices queued before the migration (NULL) now answer false even for an enrolled
  account, for at most 24 hours of backlog; the stated side.
N6. Privileges: verified in sbr. audit_event_password_notice {tp_owner=X}; operator_password_notice_claim {tp_owner=X,
  tp_operator=X}; identical to the ACLs after 20261111090000 alone. The REVOKE FROM PUBLIC and the GRANT at line 380 are
  no-ops; nothing gained, nothing lost. password_notice has no column ACL; tp_app has no privilege on it.
N7. Column order: the database has mfa_enrolled_at_reset last (after updated_at), and Drizzle declares it last
  (packages/db/src/schema/operations.ts:352-353). The notice test proves both directions against the live value and the
  NULL case (password-notice.db.test.ts:656-666). Nothing in the delta's assertions depends on 18.4 lock sets: the one exact
  set is filtered to named tables, which 18.6's index lock does not enter. Unverified: the suites were not run, on 18.4 or 18.6.
