-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- priced_line_immutable()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4d2d626ed295e33c
-- Trigger function of: priced_line.priced_line_immutable
CREATE OR REPLACE FUNCTION public.priced_line_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'a priced line never changes; a new run prices the line again' USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.priced_line_immutable() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.priced_line_immutable() FROM PUBLIC;
