-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_run_records(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9ace505ceb4a0be2
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_run_records(run uuid)
 RETURNS TABLE(record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH keyed AS (
    SELECT r.release_no, k.codes, k.zip FROM screening_run r CROSS JOIN LATERAL operator_screening_run_keys(r.id) k WHERE r.id = $1
  ), wanted AS (
    SELECT keyed.release_no, w.record_type, w.key
      FROM keyed CROSS JOIN LATERAL (
        SELECT t.record_type, t.key FROM unnest(keyed.codes) c
          CROSS JOIN LATERAL (VALUES ('pfs_rvu', jsonb_build_object('hcpcs', c, 'modifier', '')),
                                     ('ncci_mue', jsonb_build_object('hcpcs', c)),
                                     ('mppr_rate', jsonb_build_object('hcpcs', c, 'modifier', '')),
                                     ('ncci_ptp', jsonb_build_object('column1', c, 'column2', c))) AS t (record_type, key)
        UNION ALL SELECT 'mppr_rate', jsonb_build_object('component', 'practice_expense')
        UNION ALL SELECT 'locality_map', jsonb_build_object('zip', keyed.zip)
        UNION ALL SELECT 'locality_map_plus_four', jsonb_build_object('zip', keyed.zip)) w
  )
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM wanted JOIN rule_record rr ON rr.release_no = wanted.release_no AND rr.record_type = wanted.record_type AND rr.key = wanted.key
   ORDER BY rr.record_type, rr.effective_from, rr.id
$function$;
ALTER FUNCTION public.operator_screening_run_records(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_run_records(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_run_records(uuid) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_run_records(uuid) TO tp_screening;
