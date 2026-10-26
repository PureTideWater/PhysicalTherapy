-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_group_totals(text,integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 05273a55a84f7373
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_result_group_totals(token_sha256 text, page integer, per_page integer)
 RETURNS TABLE(groups integer, anomaly_groups integer, within_reduction_groups integer, page_size integer, pages integer, page_no integer, first_group integer, last_group integer, other_groups integer, other_anomaly_groups integer, other_rows integer, other_claim_lines bigint, other_expected_cents bigint, other_lowest_cents bigint, other_observed_cents bigint, other_difference_cents bigint, other_lowest_difference_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH ranked AS MATERIALIZED (SELECT * FROM screening_result_ranked_groups($1)),
       sized AS (SELECT (SELECT count(*) FROM ranked)::integer AS total, least(greatest(coalesce($3, 0), 1), 100) AS size),
       shown AS (SELECT z.total, z.size, greatest((z.total + z.size - 1) / z.size, 1) AS pages,
                        least(greatest(coalesce($2, 1), 1), greatest((z.total + z.size - 1) / z.size, 1)) AS page
                   FROM sized z),
       placed AS (SELECT r.*, (r.group_no <= (s.page - 1) * s.size OR r.group_no > s.page * s.size) AS other FROM ranked r CROSS JOIN shown s)
  SELECT s.total, (SELECT count(*) FROM placed p WHERE p.standing = 'anomaly')::integer,
         (SELECT count(*) FROM placed p WHERE p.standing = 'within_reduction_range')::integer,
         s.size, s.pages, s.page, least((s.page - 1) * s.size + 1, s.total), least(s.page * s.size, s.total),
         o.groups, o.anomalies, o.row_total, o.claims, o.expected, o.lowest, o.observed, o.difference, o.lowest_difference
    FROM shown s
   CROSS JOIN (SELECT count(*)::integer AS groups, (count(*) FILTER (WHERE p.standing = 'anomaly'))::integer AS anomalies,
                      coalesce(sum(p.rows), 0)::integer AS row_total, coalesce(sum(p.claim_lines), 0)::bigint AS claims,
                      coalesce(sum(p.expected_cents), 0)::bigint AS expected, coalesce(sum(p.lowest_cents), 0)::bigint AS lowest,
                      coalesce(sum(p.observed_cents), 0)::bigint AS observed, coalesce(sum(p.difference_cents), 0)::bigint AS difference,
                      coalesce(sum(p.lowest_difference_cents), 0)::bigint AS lowest_difference
                 FROM placed p WHERE p.other) o
   WHERE EXISTS (SELECT 1 FROM screening_run r WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at)
$function$;
ALTER FUNCTION public.screening_result_group_totals(text,integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_group_totals(text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_result_group_totals(text,integer,integer) TO tp_app;
