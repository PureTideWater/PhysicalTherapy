-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- unlock_user(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dcb9d4ff9b6626f1
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.unlock_user(target_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator unlocks an account' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "user" SET failed_sign_ins = 0, locked_at = NULL WHERE id = target_user AND locked_at IS NOT NULL;
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION public.unlock_user(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.unlock_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_user(uuid) TO tp_app;
