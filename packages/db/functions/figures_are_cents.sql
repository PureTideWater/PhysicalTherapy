-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- figures_are_cents(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 373773096ab8e339
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.figures_are_cents(figures jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT monitoring_figures_valid(figures, 'cents')
$function$;
ALTER FUNCTION public.figures_are_cents(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.figures_are_cents(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.figures_are_cents(jsonb) TO tp_app;
