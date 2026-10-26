-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_export_failure_codes()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fb4f86f1d8355c05
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.packet_export_failure_codes()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['store_mismatch', 'render_failed', 'store_failed', 'database_refused', 'unexpected']
$function$;
ALTER FUNCTION public.packet_export_failure_codes() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_export_failure_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_export_failure_codes() TO tp_app;
