-- Reviewer's draft with the two guards the report proposes (DB-D3, DB-D4). Scratch only.
CREATE OR REPLACE FUNCTION audit_event_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  -- The sweep must read a snapshot taken after the stamp's lock: only READ COMMITTED gives one.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a password reset is recorded in a READ COMMITTED transaction' USING ERRCODE = 'feature_not_supported';
  END IF;
  UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp()) WHERE id = NEW.actor_id;
  UPDATE user_session SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE user_id = NEW.actor_id AND ended_at IS NULL;
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION user_session_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mark timestamptz;
BEGIN
  IF NEW.sign_in_began_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  -- A start later than this clock is no start read from it: refused whatever the mark.
  IF NEW.sign_in_began_at > clock_timestamp() OR (mark IS NOT NULL AND NEW.sign_in_began_at <= mark) THEN
    RAISE EXCEPTION 'a sign-in begun at or before the account''s password reset opens no session'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_sign_in_not_before';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION sign_in_step_current(target_user uuid, began timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT began IS NOT NULL AND began <= statement_timestamp()
     AND coalesce((SELECT u.sign_in_not_before IS NULL OR began > u.sign_in_not_before FROM "user" u WHERE u.id = target_user), false)
$$;
