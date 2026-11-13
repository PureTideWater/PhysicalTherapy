-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_removals()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0eaee3a958e645f9
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_removals()
 RETURNS TABLE(removal_id uuid, user_id uuid, requested_by uuid, requested_at timestamp with time zone, expires_at timestamp with time zone, state text, decided_by uuid, decided_at timestamp with time zone, live_keys integer, registration_open_until timestamp with time zone, registration_closed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator lists key removals' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT r.id, r.user_id, r.requested_by, r.requested_at, r.expires_at, r.state, r.decided_by, r.decided_at,
           (SELECT count(*)::integer FROM hardware_key k WHERE k.user_id = r.user_id AND k.removed_at IS NULL),
           r.registration_open_until, account_key_registration_closed(r.user_id)
      FROM hardware_key_removal r
     WHERE r.state = 'requested' OR r.decided_at > now() - interval '30 days'
     ORDER BY r.requested_at DESC, r.id;
END;
$function$;
ALTER FUNCTION public.hardware_key_removals() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_removals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_removals() TO tp_app;
