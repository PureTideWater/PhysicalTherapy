-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_event_packet_export_requested()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 41846c4e697780b0
-- Trigger function of: audit_event.audit_event_packet_export_requested
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.audit_event_packet_export_requested()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_session_is_job() OR NOT app_actor_is_person() OR NEW.actor_kind IS DISTINCT FROM 'user' OR NEW.actor_id IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a packet export is requested by a person, in their own name, never on the worker''s login' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.practice_id IS NULL OR NOT practice_in_scope(NEW.practice_id) OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'phi.export'), false) THEN
    RAISE EXCEPTION 'a packet export is requested by a person who may export PHI in its practice' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.object_type IS DISTINCT FROM 'packet_version'
     OR NOT EXISTS (SELECT 1 FROM packet_version v WHERE v.id = NEW.object_id AND v.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a packet export is requested of a packet version of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.audit_event_packet_export_requested() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_event_packet_export_requested() FROM PUBLIC;
