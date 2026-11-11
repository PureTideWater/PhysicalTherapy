-- A sign-in begun before a password reset is refused after it (LANES Queues item 28; test matrix SGN-17 and SGN-18,
-- and SGN-16's two open cases). After migration 20261111090000. Decisions: docs/adr/0093 (new); and docs/adr/0091,
-- 0081, 0083, 0049 and 0009.
--
-- What it adds:
-- - "user".sign_in_not_before: the account's mark. No sign-in attempt begun at or before it opens a session, registers
--   a key, enrols a factor or replaces a temporary password for the account. NULL: the password was never reset.
-- - audit_event_sign_in_not_before, an AFTER INSERT trigger on audit_event with the password-changed notice's guard
--   (a person's own event: actor_kind user, object_type user, object_id the actor; docs/adr/0091 D3), for two actions:
--   password_reset_completed, and password_reset_outcome_unknown (a confirmation whose answer from the provider was
--   lost; docs/adr/0093 D9). In that transaction the database moves the account's mark to the clock's reading, under
--   the account's row lock, and then ends every session of the account still open, so a session whose transaction
--   committed while the reset ran is ended too. It refuses to run outside READ COMMITTED, where its sweep would read an
--   old snapshot.
-- - sign_in_lock_account(): the acting account's row lock (FOR NO KEY UPDATE), which the transaction that opens a
--   session and the one that records a reset take first, before any device or session row, so the two never wait on
--   each other in a cycle. It takes no argument and can name no other account.
-- - sign_in_step_began(): the database clock's reading, in whole milliseconds, that the web seals into a sign-in
--   attempt before its first provider call.
-- - user_session.sign_in_began_at: that reading, written by the sign-in that opens the session.
-- - user_session_sign_in_not_before, a BEFORE INSERT trigger on user_session: under the account's row lock, a session
--   whose sign-in began at or before the account's mark, or ahead of the clock, is refused (23514, constraint
--   user_session_sign_in_not_before). A row with no sign_in_began_at is neither checked nor locked: the previous image
--   writes none.
-- - sign_in_step_refused(target_user, began, step, request): whether an attempt begun then is refused for the account,
--   for the steps that open no session (a key registered, a factor enrolled, a temporary password replaced) and before
--   the provider is asked for a code. When the start is at or before the mark it also writes the refusal as a
--   security_event in the audit log (the object the account, the purpose naming the step), so no caller can refuse
--   without the record.
--
-- Tables touched: "user" (one nullable column), user_session (one nullable column, one trigger, the application
-- role's INSERT on that column), audit_event (one AFTER INSERT trigger; no policy changes). No PHI table, no ledger
-- table, no rule table and no pricing table is touched; no function sets app.practice_ids or app.actor_id. Every
-- function is revoked from PUBLIC. The two trigger functions are SECURITY DEFINER, owned by tp_owner, granted to no
-- role (a trigger fires without EXECUTE); sign_in_lock_account and sign_in_step_refused are SECURITY DEFINER, owned by
-- tp_owner, granted to tp_app; sign_in_step_began is SECURITY INVOKER (it reads the clock alone), granted to tp_app.
-- Runs as tp_owner.
--
-- The locks (docs/adr/0093 D10; docs/adr/0083's loop): "user" and user_session ACCESS EXCLUSIVE for the columns,
-- audit_event SHARE ROW EXCLUSIVE for the trigger, taken together with NOWAIT in one subtransaction, once a second, up
-- to 300 tries. A refused try holds and queues nothing. What refuses a try, unlike migration 20261111090000 (which took
-- "user" in a mode a reader does not refuse): any open transaction that has touched "user" in any way, a read or a
-- foreign-key check included, or user_session, or written audit_event; and a vacuum of any of the three. Every job
-- and every request reads "user", and one reconcile pass outlasts the five minutes: deploy with no reconcile queued or
-- running (docs/runbooks/deploy-and-rollback.md). If no moment comes in five minutes it fails with '"user",
-- user_session or audit_event stayed in use for five minutes; run the deploy again (docs/adr/0093)' (55P03), before
-- any service moves, changing nothing. Once held, to the commit (catalog changes only: both columns are nullable with
-- no default, so no row is rewritten or read), every request waits (each resolves its session), then proceeds.
--
-- Safe with the previous image running, and on rollback (ADR 0009; ADR 0049): every object is added.
-- - The previous web names its columns when it opens a session, so its rows carry no sign_in_began_at and are not
--   checked: the gap this migration closes stays open for that image alone. Its resets move the mark and end the
--   sessions, since both are the database's. It calls neither new function.
-- - The new web's steps are refused only against a mark, which only a reset moves.
-- Rollout: migrate, then the web. The rollback floor: none of its own.

-- ---------------------------------------------------------------------------------------------------
-- Preflight: nothing this migration creates exists, and what it builds on is there
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '"user"'::regclass AND attname = 'sign_in_not_before' AND NOT attisdropped)
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'user_session'::regclass AND attname = 'sign_in_began_at' AND NOT attisdropped) THEN
    RAISE EXCEPTION '"user".sign_in_not_before or user_session.sign_in_began_at already exists; migration 20261112090000 adds them' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF to_regprocedure('audit_event_sign_in_not_before()') IS NOT NULL OR to_regprocedure('user_session_sign_in_not_before()') IS NOT NULL
     OR to_regprocedure('sign_in_step_began()') IS NOT NULL OR to_regprocedure('sign_in_lock_account()') IS NOT NULL
     OR to_regprocedure('sign_in_step_refused(uuid, timestamptz, text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'a function migration 20261112090000 creates already exists' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- The guard this migration's trigger repeats is the notice trigger's, as migration 20261111090000 wrote it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'audit_event'::regclass AND t.tgname = 'audit_event_password_notice' AND NOT t.tgisinternal
       AND position('(new.actor_kind = ''user''::text) AND (new.object_type = ''user''::text) AND (new.object_id = new.actor_id)' IN pg_get_triggerdef(t.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'audit_event_password_notice is not the trigger of migration 20261111090000 whose guard migration 20261112090000 repeats; rebase this migration on its latest text'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The table locks, without a queue (docs/adr/0093, D10; docs/adr/0083's loop)
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE user_session IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE audit_event IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION '"user", user_session or audit_event stayed in use for five minutes; run the deploy again (docs/adr/0093)' USING ERRCODE = 'lock_not_available';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 1. The mark, and the start a session records
-- ---------------------------------------------------------------------------------------------------

-- The account's mark: no sign-in attempt begun at or before it goes on for the account. Moved by the database alone
-- (section 4); the application role holds no INSERT or UPDATE on it. NULL: the password was never reset.
ALTER TABLE "user" ADD COLUMN sign_in_not_before timestamptz;

-- When the sign-in that opened the session began, on the database's clock, read before its first provider call
-- (section 2). NULL: opened before this column, or by the image before it.
ALTER TABLE user_session ADD COLUMN sign_in_began_at timestamptz;
GRANT INSERT (sign_in_began_at) ON user_session TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- 2. The attempt's start, and the account's row first
-- ---------------------------------------------------------------------------------------------------

-- Whole milliseconds, so the value is the same after the driver's Date and back; truncation only moves a start
-- earlier, the refusing side. The clock's own reading, never the transaction's start.
CREATE FUNCTION sign_in_step_began() RETURNS timestamptz
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT date_trunc('milliseconds', clock_timestamp())
$$;
REVOKE ALL ON FUNCTION sign_in_step_began() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_in_step_began() TO tp_app;

-- The acting account's row lock, to the end of the transaction: the first statement of the transaction that opens a
-- session and of the one that records a reset, so each takes the account before its devices and sessions and the two
-- never wait on each other in a cycle (docs/adr/0093, D2). FOR NO KEY UPDATE: the lock sign_in_succeeded() and
-- record_sign_in_with_mfa() take later in the sign-in's transaction, so nothing is upgraded, and no foreign-key check
-- waits on it. No argument: it can name no account but the actor's own.
CREATE FUNCTION sign_in_lock_account() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM "user" u WHERE u.id = app_actor_id() FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an account locks its own row, as the actor of its transaction' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION sign_in_lock_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_in_lock_account() TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- 3. Whether an attempt is refused, with the refusal recorded
-- ---------------------------------------------------------------------------------------------------

-- True when the account does not exist, the attempt has no start, its start is ahead of the clock, or its start is at
-- or before the account's mark. That last is the evidence (someone held a step from before the reset), and it is
-- written as a security_event for the account before the answer is given, as sign_in_failed() writes its own; the
-- others record nothing. It counts no failure: a count would let a stale step lock the account. Its own statement in
-- a READ COMMITTED transaction, so it reads the mark as committed now.
CREATE FUNCTION sign_in_step_refused(target_user uuid, began timestamptz, step text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mark timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a sign-in step is judged in a READ COMMITTED transaction' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF step IS NULL OR step NOT IN ('new_password', 'mfa_setup', 'mfa', 'key', 'register_key', 'key_registered') THEN
    RAISE EXCEPTION 'unknown sign-in step' USING ERRCODE = 'check_violation';
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = target_user;
  IF NOT FOUND OR began IS NULL OR began > clock_timestamp() THEN
    RETURN true;
  END IF;
  IF mark IS NULL OR began > mark THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES ('system', 'security_event', 'user', target_user,
            CASE step WHEN 'key_registered' THEN 'key_registered_across_reset' ELSE 'step_before_reset_' || step END, request);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION sign_in_step_refused(uuid, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_in_step_refused(uuid, timestamptz, text, text) TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- 4. A reset moves the mark and ends the sessions, under the account's row lock
-- ---------------------------------------------------------------------------------------------------

-- The update takes the account's row lock (the web's transaction holds it already: section 2; the previous image's
-- does not, and waits here for a sign-in that holds it). The sweep is a new statement, so it sees every session
-- committed before the lock was won and ends it. GREATEST, so the mark never moves back. Outside READ COMMITTED the
-- sweep would read the transaction's old snapshot and leave such a session live while the mark moved: refused.
CREATE FUNCTION audit_event_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a password reset is recorded in a READ COMMITTED transaction' USING ERRCODE = 'feature_not_supported';
  END IF;
  UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp()) WHERE id = NEW.actor_id;
  UPDATE user_session SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE user_id = NEW.actor_id AND ended_at IS NULL;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_event_sign_in_not_before() FROM PUBLIC;
-- The notice trigger's guard (docs/adr/0091, D3): a person's own event, and nothing else. Two actions: a reset, and a
-- confirmation whose outcome at the provider is unknown (docs/adr/0093, D9), which queues no notice.
CREATE TRIGGER audit_event_sign_in_not_before AFTER INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action IN ('password_reset_completed', 'password_reset_outcome_unknown') AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id)
  EXECUTE FUNCTION audit_event_sign_in_not_before();

-- ---------------------------------------------------------------------------------------------------
-- 5. The database refuses a session whose sign-in began at or before the mark
-- ---------------------------------------------------------------------------------------------------

-- Whichever of this insert and a reset holds the account's row, the other waits for its commit: the reset then ends
-- this session, or this insert reads the moved mark and is refused. A start ahead of the clock is no start: a value
-- from another clock, or 'infinity', would otherwise pass every later mark. A definer: an invoker's trigger would read
-- "user" through the caller's policies and skip a row the caller cannot see. A row with no start is the previous
-- image's: not checked, and not locked (locked, it would always land after a reset and never be swept).
CREATE FUNCTION user_session_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mark timestamptz;
BEGIN
  IF NEW.sign_in_began_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  IF NEW.sign_in_began_at > clock_timestamp() OR (mark IS NOT NULL AND NEW.sign_in_began_at <= mark) THEN
    RAISE EXCEPTION 'a sign-in begun at or before the account''s password reset opens no session; sign in again'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_sign_in_not_before';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION user_session_sign_in_not_before() FROM PUBLIC;
CREATE TRIGGER user_session_sign_in_not_before BEFORE INSERT ON user_session FOR EACH ROW
  EXECUTE FUNCTION user_session_sign_in_not_before();
