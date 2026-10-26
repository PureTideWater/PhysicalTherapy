-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_site_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b607cf637160b58a
-- Trigger function of: practice_site.practice_site_rules
CREATE OR REPLACE FUNCTION public.practice_site_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a practice''s pricing location is never deleted; it is set again' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_kept';
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a practice''s pricing location changes only its ZIP, its ZIP+4, who set them and who confirmed them' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_fixed';
  END IF;
  IF (NEW.zip, NEW.zip_plus_four) IS DISTINCT FROM (OLD.zip, OLD.zip_plus_four) THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
    NEW.updated_by := OLD.updated_by;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.practice_site_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_site_rules() FROM PUBLIC;
