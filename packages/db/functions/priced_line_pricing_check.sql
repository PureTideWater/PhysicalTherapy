-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- priced_line_pricing_check(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: a42d8a0f7b9a9f73
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.priced_line_pricing_check(target uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  line record;
  version record;
BEGIN
  SELECT p.service_line_id, p.mapping_id, p.contract_version_id, r.release_no, s.payer_plan_key AS plan_id, coalesce(s.service_date, c.service_from) AS service_on
    INTO line
    FROM priced_line p
    JOIN pricing_run r ON r.id = p.pricing_run_id
    LEFT JOIN service_line s ON s.id = p.service_line_id
    LEFT JOIN claim c ON c.id = s.claim_id
   WHERE p.id = target;
  IF NOT FOUND OR service_line_priced_in_effect(line.service_line_id) IS DISTINCT FROM target THEN
    RETURN 'PRICING_NOT_IN_EFFECT';
  END IF;
  IF EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = line.release_no) THEN
    RETURN 'RELEASE_WITHDRAWN';
  END IF;
  IF line.mapping_id IS NULL OR line.service_on IS NULL OR payer_plan_mapping_in_force(line.plan_id, line.service_on) IS DISTINCT FROM line.mapping_id THEN
    RETURN 'MAPPING_NOT_IN_FORCE';
  END IF;
  IF line.contract_version_id IS NOT NULL THEN
    SELECT v.status, v.effective_from, v.effective_to INTO version FROM contract_version v WHERE v.id = line.contract_version_id;
    IF NOT FOUND OR version.status IS DISTINCT FROM 'signed_off' THEN
      RETURN 'CONTRACT_VERSION_NOT_SIGNED_OFF';
    END IF;
    IF line.service_on IS NULL OR NOT (version.effective_from <= line.service_on AND (version.effective_to IS NULL OR line.service_on < version.effective_to)) THEN
      RETURN 'CONTRACT_VERSION_NOT_IN_FORCE';
    END IF;
  END IF;
  RETURN 'current';
END;
$function$;
ALTER FUNCTION public.priced_line_pricing_check(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.priced_line_pricing_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.priced_line_pricing_check(uuid) TO tp_app;
