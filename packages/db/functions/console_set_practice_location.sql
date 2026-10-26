-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_set_practice_location(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7958eb1f42b77e10
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.console_set_practice_location(target uuid, zip5 text, plus_four text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  scope text := current_setting('app.practice_ids', true);
  result text;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator sets a practice''s pricing location from the console' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF zip5 IS NULL OR zip5 !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'a billing ZIP is five digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip';
  END IF;
  IF plus_four !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'a ZIP+4 is four digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip_plus_four';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.practice_ids', ARRAY[target]::text, true);
  INSERT INTO practice_site AS s (practice_id, zip, zip_plus_four, updated_by) VALUES (target, zip5, plus_four, app_actor_id())
    ON CONFLICT (practice_id) DO UPDATE SET zip = EXCLUDED.zip, zip_plus_four = EXCLUDED.zip_plus_four, updated_by = EXCLUDED.updated_by,
      confirmed_by = CASE WHEN (s.zip, s.zip_plus_four) IS NOT DISTINCT FROM (EXCLUDED.zip, EXCLUDED.zip_plus_four) THEN s.confirmed_by END,
      confirmed_at = CASE WHEN (s.zip, s.zip_plus_four) IS NOT DISTINCT FROM (EXCLUDED.zip, EXCLUDED.zip_plus_four) THEN s.confirmed_at END;
  result := practice_location_status(target, current_rule_release(), NULL, NULL);
  PERFORM set_config('app.practice_ids', coalesce(scope, '{}'), true);
  RETURN result;
END;
$function$;
ALTER FUNCTION public.console_set_practice_location(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_set_practice_location(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_set_practice_location(uuid,text,text) TO tp_app;
