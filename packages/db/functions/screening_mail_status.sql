-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_mail_status()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ac5037be1bd34766
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_mail_status()
 RETURNS TABLE(paused boolean, ready boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(bool_or(s.paused_at IS NOT NULL), true),
         coalesce(bool_or(screening_mail_sending()
                          AND s.probe_delivered_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity'))
                          AND s.probe_bounced_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity'))), false)
    FROM mail_stream s WHERE s.stream = 'screening'
$function$;
ALTER FUNCTION public.screening_mail_status() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_mail_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_mail_status() TO tp_app;
