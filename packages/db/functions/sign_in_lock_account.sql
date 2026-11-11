-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_lock_account()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e253a269dce1b3be
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.sign_in_lock_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM 1 FROM "user" u WHERE u.id = app_actor_id() FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only an account locks its own row for sign-in' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$function$;
ALTER FUNCTION public.sign_in_lock_account() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_lock_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_lock_account() TO tp_app;
