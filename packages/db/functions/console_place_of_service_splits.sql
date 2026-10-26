-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_place_of_service_splits()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 43a1900cd1033483
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.console_place_of_service_splits()
 RETURNS TABLE(id uuid, settings jsonb, approved_by uuid, approved_by_email text, approved_at timestamp with time zone, in_force boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the place-of-service split is read and approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.id, s.settings, s.approved_by, u.email, s.approved_at, row_number() OVER (ORDER BY s.approved_at DESC, s.id DESC) = 1
      FROM place_of_service_split s LEFT JOIN "user" u ON u.id = s.approved_by
     ORDER BY s.approved_at DESC, s.id DESC
     LIMIT 50;
END;
$function$;
ALTER FUNCTION public.console_place_of_service_splits() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_place_of_service_splits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_place_of_service_splits() TO tp_app;
