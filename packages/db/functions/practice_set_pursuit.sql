-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_set_pursuit(uuid,text,integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8ba449fb1c3926ee
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_set_pursuit(target uuid, staff_rate_cents text, packet_minutes integer, follow_up_minutes integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person()
     OR NOT practice_in_scope(target)
     OR NOT coalesce(app_actor_permitted(target, 'case.work'), false) THEN
    RAISE EXCEPTION 'a practice''s pursuit defaults are set by a person who works its cases' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (staff_rate_cents IS NULL) <> (packet_minutes IS NULL) OR (staff_rate_cents IS NULL) <> (follow_up_minutes IS NULL) THEN
    RAISE EXCEPTION 'the pursuit cost needs the staff rate and both times together, or none of them' USING ERRCODE = 'check_violation';
  END IF;
  IF staff_rate_cents IS NULL THEN
    UPDATE practice p SET settings = p.settings - ARRAY['staff_rate_cents_per_hour', 'minutes_per_packet', 'minutes_per_follow_up'] WHERE p.id = target;
    RETURN FOUND;
  END IF;
  IF staff_rate_cents !~ '^(0|[1-9][0-9]{0,11})$' OR packet_minutes NOT BETWEEN 0 AND 10000 OR follow_up_minutes NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'the staff rate is integer cents an hour and each time whole minutes up to 10,000' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE practice p SET settings = p.settings || jsonb_build_object('staff_rate_cents_per_hour', staff_rate_cents, 'minutes_per_packet', packet_minutes, 'minutes_per_follow_up', follow_up_minutes)
   WHERE p.id = target;
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION public.practice_set_pursuit(uuid,text,integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_set_pursuit(uuid,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_set_pursuit(uuid,text,integer,integer) TO tp_app;
