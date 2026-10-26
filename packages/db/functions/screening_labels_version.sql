-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_labels_version()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c0bcf4254ca8ca9f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_labels_version()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT 'screening-labels/2026-11-05'::text
$function$;
ALTER FUNCTION public.screening_labels_version() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_labels_version() FROM PUBLIC;
