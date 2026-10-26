-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- monitoring_figure_codes(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 001f1436716766bd
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.monitoring_figure_codes(leaf text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE leaf
    WHEN 'count' THEN ARRAY[
      'lines', 'priced_lines', 'unpriced_lines', 'validated_lines', 'flagged_lines', 'cases',
      'validated_payers', 'validated_lines_by_payer', 'cases_nearing_deadline', 'recoveries_posted',
      'coverage_lines', 'coverage_priced_lines', 'previous_coverage_lines', 'previous_coverage_priced_lines', 'contracts_expiring',
      'recouped_lines', 'days_waiting']
    WHEN 'cents' THEN ARRAY[
      'billed', 'priced_billed', 'validated_variance', 'validated_variance_by_payer', 'cases_nearing_deadline_actionable', 'recovered',
      'coverage_billed', 'coverage_priced_billed', 'previous_coverage_billed', 'previous_coverage_priced_billed',
      'recouped']
    ELSE ARRAY[]::text[]
  END
$function$;
ALTER FUNCTION public.monitoring_figure_codes(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.monitoring_figure_codes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitoring_figure_codes(text) TO tp_app;
