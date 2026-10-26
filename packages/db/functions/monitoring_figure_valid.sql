-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- monitoring_figure_valid(jsonb,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: db1a5da1e003b307
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.monitoring_figure_valid(figure jsonb, leaf text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE leaf
    WHEN 'count' THEN jsonb_typeof(figure) = 'number' AND (figure #>> '{}') ~ '^(0|[1-9][0-9]{0,17})$'
    WHEN 'cents' THEN jsonb_typeof(figure) = 'string' AND (figure #>> '{}') ~ '^-?(0|[1-9][0-9]{0,17})$'
    ELSE false
  END
$function$;
ALTER FUNCTION public.monitoring_figure_valid(jsonb,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.monitoring_figure_valid(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitoring_figure_valid(jsonb,text) TO tp_app;
