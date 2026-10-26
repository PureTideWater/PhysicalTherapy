-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_approval_pricing()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c0513475dbcaa671
-- Trigger function of: packet_version.packet_version_approval_pricing
CREATE OR REPLACE FUNCTION public.packet_version_approval_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL THEN
    PERFORM pricing_current_read_lock(NEW.practice_id);
  END IF;
  IF OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL AND packet_version_pricing_check(NEW.content) IS DISTINCT FROM 'current' THEN
    RAISE EXCEPTION 'a packet version is approved only while its pricing is current: every line on the pricing in effect, under a rule release not withdrawn and the mapping in force for its plan, with its contract version signed off and covering the service date' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.packet_version_approval_pricing() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_approval_pricing() FROM PUBLIC;
