-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_setting_keys()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 43b5d4392b24804a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_setting_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT ARRAY[
    'place_of_service_settings', 'default_rounding', 'line_materiality_cents', 'case_materiality_cents', 'anomaly_minimum_cohort',
    'anomaly_threshold_cents', 'staff_rate_cents_per_hour', 'minutes_per_packet', 'minutes_per_follow_up']
$function$;
ALTER FUNCTION public.practice_setting_keys() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_setting_keys() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_setting_keys() TO tp_app;
