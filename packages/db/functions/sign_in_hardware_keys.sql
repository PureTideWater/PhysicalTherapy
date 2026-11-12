-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_hardware_keys(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3707a0fb772964b5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.sign_in_hardware_keys(target_user uuid)
 RETURNS TABLE(credential_sha256 bytea, public_key bytea, removed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT k.credential_sha256, CASE WHEN k.removed_at IS NULL THEN k.public_key END, k.removed_at IS NOT NULL
    FROM hardware_key k
   WHERE k.user_id = target_user
   ORDER BY k.registered_at, k.id
$function$;
ALTER FUNCTION public.sign_in_hardware_keys(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_hardware_keys(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_hardware_keys(uuid) TO tp_app;
