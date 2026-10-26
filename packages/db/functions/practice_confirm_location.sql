-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_confirm_location(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: cf9ad079d556842b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_confirm_location(target uuid, shown_zip text, shown_zip_plus_four text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  stored_zip text;
  stored_plus_four text;
  standing text;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR user_is_internal(app_actor_id())
     OR NOT coalesce(target = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
     OR NOT coalesce(app_actor_permitted(target, 'pricing_settings.set'), false)
     OR NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
    RAISE EXCEPTION 'a practice''s pricing location is confirmed by a person of the practice who holds pricing_settings.set in it, while it is active' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Locked before it is read: a change holding the row (the console's) commits first and this reads the row as it then
  -- stands; a change that comes later waits for this transaction, and clears the confirmation if it moves the ZIP or
  -- ZIP+4. The status below and the update read the same locked row.
  SELECT s.zip, s.zip_plus_four INTO stored_zip, stored_plus_four FROM practice_site s WHERE s.practice_id = target FOR UPDATE;
  IF FOUND AND (stored_zip, stored_plus_four) IS DISTINCT FROM (shown_zip, shown_zip_plus_four) THEN
    RAISE EXCEPTION 'a practice''s pricing location is confirmed only as the person was shown it, and it changed since' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_changed';
  END IF;
  standing := practice_location_status(target, current_rule_release(), NULL, NULL);
  IF standing IS DISTINCT FROM 'ready' AND standing IS DISTINCT FROM 'locality_not_loaded' THEN
    RAISE EXCEPTION 'a practice''s pricing location is confirmed only while it leaves nothing to change' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_settled';
  END IF;
  UPDATE practice_site s SET confirmed_by = app_actor_id(), confirmed_at = now() WHERE s.practice_id = target;
  RETURN standing;
END;
$function$;
ALTER FUNCTION public.practice_confirm_location(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_confirm_location(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_confirm_location(uuid,text,text) TO tp_app;
