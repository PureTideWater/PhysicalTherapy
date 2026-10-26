-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_set_location(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 26186e3c8bca1270
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_set_location(target uuid, zip5 text, plus_four text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR user_is_internal(app_actor_id())
     OR NOT coalesce(target = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
     OR NOT coalesce(app_actor_permitted(target, 'pricing_settings.set'), false)
     OR NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
    RAISE EXCEPTION 'a practice''s pricing location is set by a person of the practice who holds pricing_settings.set in it, while it is active' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF zip5 IS NULL OR zip5 !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'a billing ZIP is five digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip';
  END IF;
  IF plus_four !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'a ZIP+4 is four digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip_plus_four';
  END IF;
  INSERT INTO practice_site (practice_id, zip, zip_plus_four, updated_by, confirmed_by, confirmed_at) VALUES (target, zip5, plus_four, app_actor_id(), app_actor_id(), now())
    ON CONFLICT (practice_id) DO UPDATE SET zip = EXCLUDED.zip, zip_plus_four = EXCLUDED.zip_plus_four, updated_by = EXCLUDED.updated_by,
      confirmed_by = EXCLUDED.confirmed_by, confirmed_at = EXCLUDED.confirmed_at;
  RETURN practice_location_status(target, current_rule_release(), NULL, NULL);
END;
$function$;
ALTER FUNCTION public.practice_set_location(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_set_location(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_set_location(uuid,text,text) TO tp_app;
