-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_account(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1a888c9484d2ed7a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.sign_in_account(by_email text, by_sub text)
 RETURNS TABLE(user_id uuid, cognito_sub text, email text, status text, mfa_enrolled boolean, locked boolean, hardware_key_required boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT u.id, u.cognito_sub, u.email, u.status, u.mfa_enrolled, u.locked_at IS NOT NULL,
         u.hardware_key_required OR user_is_internal(u.id)
    FROM "user" u
   WHERE (by_email IS NOT NULL AND lower(u.email) = lower(by_email))
      OR (by_sub IS NOT NULL AND u.cognito_sub = by_sub)
   LIMIT 1
$function$;
ALTER FUNCTION public.sign_in_account(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_account(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_account(text,text) TO tp_app;
