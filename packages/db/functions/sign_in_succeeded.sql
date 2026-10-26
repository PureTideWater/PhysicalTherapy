-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_succeeded(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 60e683f0dc8ba129
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.sign_in_succeeded(target_user uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  UPDATE "user" SET failed_sign_ins = 0 WHERE id = target_user AND locked_at IS NULL AND failed_sign_ins <> 0
$function$;
ALTER FUNCTION public.sign_in_succeeded(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_succeeded(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_succeeded(uuid) TO tp_app;
