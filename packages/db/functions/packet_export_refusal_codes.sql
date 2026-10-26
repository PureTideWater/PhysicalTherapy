-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_export_refusal_codes()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c04b1fb3fd5f66af
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_export_refusal_codes()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['not_approved', 'not_current', 'outdated', 'case_changed', 'not_case_level', 'window_passed', 'next_window_passed', 'pricing_not_current', 'deadline_unverified', 'inputs_differ',
               'contact_missing', 'verifier_failed']
$function$;
ALTER FUNCTION public.packet_export_refusal_codes() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_export_refusal_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_export_refusal_codes() TO tp_app;
