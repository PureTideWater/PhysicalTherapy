-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- priced_line_calculation(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c6d660b35b41b796
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.priced_line_calculation(trace jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  units jsonb := trace -> 'steps' -> 'units';
  per_visit jsonb := trace -> 'steps' -> 'per_visit';
  rounding jsonb := trace -> 'steps' -> 'rounding';
  adjustments jsonb := trace -> 'steps' -> 'adjustments';
  steps jsonb := '[]'::jsonb;
  step record;
BEGIN
  IF trace -> 'outcome' ->> 'result' IS DISTINCT FROM 'priced' OR jsonb_typeof(trace -> 'terms') IS DISTINCT FROM 'object'
     OR jsonb_typeof(rounding) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;
  FOR step IN
    SELECT s.name, s.amount FROM (
      SELECT 1 AS place, 0::bigint AS ordinal, CASE WHEN jsonb_typeof(per_visit) = 'object' THEN 'visit' ELSE 'unit' END AS name,
             CASE WHEN jsonb_typeof(units) = 'object' THEN units -> 'unit_cents' END AS amount
      UNION ALL SELECT 2, 0, 'schedule', CASE WHEN jsonb_typeof(units) = 'object' THEN units -> 'schedule_cents' END
      UNION ALL SELECT 3, 0, 'charge', CASE WHEN jsonb_typeof(units) = 'object' THEN units -> 'charge_cents' END
      UNION ALL SELECT 4, 0, 'base', coalesce(nullif(per_visit -> 'base_cents', 'null'::jsonb), nullif(units -> 'base_cents', 'null'::jsonb))
      UNION ALL SELECT 5, a.ordinal, a.value ->> 'name', a.value -> 'after_cents'
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(adjustments) = 'array' THEN adjustments ELSE '[]'::jsonb END) WITH ORDINALITY a (value, ordinal)
    ) s
    WHERE s.amount IS NOT NULL AND s.amount <> 'null'::jsonb
    ORDER BY s.place, s.ordinal
  LOOP
    steps := steps || jsonb_build_array(jsonb_build_object('step', step.name, 'amount_cents', step.amount));
  END LOOP;
  RETURN jsonb_build_object(
    'method', CASE WHEN trace -> 'agreement' ->> 'outcome' = 'MA_NONCONTRACTED' THEN to_jsonb('MA_NONCONTRACTED'::text) ELSE trace -> 'terms' -> 'method' END,
    'release_no', trace -> 'release' -> 'number',
    'steps', steps,
    'rounding', jsonb_build_object('rule', rounding -> 'rule', 'unrounded_cents', rounding -> 'unrounded_cents', 'rounded_cents', rounding -> 'rounded_cents'),
    'observed_basis', trace -> 'line' -> 'observed_allowed_basis',
    'patient_share_cents', coalesce(trace -> 'steps' -> 'patient_share_cents', 'null'::jsonb)
  );
END;
$function$;
ALTER FUNCTION public.priced_line_calculation(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.priced_line_calculation(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.priced_line_calculation(jsonb) TO tp_app;
