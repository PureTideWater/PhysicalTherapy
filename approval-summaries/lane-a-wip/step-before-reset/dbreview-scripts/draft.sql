-- Reviewer's draft of the design's D1-D4 and D7 (scratch only; not for merge).
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
  RAISE EXCEPTION '"user", user_session or audit_event stayed in use for five minutes; run the deploy again' USING ERRCODE = 'lock_not_available';
END;
$$;

ALTER TABLE "user" ADD COLUMN sign_in_not_before timestamptz;
ALTER TABLE user_session ADD COLUMN sign_in_began_at timestamptz;

-- D1
CREATE FUNCTION audit_event_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp()) WHERE id = NEW.actor_id;
  UPDATE user_session SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE user_id = NEW.actor_id AND ended_at IS NULL;
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_event_sign_in_not_before AFTER INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action = 'password_reset_completed' AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id)
  EXECUTE FUNCTION audit_event_sign_in_not_before();

-- D2
CREATE FUNCTION sign_in_step_began() RETURNS timestamptz
LANGUAGE sql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT date_trunc('milliseconds', clock_timestamp())
$$;

-- D3
CREATE FUNCTION user_session_sign_in_not_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mark timestamptz;
BEGIN
  IF NEW.sign_in_began_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  IF mark IS NOT NULL AND NEW.sign_in_began_at <= mark THEN
    RAISE EXCEPTION 'a sign-in begun at or before the account''s password reset opens no session'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_sign_in_not_before';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_session_sign_in_not_before BEFORE INSERT ON user_session FOR EACH ROW
  EXECUTE FUNCTION user_session_sign_in_not_before();

-- D4
CREATE FUNCTION sign_in_step_current(target_user uuid, began timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT began IS NOT NULL
     AND coalesce((SELECT u.sign_in_not_before IS NULL OR began > u.sign_in_not_before FROM "user" u WHERE u.id = target_user), false)
$$;

GRANT INSERT (sign_in_began_at) ON user_session TO tp_app;
REVOKE ALL ON FUNCTION audit_event_sign_in_not_before(), sign_in_step_began(), user_session_sign_in_not_before(), sign_in_step_current(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_in_step_began(), sign_in_step_current(uuid, timestamptz) TO tp_app;
