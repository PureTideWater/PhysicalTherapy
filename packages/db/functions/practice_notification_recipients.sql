-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_notification_recipients()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e3494721e080025a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_notification_recipients()
 RETURNS TABLE(user_id uuid, email text, digest_email boolean, in_app boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  scope uuid[] := coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]);
BEGIN
  IF cardinality(scope) <> 1 OR app_actor_id() IS NULL OR app_actor_is_person() THEN
    RAISE EXCEPTION 'notification recipients are read by a practice job, in its one practice' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email,
           coalesce((u.settings -> 'notifications' ->> 'digest_email')::boolean, true),
           coalesce((u.settings -> 'notifications' ->> 'in_app')::boolean, true)
      FROM "user" u
     WHERE user_reaches_practice_now(u.id, scope[1])
     ORDER BY lower(u.email), u.id;
END;
$function$;
ALTER FUNCTION public.practice_notification_recipients() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_notification_recipients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_notification_recipients() TO tp_app;
