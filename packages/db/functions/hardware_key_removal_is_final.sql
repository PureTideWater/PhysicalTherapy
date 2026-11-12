-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_removal_is_final()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 81471c644f75ca39
-- Trigger function of: hardware_key_removal.hardware_key_removal_is_final
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_removal_is_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a key removal''s record is never deleted' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  IF (NEW.id, NEW.user_id, NEW.requested_by, NEW.requested_at, NEW.expires_at, NEW.request_id, NEW.address_sha256)
       IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.requested_by, OLD.requested_at, OLD.expires_at, OLD.request_id, OLD.address_sha256) THEN
    RAISE EXCEPTION 'a key removal''s request never changes' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  IF OLD.state = 'requested' THEN
    RETURN NEW;
  END IF;
  IF (NEW.state, NEW.decided_by, NEW.decided_at, NEW.decided_request_id, NEW.keys_removed, NEW.sessions_ended)
       IS DISTINCT FROM (OLD.state, OLD.decided_by, OLD.decided_at, OLD.decided_request_id, OLD.keys_removed, OLD.sessions_ended) THEN
    RAISE EXCEPTION 'a decided key removal stays decided' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  IF OLD.state <> 'confirmed'
     AND (NEW.registration_opened_by, NEW.registration_opened_at, NEW.registration_open_until, NEW.registration_code_sha256,
          NEW.registration_code_tries, NEW.registration_opened_request_id)
         IS DISTINCT FROM (OLD.registration_opened_by, OLD.registration_opened_at, OLD.registration_open_until, OLD.registration_code_sha256,
                           OLD.registration_code_tries, OLD.registration_opened_request_id) THEN
    RAISE EXCEPTION 'only a confirmed key removal opens a registration' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  -- On a confirmed row: the same opening may only count its tries up; a new opening is later than the one it replaces.
  IF OLD.registration_opened_at IS NOT NULL
     AND (NEW.registration_opened_at IS NULL OR NEW.registration_opened_at < OLD.registration_opened_at
          OR (NEW.registration_opened_at = OLD.registration_opened_at
              AND ((NEW.registration_opened_by, NEW.registration_open_until, NEW.registration_code_sha256, NEW.registration_opened_request_id)
                     IS DISTINCT FROM (OLD.registration_opened_by, OLD.registration_open_until, OLD.registration_code_sha256, OLD.registration_opened_request_id)
                   OR NEW.registration_code_tries < OLD.registration_code_tries))) THEN
    RAISE EXCEPTION 'an opening is replaced only by a later one, and its tries only count up' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.hardware_key_removal_is_final() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_removal_is_final() FROM PUBLIC;
