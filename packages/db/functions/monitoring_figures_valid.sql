-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- monitoring_figures_valid(jsonb,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0f95f76f4d8baaf9
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.monitoring_figures_valid(figures jsonb, leaf text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  item record;
  inner_item record;
BEGIN
  IF figures IS NULL OR jsonb_typeof(figures) <> 'object' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT e.key, e.value FROM jsonb_each(figures) e LOOP
    IF NOT item.key = ANY (monitoring_figure_codes(leaf)) THEN
      RETURN false;
    END IF;
    IF item.key LIKE '%\_by\_payer' THEN
      IF jsonb_typeof(item.value) <> 'object' THEN
        RETURN false;
      END IF;
      FOR inner_item IN SELECT e.key, e.value FROM jsonb_each(item.value) e LOOP
        IF inner_item.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT monitoring_figure_valid(inner_item.value, leaf) THEN
          RETURN false;
        END IF;
      END LOOP;
    ELSIF NOT monitoring_figure_valid(item.value, leaf) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$function$;
ALTER FUNCTION public.monitoring_figures_valid(jsonb,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.monitoring_figures_valid(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitoring_figures_valid(jsonb,text) TO tp_app;
