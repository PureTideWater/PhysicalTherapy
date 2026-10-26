-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_kept_until_expiry()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d8ac90005f95ba48
-- Trigger function of: screening_prospect.screening_prospect_kept_until_expiry
-- Trigger function of: screening_run.screening_run_kept_until_expiry
-- Trigger function of: screening_upload.screening_upload_kept_until_expiry
CREATE OR REPLACE FUNCTION public.screening_kept_until_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  prospect uuid;
BEGIN
  IF OLD.expires_at <= now() THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'screening_prospect' THEN
    prospect := OLD.id;
  ELSIF TG_TABLE_NAME = 'screening_upload' THEN
    SELECT p.id INTO prospect FROM screening_prospect p WHERE p.id = OLD.prospect_id;
    IF NOT FOUND THEN
      RETURN OLD;
    END IF;
  ELSE
    SELECT u.prospect_id INTO prospect FROM screening_upload u WHERE u.id = OLD.upload_id;
    IF NOT FOUND THEN
      RETURN OLD;
    END IF;
  END IF;
  IF NOT screening_replaced(prospect) THEN
    RAISE EXCEPTION 'a screening is kept until it expires, 30 days after its upload, or a later screening of the same practice replaces it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_kept_until_expiry';
  END IF;
  RETURN OLD;
END;
$function$;
ALTER FUNCTION public.screening_kept_until_expiry() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_kept_until_expiry() FROM PUBLIC;
