-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_rejections_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 44d088a7b92201f1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_rejections_valid(reasons jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(reasons) IS DISTINCT FROM 'array' THEN false
              WHEN jsonb_array_length(reasons) > 20 THEN false
              ELSE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(reasons) r WHERE NOT screening_rejection_valid(r)) END
$function$;
ALTER FUNCTION public.screening_rejections_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_rejections_valid(jsonb) FROM PUBLIC;
