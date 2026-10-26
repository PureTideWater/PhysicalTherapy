-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_coverage(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d0ded51d5c43a4fd
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_result_coverage(token_sha256 text)
 RETURNS TABLE(payer_product text, disposition text, unpriced_reason text, unpriced_detail text, rows integer, claim_lines bigint, observed_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.payer_product, s.disposition, s.unpriced_reason, s.unpriced_detail, count(*)::integer, sum(s.claim_count)::bigint, sum(s.observed_allowed_cents)::bigint
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at
   GROUP BY s.payer_product, s.disposition, s.unpriced_reason, s.unpriced_detail
   ORDER BY s.payer_product, s.disposition, s.unpriced_reason NULLS FIRST, s.unpriced_detail NULLS FIRST
$function$;
ALTER FUNCTION public.screening_result_coverage(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_coverage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_result_coverage(text) TO tp_app;
