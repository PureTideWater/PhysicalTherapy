-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- priced_line_deadline_status(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 789fac53eeaccf36
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.priced_line_deadline_status(target uuid, minimum_level text DEFAULT 'L2'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  trace jsonb;
  window_step jsonb;
  levels CONSTANT text[] := ARRAY['L1', 'L2', 'L3'];
BEGIN
  IF minimum_level IS NULL OR minimum_level NOT IN ('L2', 'L3') THEN
    RAISE EXCEPTION 'a deadline is verified at L2 or at L3' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT p.trace INTO trace FROM priced_line p WHERE p.id = target;
  IF NOT FOUND THEN
    RETURN 'unverified';
  END IF;
  window_step := trace -> 'steps' -> 'window';
  IF jsonb_typeof(window_step) IS DISTINCT FROM 'object' OR window_step ->> 'source' IS NULL THEN
    RETURN 'not_applicable';
  END IF;
  IF window_step ->> 'source' = 'release' THEN
    IF coalesce(trace -> 'release' ->> 'number', '') !~ '^[1-9][0-9]{0,8}$' THEN
      RETURN 'unverified';
    END IF;
    RETURN CASE WHEN EXISTS (
      SELECT 1 FROM rule_record r
       WHERE r.release_no = (trace -> 'release' ->> 'number')::integer AND r.record_type = 'dispute_window'
         AND r.sha256 = window_step -> 'record' ->> 'sha256' AND r.key ->> 'program' = 'medicare'
         AND array_position(levels, r.verification) >= array_position(levels, minimum_level)
         AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
         AND ma_dispute_route_confirmed()
    ) THEN 'verified' ELSE 'unverified' END;
  END IF;
  IF window_step ->> 'source' = 'contract' THEN
    IF coalesce(trace -> 'agreement' ->> 'contract_version_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(window_step ->> 'length', '') !~ '^[1-9][0-9]{0,3}$' THEN
      RETURN 'unverified';
    END IF;
    RETURN CASE WHEN EXISTS (
      SELECT 1 FROM contract_version v
       WHERE v.id = (trace -> 'agreement' ->> 'contract_version_id')::uuid AND v.status = 'signed_off'
         AND v.dispute_window_verified_by IS NOT NULL AND rate_record_evidence_complete(v.dispute_window_evidence)
         AND contract_window_rule_computed(v.dispute_window_unit, v.dispute_window_measured_from)
         AND v.dispute_window_days = (window_step ->> 'length')::integer AND window_step ->> 'unit' = 'days'
         -- The engine's label for a contract window counted from BPR16, the payment date (packages/pricing/src/windows.ts).
         AND window_step ->> 'measured_from' = 'remittance_date'
    ) THEN 'verified' ELSE 'unverified' END;
  END IF;
  RETURN 'unverified';
END;
$function$;
ALTER FUNCTION public.priced_line_deadline_status(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.priced_line_deadline_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.priced_line_deadline_status(uuid,text) TO tp_app;
