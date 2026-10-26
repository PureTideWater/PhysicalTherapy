-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_no_truncate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 66bbf3bfbb28631b
-- Trigger function of: priced_line.priced_line_no_truncate
-- Trigger function of: pricing_run.pricing_run_no_truncate
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.pricing_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: pricing runs and their lines are kept as they were priced', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.pricing_no_truncate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_no_truncate() FROM PUBLIC;
