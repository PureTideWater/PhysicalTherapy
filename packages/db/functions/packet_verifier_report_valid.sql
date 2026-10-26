-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_verifier_report_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 47fde3846263f974
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.packet_verifier_report_valid(report jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  item jsonb;
BEGIN
  IF jsonb_typeof(report) IS DISTINCT FROM 'object' OR coalesce(report ->> 'format', '') NOT IN ('tp-packet-verifier/1', 'tp-packet-verifier/2')
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(report) k) IS DISTINCT FROM ARRAY['checked', 'format', 'mismatches', 'narrative_sha256', 'passed', 'sentences']
     OR jsonb_typeof(report -> 'passed') IS DISTINCT FROM 'boolean' OR coalesce(report ->> 'narrative_sha256', '') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(report -> 'sentences') IS DISTINCT FROM 'number' OR jsonb_typeof(report -> 'checked') IS DISTINCT FROM 'number'
     OR jsonb_typeof(report -> 'mismatches') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(report -> 'mismatches') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item) k) IS DISTINCT FROM ARRAY['code', 'end', 'kind', 'sentence', 'start']
       OR (coalesce(item ->> 'code', '') NOT IN ('figure_not_in_input', 'sentence_without_citation', 'unknown_citation', 'unknown_placeholder', 'empty_narrative')
           AND NOT (report ->> 'format' = 'tp-packet-verifier/2' AND item ->> 'code' IN ('hidden_character', 'unreadable_figure', 'identifier_in_narrative')))
       OR NOT (item -> 'kind' = 'null'::jsonb OR item ->> 'kind' IN ('amount', 'percent', 'date', 'month', 'month_day', 'code', 'modifier', 'number', 'identifier', 'placeholder', 'citation'))
       OR jsonb_typeof(item -> 'sentence') IS DISTINCT FROM 'number' OR jsonb_typeof(item -> 'start') IS DISTINCT FROM 'number' OR jsonb_typeof(item -> 'end') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN (report ->> 'passed')::boolean = (jsonb_array_length(report -> 'mismatches') = 0);
END;
$function$;
ALTER FUNCTION public.packet_verifier_report_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_verifier_report_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_verifier_report_valid(jsonb) TO tp_app;
