-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- mail_send_expiry()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3cd6d13742c65cc1
-- Trigger function of: mail_send.mail_send_expiry
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.mail_send_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.expires_at := NEW.sent_at + CASE WHEN NEW.stream = 'screening' THEN interval '30 days' ELSE interval '90 days' END;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.mail_send_expiry() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.mail_send_expiry() FROM PUBLIC;
