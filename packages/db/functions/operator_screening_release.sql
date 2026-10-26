-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_release(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 27a9bf3da2f0e6be
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_release(run uuid)
 RETURNS TABLE(record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  pinned integer;
  shared text;
BEGIN
  SELECT r.release_no INTO pinned FROM screening_run r
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
   WHERE r.id = $1 AND r.status = 'pricing'
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no);
  IF NOT FOUND THEN
    RETURN;
  END IF;
  FOR shared IN
    WITH RECURSIVE types (found) AS (
      SELECT (SELECT t.record_type FROM rule_record t WHERE t.release_no = pinned ORDER BY t.record_type LIMIT 1)
      UNION ALL
      SELECT (SELECT t.record_type FROM rule_record t WHERE t.release_no = pinned AND t.record_type > types.found ORDER BY t.record_type LIMIT 1)
        FROM types WHERE types.found IS NOT NULL
    )
    SELECT types.found FROM types
     WHERE types.found IS NOT NULL AND types.found NOT IN ('pfs_rvu', 'ncci_mue', 'mppr_rate', 'ncci_ptp', 'locality_map', 'locality_map_plus_four')
     ORDER BY types.found
  LOOP
    RETURN QUERY
      SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
        FROM rule_record rr
       WHERE rr.release_no = pinned AND rr.record_type = shared
       ORDER BY rr.effective_from, rr.id;
  END LOOP;
END;
$function$;
ALTER FUNCTION public.operator_screening_release(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_release(uuid) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_release(uuid) TO tp_screening;
