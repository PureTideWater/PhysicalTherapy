-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_grant_fixed()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4e2ccf3fc52ddc22
-- Trigger function of: support_grant.support_grant_fixed
CREATE OR REPLACE FUNCTION public.support_grant_fixed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  ended_early boolean := NEW.expires_at < OLD.expires_at AND NEW.expires_at = now() AND OLD.expires_at > now() AND OLD.created_at + interval '4 hours' > now();
BEGIN
  IF (NEW.id, NEW.practice_id, NEW.user_id, NEW.ticket, NEW.reason, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.user_id, OLD.ticket, OLD.reason, OLD.created_at)
     OR (NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NOT ended_early)
     OR (OLD.notified_at IS NOT NULL AND NEW.notified_at IS DISTINCT FROM OLD.notified_at) THEN
    RAISE EXCEPTION 'a support grant never changes; only its closing notice is recorded, once, and it can be ended early, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.support_grant_fixed() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_grant_fixed() FROM PUBLIC;
