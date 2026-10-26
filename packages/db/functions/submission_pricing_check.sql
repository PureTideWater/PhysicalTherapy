-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submission_pricing_check()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e7191244a18fc56c
-- Trigger function of: submission.submission_pricing_check
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.submission_pricing_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM pricing_current_read_lock(NEW.practice_id);
  SELECT packet_version_pricing_check(v.content), packet_version_unattested_reason(v.id) INTO NEW.pricing_check, NEW.unattested_reason
    FROM packet_version v WHERE v.id = NEW.packet_version_id AND v.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    -- No version of its practice the caller can see: submission_belongs refuses the row.
    NEW.pricing_check := packet_version_pricing_check(NULL);
    NEW.unattested_reason := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.submission_pricing_check() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submission_pricing_check() FROM PUBLIC;
