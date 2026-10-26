-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_event_packet_export_attempt()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 980bc6bb1ce69ba4
-- Trigger function of: audit_event.audit_event_packet_export_attempt
CREATE OR REPLACE FUNCTION public.audit_event_packet_export_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_is_person() OR NEW.actor_kind IS DISTINCT FROM 'service' THEN
    RAISE EXCEPTION 'a packet export''s refusal or failure is recorded by the export job, never in a person''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_session_is_job() THEN
    RAISE EXCEPTION 'a packet export''s refusal or failure is recorded by the export job on the worker''s own login' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.object_type IS DISTINCT FROM 'packet_version' OR NEW.practice_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM packet_version v WHERE v.id = NEW.object_id AND v.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a packet export''s refusal or failure is of a packet version of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT coalesce(NEW.purpose = ANY (CASE WHEN NEW.action = 'packet_export_refused' THEN packet_export_refusal_codes() ELSE packet_export_failure_codes() END), false) THEN
    RAISE EXCEPTION 'a packet export''s refusal or failure names one of its codes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.audit_event_packet_export_attempt() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_event_packet_export_attempt() FROM PUBLIC;
