-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- mail_recipient_sha256(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fe2c4d71acd96c24
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.mail_recipient_sha256(address text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT encode(sha256(decode(k.pepper, 'hex') || convert_to(mail_recipient_canonical(address), 'UTF8')), 'hex') FROM mail_recipient_key k
$function$;
ALTER FUNCTION public.mail_recipient_sha256(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.mail_recipient_sha256(text) FROM PUBLIC;
