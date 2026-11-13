-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- account_key_registration_closed(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 978498a3cabb8d7c
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.account_key_registration_closed(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce((
    SELECT NOT EXISTS (SELECT 1 FROM hardware_key k WHERE k.user_id = r.user_id AND k.registered_at > r.decided_at)
      FROM hardware_key_removal r
     WHERE r.user_id = target AND r.state = 'confirmed'
     ORDER BY r.decided_at DESC, r.id DESC
     LIMIT 1), false)
$function$;
ALTER FUNCTION public.account_key_registration_closed(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.account_key_registration_closed(uuid) FROM PUBLIC;
