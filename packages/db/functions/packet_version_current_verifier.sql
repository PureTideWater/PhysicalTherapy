-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_current_verifier()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4cc472bdc3162e89
-- Trigger function of: packet_version.packet_version_current_verifier
CREATE OR REPLACE FUNCTION public.packet_version_current_verifier()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL AND NEW.verifier_report ->> 'format' IS DISTINCT FROM 'tp-packet-verifier/2' THEN
    RAISE EXCEPTION 'a packet version is approved only once the current verifier has passed it; write the version again' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.packet_version_current_verifier() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_current_verifier() FROM PUBLIC;
