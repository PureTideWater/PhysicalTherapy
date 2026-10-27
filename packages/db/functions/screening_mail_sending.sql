-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_mail_sending()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c64cb3f0f00a6d91
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_mail_sending()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce((SELECT s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL FROM mail_stream s WHERE s.stream = 'screening'), false)
$function$;
ALTER FUNCTION public.screening_mail_sending() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_mail_sending() FROM PUBLIC;
