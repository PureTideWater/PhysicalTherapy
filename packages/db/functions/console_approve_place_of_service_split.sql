-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_approve_place_of_service_split(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f330f4ac65a5e2e6
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.console_approve_place_of_service_split(settings jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  created uuid;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the place-of-service split is approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO place_of_service_split (settings, approved_by) VALUES ($1, app_actor_id()) RETURNING place_of_service_split.id INTO created;
  RETURN created;
END;
$function$;
ALTER FUNCTION public.console_approve_place_of_service_split(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_approve_place_of_service_split(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_approve_place_of_service_split(jsonb) TO tp_app;
