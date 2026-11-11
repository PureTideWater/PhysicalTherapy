-- A sign-in step begun before a password reset is refused after it (LANES.md Queues item 28; test matrix SGN-17 and
-- SGN-18). After migration 20261111090000. Decisions: docs/adr/0093 (new); and docs/adr/0091, 0081, 0083, 0049 and 0009.
--
-- What it adds:
-- - "user".sign_in_not_before (timestamptz, nullable; NULL: the account's password was never reset): the mark. No
--   sign-in attempt begun at or before it opens a session for the account afterwards.
-- - audit_event_sign_in_not_before, an AFTER INSERT trigger on audit_event, under the password notice's guard
--   (docs/adr/0091 D3: a person recording it about their own account), for the actions password_reset_completed and
--   password_reset_outcome_unknown: in the reset's own transaction it moves the account's mark to the database's
--   clock (never back) and ends every open session of the account, so "the reset is recorded" implies "every session
--   ended" in the database, whatever the caller did first. It refuses to run outside READ COMMITTED.
-- - user_session.sign_in_began_at (timestamptz, nullable): when the attempt that opens the session began, read from
--   sign_in_step_began() before the attempt's first provider call. The application role may insert it.
-- - user_session_sign_in_not_before, a BEFORE INSERT trigger on user_session for a row that carries a start: under the
--   account's row lock it refuses a start at or before the mark, and a start ahead of the clock (the constraint name
--   user_session_sign_in_not_before). A row with no start is the previous image's insert: not checked, not locked.
-- - sign_in_step_began(): the database's clock in whole milliseconds, the start an attempt carries.
-- - sign_in_lock_account(): the acting account's own row lock, taken first by the two transactions that need it (the
--   one that opens a session, the one that records a reset), so every transaction takes the account's row before a
--   device or a session row (docs/adr/0093 D2).
-- - sign_in_step_refused(target_user, began, step, request): why a step of an attempt is refused (no_account,
--   no_start, ahead_of_clock, before_reset), or NULL when it is not; a start at or before the mark (before_reset) is
--   recorded as a security_event for the account in the same call, once for an account, a step and a mark, so no
--   caller refuses without the record and a replayed step adds none.
-- - sign_in_lock_key_across_reset(target_user, request): locks an account whose hardware key was registered across
--   its reset and could not be removed at the provider (docs/adr/0093 D6), so the key opens nothing until a platform
--   administrator has had it removed and unlocks the account. It refuses unless that registration is on record.
-- - unlock_user(target_user) (replaced: the body of migration 20261015170000 with one refusal added) refuses to unlock
--   an account locked for such a key (the constraint name user_key_across_reset_hold) until a security_event with the
--   purpose key_across_reset_cleared is recorded after the lock, which only the owner writes once the key is removed
--   at the provider (docs/runbooks/incident-response.md), so the ordinary unlock never hands the key a sign-in.
-- - password_notice.mfa_enrolled_at_reset (boolean, nullable; NULL: a notice queued before this migration): whether
--   the account had a second factor when its reset was recorded, written by the notice's trigger in the reset's own
--   transaction (audit_event_password_notice(), replaced: the body of migration 20261111090000 with the one column
--   added). operator_password_notice_claim(uuid) (replaced, its result columns unchanged) returns that fact as
--   mfa_enrolled, and false when there is none, so the email says a second factor guards the account only when one did
--   at the reset, never because someone enrolled one between the reset and the send (docs/adr/0091 D4 and D10, case
--   (d); the delta review's DS-03 and DD-01).
--
-- Tables touched: password_notice (one nullable column, no default: catalog only); "user" (one nullable column, no default: catalog only, no rewrite, no scan); user_session (one
-- nullable column, the same; one BEFORE INSERT trigger; one column grant); audit_event (one AFTER INSERT trigger). One
-- existing function is replaced in place, unlock_user(uuid), its signature, owner and grant unchanged; so are the
-- notice's trigger function and its claim. No
-- PHI table, no ledger table, no rule table and no pricing table is touched; no function sets app.practice_ids or
-- app.actor_id. Every function is revoked from PUBLIC. The two trigger functions are SECURITY DEFINER, owned by
-- tp_owner and granted to no role (a trigger fires without EXECUTE); sign_in_lock_account(), sign_in_step_refused() and
-- sign_in_lock_key_across_reset() are SECURITY DEFINER, owned by tp_owner, granted to tp_app alone; sign_in_step_began() is SECURITY INVOKER, granted
-- to tp_app alone. Runs as tp_owner.
--
-- The locks (docs/adr/0093 D10; docs/adr/0083's loop): "user", user_session and password_notice ACCESS EXCLUSIVE for
-- the columns (and user_session's trigger), audit_event SHARE ROW EXCLUSIVE for the trigger, taken together with NOWAIT in one
-- subtransaction, once a second, up to 300 tries. A refused try holds and queues nothing. Unlike migration
-- 20261111090000, which took "user" in a mode readers do not refuse, a try here is refused by ANY open transaction
-- that has touched "user" (a read or a foreign-key check included) or user_session, or has written audit_event, and by
-- a vacuum of the three. Every request and every job reads "user", and one reconcile pass outlasts the five minutes:
-- deploy off-hours with no reconcile queued or running (docs/runbooks/deploy-and-rollback.md). If no moment comes in
-- five minutes it fails with '"user", user_session, audit_event or password_notice stayed in use for five minutes;
-- run the deploy again (docs/adr/0093)', before any service moves, having changed nothing.
--
-- Safe with the previous image running (add only; docs/adr/0009, docs/adr/0049): every object is added. The previous
-- image's session insert carries no start and is neither checked nor locked; its reset still records
-- password_reset_completed, on which the mark moves and the sessions end, both being the database's. Rollback floor:
-- none of its own.

-- ---------------------------------------------------------------------------------------------------
-- Preflight: nothing this migration creates exists, and the guard it shares is the one its design read
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public."user"'::regclass AND a.attname = 'sign_in_not_before' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION '"user".sign_in_not_before already exists; migration 20261112090000 creates it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.user_session'::regclass AND a.attname = 'sign_in_began_at' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'user_session.sign_in_began_at already exists; migration 20261112090000 creates it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF to_regprocedure('audit_event_sign_in_not_before()') IS NOT NULL OR to_regprocedure('user_session_sign_in_not_before()') IS NOT NULL
     OR to_regprocedure('sign_in_step_began()') IS NOT NULL OR to_regprocedure('sign_in_lock_account()') IS NOT NULL
     OR to_regprocedure('sign_in_step_refused(uuid, timestamptz, text, text)') IS NOT NULL
     OR to_regprocedure('sign_in_lock_key_across_reset(uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'a function of migration 20261112090000 already exists; it creates them' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- unlock_user() is replaced whole: its stored body must be the one of migration 20261015170000 (pg_proc.prosrc, by
  -- SHA-256, as migration 20261111090000's preflight compares), or this migration refuses until it is rebased.
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('public.unlock_user(uuid)'))
     IS DISTINCT FROM 'dcb9d4ff9b6626f14cb8959f6d24d9eaa1c38e22ad7e697375898c3e4fba9623' THEN
    RAISE EXCEPTION 'unlock_user(uuid) is not the body of migration 20261015170000 that migration 20261112090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- The notice's trigger function and its claim are replaced whole, compared the same way.
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('public.audit_event_password_notice()'))
     IS DISTINCT FROM 'e0e771daa158c3d448140f54e923925a44bfc444d2b4b705455be26cbecf3abf'
     OR (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('public.operator_password_notice_claim(uuid)'))
     IS DISTINCT FROM '600ad9dfc04e5a6b973096edebe703fea3976b7c6a4b614b451aa6bf7dcfa0fb' THEN
    RAISE EXCEPTION 'audit_event_password_notice() or operator_password_notice_claim(uuid) is not the body of migration 20261111090000 that migration 20261112090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.password_notice'::regclass AND a.attname = 'mfa_enrolled_at_reset' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'password_notice.mfa_enrolled_at_reset already exists; migration 20261112090000 creates it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- The mark moves under the password notice's guard (docs/adr/0091 D3). If that trigger is gone or its guard is no
  -- longer the one read here, this migration refuses until it is rebased on the new guard. The catalog prints the
  -- function's schema only when public is off the search path; either spelling is the same trigger.
  IF (SELECT replace(pg_get_triggerdef(t.oid), 'EXECUTE FUNCTION public.', 'EXECUTE FUNCTION ') FROM pg_trigger t WHERE t.tgrelid = 'public.audit_event'::regclass AND t.tgname = 'audit_event_password_notice' AND NOT t.tgisinternal)
     IS DISTINCT FROM 'CREATE TRIGGER audit_event_password_notice AFTER INSERT ON public.audit_event FOR EACH ROW WHEN (((new.action = ''password_reset_completed''::text) AND (new.actor_kind = ''user''::text) AND (new.object_type = ''user''::text) AND (new.object_id = new.actor_id))) EXECUTE FUNCTION audit_event_password_notice()' THEN
    RAISE EXCEPTION 'audit_event_password_notice is not the trigger of migration 20261111090000 whose guard migration 20261112090000 shares; rebase this migration on its latest guard'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The table locks, without a queue (docs/adr/0093, D10)
-- ---------------------------------------------------------------------------------------------------

-- Each try takes the three locks in one subtransaction with NOWAIT: a refused try releases what it took and queues
-- nobody, so no request waits behind this migration. Held to the end of the migration.
DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE user_session IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE audit_event IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE password_notice IN ACCESS EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION '"user", user_session, audit_event or password_notice stayed in use for five minutes; run the deploy again (docs/adr/0093)' USING ERRCODE = 'lock_not_available';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 1. The mark and the start (docs/adr/0093, D1 and D4)
-- ---------------------------------------------------------------------------------------------------

-- Nullable, no default: catalog-only changes.
ALTER TABLE "user" ADD COLUMN sign_in_not_before timestamptz;
ALTER TABLE user_session ADD COLUMN sign_in_began_at timestamptz;

-- ---------------------------------------------------------------------------------------------------
-- 2. The attempt's start, and the account's lock (docs/adr/0093, D2 and D3)
-- ---------------------------------------------------------------------------------------------------

-- The database's clock, in whole milliseconds so the value survives the driver's Date both ways exactly; truncation
-- only moves a start earlier, the refusing side. Read once an attempt, before its first provider call.
CREATE FUNCTION sign_in_step_began() RETURNS timestamptz
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
  SELECT date_trunc('milliseconds', clock_timestamp())
$$;

-- The acting account's own row, locked FOR NO KEY UPDATE (the transaction updates the row later; a shared lock that
-- two sign-ins each upgraded would deadlock; foreign-key checks are not blocked). It takes no argument, so it can name
-- no other account. Called first by the transaction that opens a session and by the one that records a reset.
CREATE FUNCTION sign_in_lock_account() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM "user" u WHERE u.id = app_actor_id() FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only an account locks its own row for sign-in' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3. What moves the mark: the account's own recorded reset (docs/adr/0093, D1 and D9)
-- ---------------------------------------------------------------------------------------------------

-- In the reset's own transaction. The UPDATE of "user" takes the account's row lock (already held when the caller
-- called sign_in_lock_account() first) and moves the mark, never back; the sweep is a new statement, so at READ
-- COMMITTED it reads a new snapshot and ends every session committed before it, and a session insert that carries a
-- start waits on the account's lock and then reads the moved mark. At REPEATABLE READ or above the sweep would read
-- the transaction's old snapshot and could leave a session live while the mark moved, so the function refuses.
CREATE FUNCTION audit_event_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a password reset is recorded at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  UPDATE "user" u SET sign_in_not_before = GREATEST(u.sign_in_not_before, clock_timestamp()) WHERE u.id = NEW.actor_id;
  UPDATE user_session s SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE s.user_id = NEW.actor_id AND s.ended_at IS NULL;
  RETURN NULL;
END;
$$;
-- The guard is the password notice's (docs/adr/0091 D3): the actor is a person and the object is that person's own
-- account, so no event one account records moves another's mark or ends another's sessions. Two actions: a completed
-- reset, and one whose outcome at the provider is unknown (docs/adr/0093 D9), read on the safer side.
CREATE TRIGGER audit_event_sign_in_not_before AFTER INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action IN ('password_reset_completed', 'password_reset_outcome_unknown') AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id)
  EXECUTE FUNCTION audit_event_sign_in_not_before();

-- ---------------------------------------------------------------------------------------------------
-- 4. The database refuses a stale session (docs/adr/0093, D4)
-- ---------------------------------------------------------------------------------------------------

-- A definer: an invoker's trigger would read "user" through the caller's policies and skip a row the caller cannot
-- see. Under the account's row lock either order is right: the session's transaction first, and the reset waits for
-- its commit and ends it; the reset first, and this insert waits, reads the moved mark and is refused. A start ahead
-- of the clock is refused too: 'infinity', a value from another clock or a units slip would otherwise pass for good.
CREATE FUNCTION user_session_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mark timestamptz;
BEGIN
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  IF NEW.sign_in_began_at > clock_timestamp() OR (mark IS NOT NULL AND NEW.sign_in_began_at <= mark) THEN
    RAISE EXCEPTION 'a session is not opened by a sign-in begun at or before the account''s latest password reset, or ahead of the clock'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_sign_in_not_before';
  END IF;
  RETURN NEW;
END;
$$;
-- A row with no start is the previous image's insert (a rollback, and the minutes of a rolling deploy): it is neither
-- checked nor locked. Locking it would be worse than not: it would then always land after the reset, never swept.
CREATE TRIGGER user_session_sign_in_not_before BEFORE INSERT ON user_session FOR EACH ROW
  WHEN (NEW.sign_in_began_at IS NOT NULL)
  EXECUTE FUNCTION user_session_sign_in_not_before();

-- ---------------------------------------------------------------------------------------------------
-- 5. The steps that open no session: checked and recorded in one call (docs/adr/0093, D5 and D6)
-- ---------------------------------------------------------------------------------------------------

-- Why the step is refused, or NULL when it is not: no_account (the account does not exist), no_start (the step
-- carries none), ahead_of_clock (the start is ahead of the database's clock), before_reset (the start is at or before
-- the account's mark). Only the last is evidence (the old password, or a key assertion, was proved around a reset): it
-- writes a security_event for the account, as sign_in_failed() writes its own, with the step in the purpose and the
-- request's ID, once for an account, a step and a mark (a replayed step, or a caller repeating the call, adds no
-- row). The row's time is the clock's, not the transaction's start, so "since the mark" is read on the mark's own
-- clock whenever the calling transaction began. It counts no failure: a count would let a stale step lock the account. It reads the committed mark and takes
-- no lock; the session insert's trigger is the exact check.
CREATE FUNCTION sign_in_step_refused(target_user uuid, began timestamptz, step text, request text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  mark timestamptz;
  what text;
BEGIN
  IF step IS NULL OR step NOT IN ('new_password', 'mfa_setup', 'mfa', 'key', 'register_key', 'key_registered') THEN
    RAISE EXCEPTION 'unknown sign-in step' USING ERRCODE = 'check_violation';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a sign-in step is judged at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = target_user;
  IF NOT FOUND THEN
    RETURN 'no_account';
  END IF;
  IF began IS NULL THEN
    RETURN 'no_start';
  END IF;
  IF began > clock_timestamp() THEN
    RETURN 'ahead_of_clock';
  END IF;
  IF mark IS NULL OR began > mark THEN
    RETURN NULL;
  END IF;
  what := CASE WHEN step = 'key_registered' THEN 'key_registered_across_reset' ELSE 'step_before_reset_' || step END;
  IF NOT EXISTS (SELECT 1 FROM audit_event e
                  WHERE e.object_type = 'user' AND e.object_id = target_user AND e.action = 'security_event'
                    AND e.actor_kind = 'system' AND e.purpose = what AND e.at >= mark) THEN
    INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES (clock_timestamp(), 'system', 'security_event', 'user', target_user, what, request);
  END IF;
  RETURN 'before_reset';
END;
$$;

-- A hardware key registered across the account's reset that the provider did not remove (the reset's own sign-out
-- has ended the token that could remove it): the account is locked, as ten failed sign-ins lock it, so the key signs
-- in to nothing, and the lock is recorded (account_locked_key_across_reset) whether or not the account was locked
-- already, since that record is what holds unlock_user() until the key is cleared. It refuses unless
-- sign_in_step_refused() has recorded that registration since the account's mark, so it locks no account without
-- that evidence. True when this call locked it; false when it was locked already.
CREATE FUNCTION sign_in_lock_key_across_reset(target_user uuid, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  mark timestamptz;
  was_locked boolean;
BEGIN
  SELECT u.sign_in_not_before, u.locked_at IS NOT NULL INTO mark, was_locked FROM "user" u WHERE u.id = target_user FOR NO KEY UPDATE;
  IF NOT FOUND OR mark IS NULL OR NOT EXISTS (
       SELECT 1 FROM audit_event e
        WHERE e.object_type = 'user' AND e.object_id = target_user AND e.action = 'security_event'
          AND e.actor_kind = 'system' AND e.purpose = 'key_registered_across_reset' AND e.at >= mark) THEN
    RAISE EXCEPTION 'an account is locked for a key registered across its reset only when that registration is on record'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT was_locked THEN
    UPDATE "user" u SET locked_at = now() WHERE u.id = target_user;
  END IF;
  INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES (clock_timestamp(), 'system', 'security_event', 'user', target_user, 'account_locked_key_across_reset', request);
  RETURN NOT was_locked;
END;
$$;

-- The unlock, as migration 20261015170000 created it, with one refusal: an account locked for a key registered across
-- its reset stays locked until the key is cleared. The hold is the latest account_locked_key_across_reset event with
-- no key_across_reset_cleared event after it; both are security_event rows the application role cannot write
-- (audit_event_record reserves the action), and the second is written by the owner once the key is removed at the
-- provider. Without the hold, the ordinary unlock would hand the key its sign-in.
CREATE OR REPLACE FUNCTION unlock_user(target_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  IF NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator unlocks an account' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The account's row first: a lock for a key that is still in its transaction is waited for, so the hold it records
  -- is read here and an account locked already (by ten failures) is not unlocked beside it.
  PERFORM 1 FROM "user" u WHERE u.id = target_user FOR NO KEY UPDATE;
  IF EXISTS (
       SELECT 1 FROM audit_event held
        WHERE held.object_type = 'user' AND held.object_id = target_user AND held.action = 'security_event'
          AND held.actor_kind = 'system' AND held.purpose = 'account_locked_key_across_reset'
          AND NOT EXISTS (
            SELECT 1 FROM audit_event cleared
             WHERE cleared.object_type = 'user' AND cleared.object_id = target_user AND cleared.action = 'security_event'
               AND cleared.actor_kind = 'system' AND cleared.purpose = 'key_across_reset_cleared' AND cleared.at > held.at)) THEN
    RAISE EXCEPTION 'an account locked for a hardware key registered across its password reset is unlocked only after the key is cleared'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_key_across_reset_hold';
  END IF;
  UPDATE "user" SET failed_sign_ins = 0, locked_at = NULL WHERE id = target_user AND locked_at IS NOT NULL;
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6. The notice keeps the second-factor fact as it was at the reset (docs/adr/0091, D4 and D10, case (d))
-- ---------------------------------------------------------------------------------------------------

-- Nullable, no default: a catalog-only change. NULL is a notice queued before this migration.
ALTER TABLE password_notice ADD COLUMN mfa_enrolled_at_reset boolean;

-- As migration 20261111090000 created it, with the one column: the account's second-factor fact is read in the
-- reset's own transaction, so a factor enrolled after the reset (by whoever completed it) is not what the email
-- reports. The guard on the trigger is unchanged, so the actor is the account itself and its row exists.
CREATE OR REPLACE FUNCTION audit_event_password_notice() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at, mfa_enrolled_at_reset)
  VALUES (NEW.actor_id, NEW.id, NEW.at, NEW.at + interval '90 days', (SELECT u.mfa_enrolled FROM "user" u WHERE u.id = NEW.actor_id))
  ON CONFLICT ON CONSTRAINT password_notice_once DO NOTHING;
  RETURN NULL;
END;
$$;

-- As migration 20261111090000 created it, but mfa_enrolled is the fact kept at the reset, and false for a notice that
-- kept none: the email then says nothing about a second factor, the side that claims less. The result's columns are
-- unchanged, so the previous image's job reads it as before.
CREATE OR REPLACE FUNCTION operator_password_notice_claim(notice uuid) RETURNS TABLE (user_id uuid, email text, changed_at timestamptz, mfa_enrolled boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  PERFORM 1 FROM password_notice p
    WHERE p.id = notice AND p.state = 'pending' AND p.next_attempt_at <= now() AND p.changed_at > now() - interval '24 hours'
      FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.user_id, u.email, p.changed_at, coalesce(p.mfa_enrolled_at_reset, false) FROM password_notice p JOIN "user" u ON u.id = p.user_id WHERE p.id = notice;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 7. Privileges, once
-- ---------------------------------------------------------------------------------------------------

GRANT INSERT (sign_in_began_at) ON user_session TO tp_app;
REVOKE ALL ON FUNCTION sign_in_step_began(), sign_in_lock_account(), audit_event_sign_in_not_before(),
  user_session_sign_in_not_before(), sign_in_step_refused(uuid, timestamptz, text, text),
  sign_in_lock_key_across_reset(uuid, text), unlock_user(uuid), audit_event_password_notice(),
  operator_password_notice_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_in_step_began(), sign_in_lock_account(), sign_in_step_refused(uuid, timestamptz, text, text),
  sign_in_lock_key_across_reset(uuid, text), unlock_user(uuid) TO tp_app;
GRANT EXECUTE ON FUNCTION operator_password_notice_claim(uuid) TO tp_operator;
