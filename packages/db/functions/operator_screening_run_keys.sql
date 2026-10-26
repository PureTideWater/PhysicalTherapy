-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_run_keys(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1e83fdac05e34b0c
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_run_keys(run uuid)
 RETURNS TABLE(codes text[], zip text)
 LANGUAGE sql
 STABLE SECURITY DEFINER ROWS 1
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT ARRAY(SELECT d.code FROM (SELECT DISTINCT s.procedure_code AS code FROM screening_result s
                                    WHERE s.run_id = r.id AND s.payer_product IN ('medicare_ffs', 'ma_noncontracted') AND s.disposition = 'pending') d
                ORDER BY d.code COLLATE "C"),
         p.zip
    FROM screening_run r
    JOIN screening_upload u ON u.id = r.upload_id
    JOIN screening_prospect p ON p.id = u.prospect_id
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
   WHERE r.id = $1 AND r.status = 'pricing'
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
$function$;
ALTER FUNCTION public.operator_screening_run_keys(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_run_keys(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_run_keys(uuid) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_run_keys(uuid) TO tp_screening;
