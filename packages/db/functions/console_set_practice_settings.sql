-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_set_practice_settings(uuid,text,jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 16e2b183396953b5
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.console_set_practice_settings(target uuid, new_zip text, new_settings jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  scope text := current_setting('app.practice_ids', true);
  changed boolean;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator sets a practice''s settings from the console' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF new_zip IS NOT NULL AND new_zip !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'a billing ZIP is five digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip';
  END IF;
  IF new_settings IS NULL OR jsonb_typeof(new_settings) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(new_settings) k WHERE NOT k = ANY (practice_setting_keys())) THEN
    RAISE EXCEPTION 'the console sets the pricing and triage settings only' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.practice_ids', ARRAY[target]::text, true);
  UPDATE practice p SET settings = (p.settings - practice_setting_keys()) || new_settings WHERE p.id = target;
  changed := FOUND;
  IF changed AND new_zip IS NOT NULL THEN
    IF NOT app_actor_is_person() THEN
      RAISE EXCEPTION 'a practice''s pricing location is set from the console by a person' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
      INSERT INTO practice_site AS s (practice_id, zip, updated_by) VALUES (target, new_zip, app_actor_id())
        ON CONFLICT (practice_id) DO UPDATE SET zip = EXCLUDED.zip, zip_plus_four = NULL, updated_by = EXCLUDED.updated_by, confirmed_by = NULL, confirmed_at = NULL
        WHERE s.zip IS DISTINCT FROM EXCLUDED.zip;
    END IF;
  END IF;
  PERFORM set_config('app.practice_ids', coalesce(scope, '{}'), true);
  RETURN changed;
END;
$function$;
ALTER FUNCTION public.console_set_practice_settings(uuid,text,jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_set_practice_settings(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_set_practice_settings(uuid,text,jsonb) TO tp_app;
