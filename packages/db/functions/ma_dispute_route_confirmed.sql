-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ma_dispute_route_confirmed()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b7b976b0230f8b43
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.ma_dispute_route_confirmed()
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT false
$function$;
ALTER FUNCTION public.ma_dispute_route_confirmed() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ma_dispute_route_confirmed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ma_dispute_route_confirmed() TO tp_app;
