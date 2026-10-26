-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_unattested_reason(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 05ff40e2f2b243ae
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.packet_version_unattested_reason(target uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  version record;
BEGIN
  SELECT v.practice_id, v.content, v.exported_at, v.export_verifier_report, v.attested_by INTO version FROM packet_version v WHERE v.id = target;
  IF NOT FOUND OR version.exported_at IS NULL OR version.export_verifier_report IS NULL OR version.attested_by IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(version.content -> 'lines') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;
  IF jsonb_array_length(version.content -> 'lines') = 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(version.content -> 'lines') l
     WHERE NOT EXISTS (
       SELECT 1 FROM priced_line p
        WHERE p.practice_id = version.practice_id
          AND p.id = CASE WHEN jsonb_typeof(l) = 'object' AND (l ->> 'priced_line_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (l ->> 'priced_line_id')::uuid END
     )
  ) THEN
    RETURN NULL;
  END IF;
  IF packet_version_pricing_check(version.content) IS DISTINCT FROM 'current' THEN
    RETURN 'pricing_stale_after_export';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.packet_version_unattested_reason(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_unattested_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_version_unattested_reason(uuid) TO tp_app;
