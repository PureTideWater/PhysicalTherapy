-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_pricing_check(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dc57d582efc46783
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.packet_version_pricing_check(content jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  causes CONSTANT text[] := ARRAY['PRICING_NOT_IN_EFFECT', 'RELEASE_WITHDRAWN', 'MAPPING_NOT_IN_FORCE', 'CONTRACT_VERSION_NOT_SIGNED_OFF', 'CONTRACT_VERSION_NOT_IN_FORCE'];
  worst integer;
BEGIN
  IF jsonb_typeof(content -> 'lines') IS DISTINCT FROM 'array' THEN
    RETURN 'PRICING_NOT_IN_EFFECT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(content -> 'lines') l
     WHERE jsonb_typeof(l) IS DISTINCT FROM 'object'
        OR coalesce(l ->> 'priced_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RETURN 'PRICING_NOT_IN_EFFECT';
  END IF;
  SELECT min(array_position(causes, priced_line_pricing_check((l ->> 'priced_line_id')::uuid))) INTO worst
    FROM jsonb_array_elements(content -> 'lines') l;
  RETURN coalesce(causes[worst], 'current');
END;
$function$;
ALTER FUNCTION public.packet_version_pricing_check(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_pricing_check(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_version_pricing_check(jsonb) TO tp_app;
