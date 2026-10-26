-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_next_dispute_window(uuid,integer,date)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: a6d8aaca2860bcf5
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.case_next_dispute_window(target_case uuid, denied_level integer, denied_on date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  pattern jsonb;
  days integer;
  window_value jsonb;
BEGIN
  SELECT c.pattern_key INTO pattern FROM "case" c WHERE c.id = target_case;
  IF pattern ->> 'contract_version_id' IS NOT NULL THEN
    SELECT (e ->> 'days')::integer INTO days
      FROM contract_version v, jsonb_array_elements(v.appeal_levels) e
     WHERE v.id = (pattern ->> 'contract_version_id')::uuid AND (e ->> 'level')::integer = denied_level;
    RETURN CASE WHEN days IS NULL THEN NULL ELSE denied_on + days END;
  END IF;
  IF pattern ->> 'mapping_kind' = 'ma_noncontracted' AND denied_level = 1 THEN
    SELECT r.value INTO window_value
      FROM rule_record r
     WHERE r.release_no = current_rule_release() AND r.record_type = 'dispute_window'
       AND r.key = '{"program": "medicare", "window": "reconsideration"}'::jsonb
       AND r.effective_from <= denied_on AND (r.effective_to IS NULL OR denied_on <= r.effective_to)
     ORDER BY r.effective_from DESC LIMIT 1;
    IF window_value IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN CASE window_value ->> 'unit'
      WHEN 'days' THEN denied_on + (window_value ->> 'length')::integer
      WHEN 'months' THEN (denied_on + make_interval(months => (window_value ->> 'length')::integer))::date
    END;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.case_next_dispute_window(uuid,integer,date) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_next_dispute_window(uuid,integer,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_next_dispute_window(uuid,integer,date) TO tp_app;
