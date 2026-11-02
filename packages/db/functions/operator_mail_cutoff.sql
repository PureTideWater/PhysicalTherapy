-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_mail_cutoff(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: aec6c3e8b9262b47
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_mail_cutoff(request text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT mail_stream_cutoff($1)
$function$;
ALTER FUNCTION public.operator_mail_cutoff(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_mail_cutoff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_mail_cutoff(text) TO tp_operator;
