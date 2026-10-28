-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- mail_recipient_canonical(text,boolean)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 72aaa3efc513682c
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.mail_recipient_canonical(address text, keep_tag boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  as_read text := lower(btrim(coalesce(address, ''), E' \t\n\r\f' || chr(11)) COLLATE "C");
  last_at integer;
  local_part text;
  domain_part text;
  mailbox_part text;
BEGIN
  IF as_read ~ '[^\x01-\x7F]' THEN
    RETURN as_read;
  END IF;
  -- The last @, counted from the end.
  last_at := strpos(reverse(as_read), '@');
  IF last_at = 0 THEN
    RETURN as_read;
  END IF;
  local_part := left(as_read, length(as_read) - last_at);
  domain_part := rtrim(right(as_read, last_at - 1), '.');
  IF local_part = '' OR domain_part = '' THEN
    RETURN as_read;
  END IF;
  IF domain_part = 'googlemail.com' THEN
    domain_part := 'gmail.com';
  ELSIF domain_part IN ('me.com', 'mac.com') THEN
    domain_part := 'icloud.com';
  END IF;
  mailbox_part := CASE WHEN keep_tag AND domain_part <> 'gmail.com' THEN local_part ELSE split_part(local_part, '+', 1) END;
  IF domain_part = 'gmail.com' THEN
    mailbox_part := replace(mailbox_part, '.', '');
  END IF;
  RETURN CASE WHEN mailbox_part = '' THEN local_part ELSE mailbox_part END || '@' || domain_part;
END;
$function$;
ALTER FUNCTION public.mail_recipient_canonical(text,boolean) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.mail_recipient_canonical(text,boolean) FROM PUBLIC;
