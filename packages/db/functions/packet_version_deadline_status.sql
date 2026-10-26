-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_deadline_status(uuid,jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1341aa1b7f092b15
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.packet_version_deadline_status(target_case uuid, content jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF content ->> 'format' IS DISTINCT FROM 'tp-packet/2' OR jsonb_typeof(content -> 'lines') IS DISTINCT FROM 'array'
     OR coalesce(content ->> 'dispute_level', '') !~ '^[1-9][0-9]{0,2}$' THEN
    RETURN 'unverified';
  END IF;
  IF (content ->> 'dispute_level')::integer > 1 THEN
    RETURN case_next_window_deadline_status(target_case);
  END IF;
  IF jsonb_array_length(content -> 'lines') = 0 THEN
    RETURN 'not_applicable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(content -> 'lines') l
     WHERE coalesce(l ->> 'priced_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR priced_line_deadline_status((l ->> 'priced_line_id')::uuid) IS DISTINCT FROM 'verified'
  ) THEN
    RETURN 'unverified';
  END IF;
  RETURN 'verified';
END;
$function$;
ALTER FUNCTION public.packet_version_deadline_status(uuid,jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_deadline_status(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_version_deadline_status(uuid,jsonb) TO tp_app;
