-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_groups(text,integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 77fb171b2ad9e91d
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_result_groups(token_sha256 text, page integer, per_page integer)
 RETURNS TABLE(group_no integer, payer_product text, procedure_code text, rows integer, claim_lines bigint, expected_cents bigint, reduced_cents bigint, observed_cents bigint, difference_cents bigint, reduced_difference_cents bigint, in_reduction_pool boolean, anomaly_rows integer, anomaly boolean, standing text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT g.group_no, g.payer_product, g.procedure_code, g.rows, g.claim_lines, g.expected_cents, CASE WHEN g.in_reduction_pool THEN g.lowest_cents END,
         g.observed_cents, g.difference_cents, CASE WHEN g.in_reduction_pool THEN g.lowest_difference_cents END, g.in_reduction_pool, g.anomaly_rows,
         g.anomaly_rows > 0, g.standing
    FROM screening_result_ranked_groups($1) g
   CROSS JOIN (SELECT greatest(coalesce($2, 1), 1)::bigint AS page, least(greatest(coalesce($3, 0), 1), 100)::bigint AS size) p
   WHERE g.group_no > (p.page - 1) * p.size AND g.group_no <= p.page * p.size
   ORDER BY g.group_no
$function$;
ALTER FUNCTION public.screening_result_groups(text,integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_groups(text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_result_groups(text,integer,integer) TO tp_app;
