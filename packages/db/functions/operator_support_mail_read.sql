-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_support_mail_read(text[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: da2a6ab110478618
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_support_mail_read(refs text[])
 RETURNS TABLE(mail_ref text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(cardinality(refs), 0) > 1000 THEN
    RAISE EXCEPTION 'at most 1000 messages at a time' USING ERRCODE = 'program_limit_exceeded';
  END IF;
  RETURN QUERY SELECT r.mail_ref FROM support_mail_receipt r WHERE r.mail_ref = ANY (refs);
END;
$function$;
ALTER FUNCTION public.operator_support_mail_read(text[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_support_mail_read(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_support_mail_read(text[]) TO tp_operator;
