-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_contact_refused(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 276bb32fa4777583
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_contact_refused(address text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM screening_mail_refusal f WHERE f.recipient_sha256 = mail_recipient_sha256($1) AND f.expires_at > now())
$function$;
ALTER FUNCTION public.screening_contact_refused(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_contact_refused(text) FROM PUBLIC;
