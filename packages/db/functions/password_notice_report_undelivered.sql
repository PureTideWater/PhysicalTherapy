-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- password_notice_report_undelivered(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b23f74d3c9743621
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.password_notice_report_undelivered(notice uuid, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  reported password_notice%ROWTYPE;
BEGIN
  UPDATE password_notice p SET undelivered_reported_at = now()
   WHERE p.id = notice AND p.undelivered_reported_at IS NULL AND p.state IN ('undelivered', 'failed')
  RETURNING p.* INTO reported;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'password_notice_undelivered', 'user', reported.user_id, 'password_changed', request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.password_notice_report_undelivered(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.password_notice_report_undelivered(uuid,text) FROM PUBLIC;
