-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_access_log(uuid,text,uuid,timestamp with time zone,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e3a2a4b7018f631c
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.practice_access_log(target_practice uuid, of_type text, of_object uuid, before_at timestamp with time zone, at_most integer)
 RETURNS TABLE(event_id uuid, at timestamp with time zone, actor_label text, via text, action text, object_type text, object_id uuid, purpose text, ticket text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (practice_in_scope(target_practice) AND coalesce(app_actor_permitted(target_practice, 'access_log.read'), false)) THEN
    RAISE EXCEPTION 'the practice''s access log is its administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT e.id, e.at,
           CASE WHEN e.actor_kind = 'system' THEN 'the platform' WHEN u.email IS NOT NULL THEN u.email ELSE 'a job of the practice' END,
           CASE WHEN s.id IS NOT NULL THEN 'support' WHEN g.id IS NOT NULL THEN 'grant' WHEN e.actor_kind = 'user' THEN 'ownership' ELSE 'system' END,
           e.action, e.object_type, e.object_id, e.purpose, s.ticket
      FROM audit_event e
      LEFT JOIN "user" u ON u.id = e.actor_id
      LEFT JOIN support_grant s ON s.id = e.grant_id
      LEFT JOIN "grant" g ON g.id = e.grant_id
     WHERE e.practice_id = target_practice
       AND (of_type IS NULL OR e.object_type = of_type)
       AND (of_object IS NULL OR e.object_id = of_object)
       AND (before_at IS NULL OR e.at < before_at)
     ORDER BY e.at DESC, e.id DESC
     LIMIT least(greatest(coalesce(at_most, 50), 1), 200);
END;
$function$;
ALTER FUNCTION public.practice_access_log(uuid,text,uuid,timestamp with time zone,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_access_log(uuid,text,uuid,timestamp with time zone,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_access_log(uuid,text,uuid,timestamp with time zone,integer) TO tp_app;
