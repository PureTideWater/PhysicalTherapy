-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- figures_are_counts(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: cf797676e6189c60
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.figures_are_counts(figures jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT monitoring_figures_valid(figures, 'count')
$function$;
ALTER FUNCTION public.figures_are_counts(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.figures_are_counts(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.figures_are_counts(jsonb) TO tp_app;
