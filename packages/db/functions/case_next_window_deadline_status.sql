-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_next_window_deadline_status(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c33a8d25322b362f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.case_next_window_deadline_status(target_case uuid, minimum_level text DEFAULT 'L2'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  pattern jsonb;
  denied_on date;
  denied_level integer;
  stated_ends_on date;
  record_level text;
  levels CONSTANT text[] := ARRAY['L1', 'L2', 'L3'];
BEGIN
  IF minimum_level IS NULL OR minimum_level NOT IN ('L2', 'L3') THEN
    RAISE EXCEPTION 'a deadline is verified at L2 or at L3' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT c.pattern_key INTO pattern FROM "case" c WHERE c.id = target_case;
  IF NOT FOUND OR pattern ->> 'contract_version_id' IS NOT NULL OR pattern ->> 'mapping_kind' IS DISTINCT FROM 'ma_noncontracted' THEN
    RETURN 'unverified';
  END IF;
  SELECT r.received_on, r.next_window_ends_on, s.dispute_level INTO denied_on, stated_ends_on, denied_level
    FROM payer_response r JOIN submission s ON s.id = r.submission_id
   WHERE s.case_id = target_case AND r.reopens_case
   ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1;
  IF denied_on IS NULL OR stated_ends_on IS NULL
     OR case_next_dispute_window(target_case, denied_level, denied_on) IS DISTINCT FROM stated_ends_on THEN
    RETURN 'unverified';
  END IF;
  SELECT r.verification INTO record_level
    FROM rule_record r
   WHERE r.release_no = current_rule_release() AND r.record_type = 'dispute_window'
     AND r.key = '{"program": "medicare", "window": "reconsideration"}'::jsonb
     AND r.effective_from <= denied_on AND (r.effective_to IS NULL OR denied_on <= r.effective_to)
   ORDER BY r.effective_from DESC LIMIT 1;
  RETURN CASE WHEN array_position(levels, record_level) >= array_position(levels, minimum_level) AND ma_dispute_route_confirmed() THEN 'verified' ELSE 'unverified' END;
END;
$function$;
ALTER FUNCTION public.case_next_window_deadline_status(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_next_window_deadline_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_next_window_deadline_status(uuid,text) TO tp_app;
