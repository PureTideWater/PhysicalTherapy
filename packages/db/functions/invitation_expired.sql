-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- invitation_expired(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0e48c829be83ab97
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.invitation_expired(target_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = target_user AND u.status = 'invited')
     AND EXISTS (SELECT 1 FROM invitation i WHERE i.user_id = target_user AND i.accepted_at IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM invitation i JOIN membership m ON m.id = i.membership_id
        WHERE i.user_id = target_user AND i.accepted_at IS NULL AND i.expires_at > now() AND (m.ends_at IS NULL OR m.ends_at > now())
     )
$function$;
ALTER FUNCTION public.invitation_expired(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.invitation_expired(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_expired(uuid) TO tp_app;
