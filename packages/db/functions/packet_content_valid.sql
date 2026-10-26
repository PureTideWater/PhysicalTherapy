-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_content_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 619ece8c25a26b04
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_content_valid(content jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  line jsonb;
  position integer := 0;
  kind text;
  is_second boolean;
  deadline jsonb;
BEGIN
  IF jsonb_typeof(content) IS DISTINCT FROM 'object' OR coalesce(content ->> 'format', '') NOT IN ('tp-packet/1', 'tp-packet/2')
     OR jsonb_typeof(content -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(content -> 'dispute_level') IS DISTINCT FROM 'number' OR coalesce(content ->> 'dispute_level', '') !~ '^[1-9][0-9]{0,2}$'
     OR coalesce(content ->> 'as_of', '') !~ '^\d{4}-\d{2}-\d{2}$' OR NOT content ? 'interest'
     OR jsonb_typeof(content -> 'citation') IS DISTINCT FROM 'object'
     OR jsonb_typeof(content -> 'evidence') IS DISTINCT FROM 'array' OR jsonb_typeof(content -> 'evidence_gaps') IS DISTINCT FROM 'array'
     OR jsonb_typeof(content -> 'sources') IS DISTINCT FROM 'array' OR jsonb_typeof(content -> 'requested_action') IS DISTINCT FROM 'string'
     OR NOT (content -> 'interest' = 'null'::jsonb OR (jsonb_typeof(content -> 'interest') = 'object'
             AND (content -> 'interest' -> 'total_cents' = 'null'::jsonb OR coalesce(content -> 'interest' ->> 'total_cents', '') ~ '^(0|[1-9][0-9]{0,17})$'))) THEN
    RETURN false;
  END IF;
  is_second := content ->> 'format' = 'tp-packet/2';
  IF is_second THEN
    deadline := content -> 'deadline';
    IF jsonb_typeof(deadline) IS DISTINCT FROM 'object'
       OR coalesce(deadline ->> 'basis', '') NOT IN ('line_windows', 'next_level_window')
       OR coalesce(deadline ->> 'status', '') NOT IN ('verified', 'unverified', 'not_applicable')
       OR NOT coalesce(deadline -> 'ends_on' = 'null'::jsonb OR (jsonb_typeof(deadline -> 'ends_on') = 'string' AND deadline ->> 'ends_on' ~ '^\d{4}-\d{2}-\d{2}$'), false) THEN
      RETURN false;
    END IF;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(content -> 'lines') LOOP
    position := position + 1;
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR line ->> 'row' IS DISTINCT FROM position::text
       OR coalesce(line ->> 'service_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(line ->> 'priced_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    FOREACH kind IN ARRAY ARRAY['claim_control_number', 'patient_control_number', 'patient_name', 'member_id'] LOOP
      IF line ->> kind IS DISTINCT FROM '{{' || kind || ':' || position::text || '}}' THEN
        RETURN false;
      END IF;
    END LOOP;
    FOREACH kind IN ARRAY ARRAY['expected_cents', 'observed_cents', 'variance_cents', 'paid_cents'] LOOP
      IF coalesce(line ->> kind, '') !~ '^-?(0|[1-9][0-9]{0,17})$' THEN
        RETURN false;
      END IF;
    END LOOP;
    IF is_second THEN
      deadline := line -> 'deadline';
      IF jsonb_typeof(deadline) IS DISTINCT FROM 'object'
         OR coalesce(deadline ->> 'status', '') NOT IN ('verified', 'unverified', 'not_applicable')
         OR NOT coalesce(deadline -> 'ends_on' = 'null'::jsonb OR (jsonb_typeof(deadline -> 'ends_on') = 'string' AND deadline ->> 'ends_on' ~ '^\d{4}-\d{2}-\d{2}$'), false)
         OR NOT coalesce(deadline -> 'source' = 'null'::jsonb OR deadline ->> 'source' IN ('contract', 'release'), false)
         OR jsonb_typeof(line -> 'calculation') IS DISTINCT FROM 'object' THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$function$;
ALTER FUNCTION public.packet_content_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_content_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_content_valid(jsonb) TO tp_app;
