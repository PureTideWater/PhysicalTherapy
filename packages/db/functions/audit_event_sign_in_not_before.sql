-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_event_sign_in_not_before()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 95e3d21df4b9bd10
-- Trigger function of: audit_event.audit_event_sign_in_not_before
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.audit_event_sign_in_not_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a password reset is recorded at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  UPDATE "user" u SET sign_in_not_before = GREATEST(u.sign_in_not_before, clock_timestamp()) WHERE u.id = NEW.actor_id;
  UPDATE user_session s SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE s.user_id = NEW.actor_id AND s.ended_at IS NULL;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.audit_event_sign_in_not_before() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_event_sign_in_not_before() FROM PUBLIC;
