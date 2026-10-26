-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_ranked_groups(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2ae6e52259eb8e4b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_result_ranked_groups(token_sha256 text)
 RETURNS TABLE(group_no integer, payer_product text, procedure_code text, rows integer, claim_lines bigint, expected_cents bigint, lowest_cents bigint, observed_cents bigint, difference_cents bigint, lowest_difference_cents bigint, in_reduction_pool boolean, anomaly_rows integer, standing text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT (row_number() OVER (ORDER BY g.lowest_difference DESC, g.product COLLATE "C", g.code COLLATE "C"))::integer,
         g.product, g.code, g.row_total, g.claims, g.expected, g.lowest, g.observed, g.difference, g.lowest_difference, g.pooled, g.anomalies,
         CASE WHEN g.anomalies > 0 THEN 'anomaly' ELSE screening_standing(g.expected, CASE WHEN g.pooled THEN g.lowest END, g.observed, g.claims) END
    FROM (SELECT s.payer_product AS product, s.procedure_code AS code, count(*)::integer AS row_total, sum(s.claim_count)::bigint AS claims,
                 sum(s.expected_cents)::bigint AS expected, sum(coalesce(s.reduced_cents, s.expected_cents))::bigint AS lowest,
                 sum(s.observed_allowed_cents)::bigint AS observed, sum(s.difference_cents)::bigint AS difference,
                 sum(coalesce(s.reduced_difference_cents, s.difference_cents))::bigint AS lowest_difference,
                 bool_or(s.in_reduction_pool) AS pooled,
                 (count(*) FILTER (WHERE screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly'))::integer AS anomalies
            FROM screening_run r JOIN screening_result s ON s.run_id = r.id
           WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at AND s.disposition = 'priced'
           GROUP BY s.payer_product, s.procedure_code) g
$function$;
ALTER FUNCTION public.screening_result_ranked_groups(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_ranked_groups(text) FROM PUBLIC;
