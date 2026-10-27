-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_mail_gate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f13944487e4f314a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_mail_gate()
 RETURNS TABLE(sending boolean, resumed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT screening_mail_sending(), (SELECT s.resumed_at FROM mail_stream s WHERE s.stream = 'screening')
$function$;
ALTER FUNCTION public.screening_mail_gate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_mail_gate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_mail_gate() TO tp_screening;
