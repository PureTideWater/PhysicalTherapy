-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_notice_report_undelivered(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c49d4f21ffd9b8d2
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_notice_report_undelivered(notice uuid, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  reported hardware_key_notice%ROWTYPE;
BEGIN
  UPDATE hardware_key_notice n SET undelivered_reported_at = now()
   WHERE n.id = notice AND n.undelivered_reported_at IS NULL AND n.state IN ('undelivered', 'failed')
  RETURNING n.* INTO reported;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'hardware_key_notice_undelivered', 'user', reported.user_id, reported.kind, request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.hardware_key_notice_report_undelivered(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_notice_report_undelivered(uuid,text) FROM PUBLIC;
