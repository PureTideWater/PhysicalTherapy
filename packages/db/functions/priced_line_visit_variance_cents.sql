-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- priced_line_visit_variance_cents(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ff2bbd148b2eb4ad
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.priced_line_visit_variance_cents(line_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(p.trace #> '{steps,per_visit}') = 'object' THEN (
           SELECT coalesce(sum(q.variance_cents), 0)
             FROM priced_line q JOIN service_line ql ON ql.id = q.service_line_id
            WHERE q.pricing_run_id = p.pricing_run_id AND q.practice_id = p.practice_id AND ql.claim_id = l.claim_id
              AND q.rate_record_id IS NOT DISTINCT FROM p.rate_record_id
              AND jsonb_typeof(q.trace #> '{steps,per_visit}') = 'object'
              AND q.trace #>> '{steps,per_visit,service_date}' = p.trace #>> '{steps,per_visit,service_date}'
              AND q.trace #>> '{steps,per_visit,carrier_line_no}' = p.trace #>> '{steps,per_visit,carrier_line_no}')
         END
    FROM priced_line p JOIN service_line l ON l.id = p.service_line_id
   WHERE p.id = line_id
$function$;
ALTER FUNCTION public.priced_line_visit_variance_cents(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.priced_line_visit_variance_cents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.priced_line_visit_variance_cents(uuid) TO tp_app;
