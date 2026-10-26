-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_event_packet_download()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5d9ff171f092c4f1
-- Trigger function of: audit_event.audit_event_packet_download
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.audit_event_packet_download()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_session_is_job() THEN
    RAISE EXCEPTION 'a packet export''s download is recorded by the web request that served it, never on the worker''s login' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_actor_is_person() OR NEW.actor_kind IS DISTINCT FROM 'user' OR NEW.actor_id IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a packet export''s download is recorded for the person it was served to, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.practice_id IS NULL OR NOT practice_in_scope(NEW.practice_id)
     OR NOT (coalesce(app_actor_permitted(NEW.practice_id, 'phi.export'), false) OR coalesce(app_actor_permitted(NEW.practice_id, 'audit_finding.validate'), false)) THEN
    RAISE EXCEPTION 'a packet export''s download is recorded for a person who may read the export' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.object_type IS DISTINCT FROM 'packet_version' OR NEW.purpose IS DISTINCT FROM 'line_export'
     OR NOT EXISTS (SELECT 1 FROM packet_version v WHERE v.id = NEW.object_id AND v.practice_id = NEW.practice_id AND v.exported_at IS NOT NULL) THEN
    RAISE EXCEPTION 'a packet export''s download is of an exported packet version of its practice, as a line-level export' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.audit_event_packet_download() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_event_packet_download() FROM PUBLIC;
