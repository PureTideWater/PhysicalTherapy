-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_mail_streams()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: de3024995afee946
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_mail_streams()
 RETURNS TABLE(stream text, paused boolean, confirmed boolean, probe_due boolean, probe_missed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.stream, s.paused_at IS NOT NULL, s.ses_enabled_confirmed_at IS NOT NULL,
         s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL
           AND (s.probe_sent_at IS NULL
                OR (NOT o.outstanding AND s.probe_sent_at <= now() - interval '24 hours')
                OR (o.outstanding AND s.probe_sent_at <= now() - interval '26 hours')),
         s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL AND o.outstanding AND s.probe_sent_at <= now() - interval '26 hours'
    FROM mail_stream s,
         LATERAL (SELECT s.probe_sent_at IS NOT NULL
                         AND (coalesce(s.probe_delivered_at < s.probe_sent_at, true) OR coalesce(s.probe_bounced_at < s.probe_sent_at, true)) AS outstanding) o
   ORDER BY s.stream
$function$;
ALTER FUNCTION public.operator_mail_streams() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_mail_streams() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_mail_streams() TO tp_operator;
