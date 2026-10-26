-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_support_grants()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b335e4849f0c246b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_support_grants()
 RETURNS TABLE(support_grant_id uuid, practice_id uuid, user_id uuid, ticket text, reason text, created_at timestamp with time zone, expires_at timestamp with time zone, notified_at timestamp with time zone, reads bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.id, s.practice_id, s.user_id, s.ticket, s.reason, s.created_at, s.expires_at, s.notified_at,
         (SELECT count(*) FROM audit_event e WHERE e.grant_id = s.id AND e.action = 'read')
    FROM support_grant s
   WHERE app_actor_platform_permitted('support_grant.create')
   ORDER BY s.created_at DESC, s.id
$function$;
ALTER FUNCTION public.console_support_grants() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_support_grants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_support_grants() TO tp_app;
