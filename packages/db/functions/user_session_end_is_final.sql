-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_session_end_is_final()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 31742acfa66c6d74
-- Trigger function of: user_session.user_session_end_is_final
CREATE OR REPLACE FUNCTION public.user_session_end_is_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.ended_at IS NOT NULL AND (NEW.ended_at, NEW.end_reason) IS DISTINCT FROM (OLD.ended_at, OLD.end_reason) THEN
    RAISE EXCEPTION 'an ended session stays ended; sign in again' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.user_session_end_is_final() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_session_end_is_final() FROM PUBLIC;
