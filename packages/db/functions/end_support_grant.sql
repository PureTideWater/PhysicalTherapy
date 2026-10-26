-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- end_support_grant(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 81470c8d2b42a2b3
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.end_support_grant(target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  g support_grant%ROWTYPE;
  scope text := current_setting('app.practice_ids', true);
BEGIN
  SELECT * INTO g FROM support_grant s WHERE s.id = target;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF app_actor_id() IS NULL OR NOT (app_actor_platform_permitted('support_grant.create') OR g.user_id = app_actor_id()) THEN
    RAISE EXCEPTION 'only a platform administrator or its engineer ends a support grant' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (now() < g.expires_at AND now() < g.created_at + interval '4 hours') THEN
    RETURN false;
  END IF;
  -- The owner writes a PHI table only inside the practice's scope; the caller's scope is restored.
  PERFORM set_config('app.practice_ids', ARRAY[g.practice_id]::text, true);
  UPDATE support_grant s SET expires_at = now() WHERE s.id = target;
  PERFORM set_config('app.practice_ids', coalesce(scope, '{}'), true);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.end_support_grant(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.end_support_grant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_support_grant(uuid) TO tp_app;
