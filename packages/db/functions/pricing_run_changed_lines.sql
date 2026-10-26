-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_run_changed_lines(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5ddaf57baabe280e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.pricing_run_changed_lines(before_run uuid, after_run uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT count(*)
    FROM (SELECT * FROM priced_line WHERE pricing_run_id = before_run) a
    FULL JOIN (SELECT * FROM priced_line WHERE pricing_run_id = after_run) b ON b.service_line_id = a.service_line_id
   WHERE a.id IS NULL OR b.id IS NULL
      OR a.expected_allowed_cents IS DISTINCT FROM b.expected_allowed_cents
      OR a.unpriced_reason IS DISTINCT FROM b.unpriced_reason
      OR a.adjustments_applied IS DISTINCT FROM b.adjustments_applied
      OR a.window_ends_on IS DISTINCT FROM b.window_ends_on
      OR coalesce(a.trace #> '{outcome,review_flags}', '[]'::jsonb) IS DISTINCT FROM coalesce(b.trace #> '{outcome,review_flags}', '[]'::jsonb)
      OR a.mapping_id IS DISTINCT FROM b.mapping_id
      OR a.contract_version_id IS DISTINCT FROM b.contract_version_id
      OR a.rate_record_id IS DISTINCT FROM b.rate_record_id
$function$;
ALTER FUNCTION public.pricing_run_changed_lines(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_run_changed_lines(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pricing_run_changed_lines(uuid,uuid) TO tp_app;
